use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::SystemTime,
};

use axum::{
    Json, Router,
    extract::{Path as AxumPath, Query, Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use thiserror::Error;
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
struct AppState {
    notes_dir: PathBuf,
    token: Arc<str>,
}

#[derive(Debug, Error)]
enum AppError {
    #[error("not found")]
    NotFound,
    #[error("invalid request: {0}")]
    BadRequest(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let bind = env::var("THYNK_BIND").unwrap_or_else(|_| "127.0.0.1:3789".to_string());
    let workspace = PathBuf::from(
        env::var("THYNK_WORKSPACE").unwrap_or_else(|_| ".thynk/workspace".to_string()),
    );
    let web_dist =
        PathBuf::from(env::var("THYNK_WEB_DIST").unwrap_or_else(|_| "apps/web/dist".to_string()));
    let token = auth_token()?;

    let notes_dir = workspace.join("notes");
    fs::create_dir_all(&notes_dir)?;
    seed_workspace(&notes_dir)?;

    let state = AppState {
        notes_dir,
        token: Arc::from(token),
    };

    let protected_api = Router::new()
        .route("/notes", get(list_notes).post(create_note))
        .route("/notes/{slug}", get(get_note).put(save_note))
        .route("/search", get(search_notes))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    let api = Router::new()
        .route("/health", get(health))
        .merge(protected_api)
        .with_state(state);

    let static_service =
        ServeDir::new(&web_dist).fallback(ServeFile::new(web_dist.join("index.html")));
    let app = Router::new()
        .nest("/api", api)
        .fallback_service(static_service);

    let listener = tokio::net::TcpListener::bind(bind.parse::<SocketAddr>()?).await?;
    println!(
        "thynk server listening on http://{}",
        listener.local_addr()?
    );
    axum::serve(listener, app).await?;

    Ok(())
}

fn auth_token() -> Result<String, Box<dyn std::error::Error>> {
    if let Ok(token) = env::var("THYNK_ACCESS_TOKEN")
        && !token.trim().is_empty()
    {
        return Ok(token);
    }

    if env::var("THYNK_DEV_AUTH").ok().as_deref() == Some("1") {
        eprintln!("THYNK_DEV_AUTH=1: using local-dev-token for loopback development only");
        return Ok("local-dev-token".to_string());
    }

    Err("THYNK_ACCESS_TOKEN is required unless THYNK_DEV_AUTH=1 is set".into())
}

async fn require_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = format!("Bearer {}", state.token);
    let authorized = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == expected);

    if authorized {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

#[derive(Debug, Serialize, Clone)]
struct NoteSummary {
    slug: String,
    title: String,
    path: String,
    tags: Vec<String>,
    updated_at: String,
    links: Vec<String>,
    backlinks: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
struct NoteDetail {
    slug: String,
    title: String,
    path: String,
    content: String,
    frontmatter: Map<String, Value>,
    tags: Vec<String>,
    updated_at: String,
    links: Vec<String>,
    backlinks: Vec<String>,
}

#[derive(Debug, Clone)]
struct NoteRecord {
    slug: String,
    title: String,
    path: PathBuf,
    content: String,
    frontmatter: Map<String, Value>,
    tags: Vec<String>,
    updated_at: String,
    links: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CreateNoteRequest {
    title: String,
    content: Option<String>,
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct SaveNoteRequest {
    content: String,
}

#[derive(Debug, Deserialize)]
struct SearchRequest {
    q: Option<String>,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    slug: String,
    title: String,
    excerpt: String,
    tags: Vec<String>,
}

async fn list_notes(State(state): State<AppState>) -> Result<Json<Vec<NoteSummary>>, AppError> {
    let notes = read_notes(&state.notes_dir)?;
    Ok(Json(note_summaries(&notes)))
}

async fn get_note(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
) -> Result<Json<NoteDetail>, AppError> {
    let notes = read_notes(&state.notes_dir)?;
    let safe_slug = safe_slug(&slug)?;
    let note = notes
        .iter()
        .find(|note| note.slug == safe_slug)
        .ok_or(AppError::NotFound)?;

    Ok(Json(note_detail(note, &notes)))
}

async fn create_note(
    State(state): State<AppState>,
    Json(request): Json<CreateNoteRequest>,
) -> Result<Json<NoteDetail>, AppError> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title is required".to_string()));
    }

    let existing = read_notes(&state.notes_dir)?;
    let slug = unique_slug(title, &existing);
    let tags = request.tags.unwrap_or_default();
    let content = request
        .content
        .unwrap_or_else(|| default_note_content(title, &tags));
    let path = state.notes_dir.join(format!("{slug}.md"));
    fs::write(&path, content)?;

    let notes = read_notes(&state.notes_dir)?;
    let note = notes
        .iter()
        .find(|note| note.slug == slug)
        .ok_or(AppError::NotFound)?;

    Ok(Json(note_detail(note, &notes)))
}

async fn save_note(
    State(state): State<AppState>,
    AxumPath(slug): AxumPath<String>,
    Json(request): Json<SaveNoteRequest>,
) -> Result<Json<NoteDetail>, AppError> {
    let safe_slug = safe_slug(&slug)?;
    let path = state.notes_dir.join(format!("{safe_slug}.md"));
    if !path.exists() {
        return Err(AppError::NotFound);
    }

    fs::write(path, request.content)?;
    let notes = read_notes(&state.notes_dir)?;
    let note = notes
        .iter()
        .find(|note| note.slug == safe_slug)
        .ok_or(AppError::NotFound)?;

    Ok(Json(note_detail(note, &notes)))
}

async fn search_notes(
    State(state): State<AppState>,
    Query(request): Query<SearchRequest>,
) -> Result<Json<Vec<SearchResult>>, AppError> {
    let query = request.q.unwrap_or_default().trim().to_lowercase();
    if query.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let results = read_notes(&state.notes_dir)?
        .into_iter()
        .filter(|note| note_matches(note, &query))
        .map(|note| SearchResult {
            excerpt: excerpt(&note.content, &query),
            slug: note.slug,
            title: note.title,
            tags: note.tags,
        })
        .collect();

    Ok(Json(results))
}

fn read_notes(notes_dir: &Path) -> Result<Vec<NoteRecord>, AppError> {
    let mut notes = Vec::new();
    for entry in fs::read_dir(notes_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("md") {
            continue;
        }

        let content = fs::read_to_string(&path)?;
        let slug = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(ToString::to_string)
            .ok_or_else(|| AppError::BadRequest("note path has no stem".to_string()))?;
        let (frontmatter, body) = parse_frontmatter(&content);
        let title = note_title(&frontmatter, body, &slug);
        let tags = note_tags(&frontmatter);
        let updated_at = updated_at(&path)?;
        let links = extract_wiki_links(&content);

        notes.push(NoteRecord {
            slug,
            title,
            path,
            content,
            frontmatter,
            tags,
            updated_at,
            links,
        });
    }

    notes.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(notes)
}

fn note_summaries(notes: &[NoteRecord]) -> Vec<NoteSummary> {
    let backlinks = backlinks_by_slug(notes);
    notes
        .iter()
        .map(|note| NoteSummary {
            slug: note.slug.clone(),
            title: note.title.clone(),
            path: display_path(&note.path),
            tags: note.tags.clone(),
            updated_at: note.updated_at.clone(),
            links: note.links.clone(),
            backlinks: backlinks.get(&note.slug).cloned().unwrap_or_default(),
        })
        .collect()
}

fn note_detail(note: &NoteRecord, notes: &[NoteRecord]) -> NoteDetail {
    let backlinks = backlinks_by_slug(notes);
    NoteDetail {
        slug: note.slug.clone(),
        title: note.title.clone(),
        path: display_path(&note.path),
        content: note.content.clone(),
        frontmatter: note.frontmatter.clone(),
        tags: note.tags.clone(),
        updated_at: note.updated_at.clone(),
        links: note.links.clone(),
        backlinks: backlinks.get(&note.slug).cloned().unwrap_or_default(),
    }
}

fn backlinks_by_slug(notes: &[NoteRecord]) -> BTreeMap<String, Vec<String>> {
    let mut backlinks: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut targets = BTreeMap::new();
    for note in notes {
        targets.insert(note.slug.clone(), note.slug.clone());
        targets.insert(slugify(&note.title), note.slug.clone());
    }

    for note in notes {
        for link in &note.links {
            let normalized = slugify(link);
            let target = targets.get(&normalized).unwrap_or(&normalized);
            backlinks
                .entry(target.clone())
                .or_default()
                .insert(note.slug.clone());
        }
    }

    backlinks
        .into_iter()
        .map(|(slug, links)| (slug, links.into_iter().collect()))
        .collect()
}

fn parse_frontmatter(content: &str) -> (Map<String, Value>, &str) {
    let Some(rest) = content.strip_prefix("---\n") else {
        return (Map::new(), content);
    };
    let Some(end) = rest.find("\n---\n") else {
        return (Map::new(), content);
    };

    let raw_frontmatter = &rest[..end];
    let body = &rest[end + "\n---\n".len()..];
    let mut frontmatter = Map::new();

    for line in raw_frontmatter.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() {
            continue;
        }

        if value.starts_with('[') && value.ends_with(']') {
            let values = value
                .trim_start_matches('[')
                .trim_end_matches(']')
                .split(',')
                .map(|item| item.trim().trim_matches('"').to_string())
                .filter(|item| !item.is_empty())
                .map(Value::String)
                .collect::<Vec<_>>();
            frontmatter.insert(key.to_string(), Value::Array(values));
        } else {
            frontmatter.insert(
                key.to_string(),
                Value::String(value.trim_matches('"').to_string()),
            );
        }
    }

    (frontmatter, body)
}

fn note_title(frontmatter: &Map<String, Value>, body: &str, slug: &str) -> String {
    if let Some(title) = frontmatter.get("title").and_then(Value::as_str) {
        return title.to_string();
    }

    body.lines()
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|title| !title.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| title_from_slug(slug))
}

fn note_tags(frontmatter: &Map<String, Value>) -> Vec<String> {
    match frontmatter.get("tags") {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect(),
        Some(Value::String(value)) => value
            .split(',')
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn extract_wiki_links(content: &str) -> Vec<String> {
    let mut links = BTreeSet::new();
    let mut rest = content;

    while let Some(start) = rest.find("[[") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("]]") else {
            break;
        };
        let link = after_start[..end]
            .split('|')
            .next()
            .unwrap_or_default()
            .trim();
        if !link.is_empty() {
            links.insert(link.to_string());
        }
        rest = &after_start[end + 2..];
    }

    links.into_iter().collect()
}

fn note_matches(note: &NoteRecord, query: &str) -> bool {
    note.title.to_lowercase().contains(query)
        || note.content.to_lowercase().contains(query)
        || note
            .tags
            .iter()
            .any(|tag| tag.to_lowercase().contains(query))
}

fn excerpt(content: &str, query: &str) -> String {
    let content_lower = content.to_lowercase();
    let Some(index) = content_lower.find(query) else {
        return content
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or_default()
            .chars()
            .take(180)
            .collect();
    };

    let start = index.saturating_sub(70);
    let end = (index + query.len() + 110).min(content.len());
    content[start..end].replace('\n', " ")
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn updated_at(path: &Path) -> Result<String, AppError> {
    let modified = path
        .metadata()?
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let modified: DateTime<Utc> = modified.into();
    Ok(modified.to_rfc3339())
}

fn default_note_content(title: &str, tags: &[String]) -> String {
    let tags = tags
        .iter()
        .map(|tag| format!("\"{}\"", tag.replace('"', "")))
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        "---\ntitle: \"{}\"\ntags: [{}]\n---\n\n# {}\n\n",
        title.replace('"', ""),
        tags,
        title
    )
}

fn title_from_slug(slug: &str) -> String {
    slug.split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for character in input.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_dash = false;
        } else if matches!(character, ' ' | '-' | '_' | '/') && !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        "note".to_string()
    } else {
        slug
    }
}

fn safe_slug(input: &str) -> Result<String, AppError> {
    let slug = slugify(input);
    if slug != input {
        return Err(AppError::BadRequest("invalid note slug".to_string()));
    }
    Ok(slug)
}

fn unique_slug(title: &str, existing: &[NoteRecord]) -> String {
    let base = slugify(title);
    let existing = existing
        .iter()
        .map(|note| note.slug.as_str())
        .collect::<BTreeSet<_>>();

    if !existing.contains(base.as_str()) {
        return base;
    }

    for index in 2.. {
        let candidate = format!("{base}-{index}");
        if !existing.contains(candidate.as_str()) {
            return candidate;
        }
    }

    unreachable!("unbounded integer loop always returns")
}

fn seed_workspace(notes_dir: &Path) -> Result<(), AppError> {
    if fs::read_dir(notes_dir)?.next().is_some() {
        return Ok(());
    }

    fs::write(
        notes_dir.join("welcome.md"),
        r#"---
title: "Welcome to Thynk"
tags: ["thynk", "notes"]
---

# Welcome to Thynk

Thynk stores Markdown notes on the filesystem and keeps structured metadata in frontmatter.

This first workspace links to [[Project Notes]] so backlinks have real data immediately.
"#,
    )?;
    fs::write(
        notes_dir.join("project-notes.md"),
        r#"---
title: "Project Notes"
tags: ["thynk", "planning"]
---

# Project Notes

Use this note for early workspace planning.

Linked from [[Welcome to Thynk]].
"#,
    )?;

    Ok(())
}
