use std::path::PathBuf;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use thynk_core::{Note, NoteStorage};

use crate::routes::auth::AuthUser;
use crate::routes::links::extract_wiki_link_titles;
use crate::state::{AppState, WsEvent};

/// Convert a title to a filesystem path, preserving `/` as directory separators.
/// Each path component is sanitized by stripping only characters that are invalid
/// on Linux filesystems (null bytes and control characters). Unicode, spaces,
/// accents, CJK, emoji, etc. are all preserved.
fn title_to_path(title: &str) -> String {
    let parts: Vec<&str> = title.split('/').collect();
    let sanitized: Vec<String> = parts
        .iter()
        .map(|component| {
            let cleaned: String = component
                .chars()
                .filter(|c| *c != '\0' && !c.is_control())
                .collect();
            let cleaned = cleaned.trim().to_string();
            if cleaned.is_empty() {
                "untitled".to_string()
            } else {
                cleaned
            }
        })
        .collect();
    format!("{}.md", sanitized.join("/"))
}

// ── Error helpers ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

fn err(status: StatusCode, error: &str, message: &str) -> impl IntoResponse {
    (
        status,
        Json(ErrorResponse {
            error: error.to_string(),
            message: message.to_string(),
        }),
    )
}

// ── GET /api/notes ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListNotesQuery {
    pub prefix: Option<String>,
}

pub async fn list_notes(
    State(state): State<AppState>,
    Query(query): Query<ListNotesQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_notes() {
        Ok(notes) => {
            let filtered = if let Some(ref prefix) = query.prefix {
                notes
                    .into_iter()
                    .filter(|n| n.path.to_string_lossy().starts_with(prefix.as_str()))
                    .collect()
            } else {
                notes
            };
            (
                StatusCode::OK,
                Json(serde_json::to_value(filtered).unwrap()),
            )
                .into_response()
        }
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

// ── GET /api/notes/:id ───────────────────────────────────────────────────────

pub async fn get_note(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    let mut note = match storage.read_note(&meta.path) {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    // Fill in metadata from DB (storage only knows content+path).
    note.id = meta.id;
    note.title = meta.title;
    note.content_hash = meta.content_hash;
    note.created_at = meta.created_at;
    note.updated_at = meta.updated_at;
    (StatusCode::OK, Json(serde_json::to_value(note).unwrap())).into_response()
}

// ── POST /api/notes ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    #[serde(default)]
    pub content: String,
    pub path: Option<String>,
}

pub async fn create_note(
    State(state): State<AppState>,
    Json(body): Json<CreateNoteRequest>,
) -> impl IntoResponse {
    let path = body.path.unwrap_or_else(|| title_to_path(&body.title));
    // If path ends with '/', it's a directory — append "untitled.md".
    let path = if path.ends_with('/') {
        format!("{path}untitled.md")
    } else {
        path
    };

    // Ensure unique path by appending timestamp suffix if needed.
    let storage = state.storage.lock().await;
    let final_path = {
        let candidate = PathBuf::from(&path);
        if storage.exists(&candidate) {
            let stem = candidate
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let ts = chrono::Utc::now().timestamp_millis();
            let new_name = format!("{stem}-{ts}.md");
            match candidate.parent() {
                Some(parent) if parent != std::path::Path::new("") => {
                    parent.join(new_name).to_string_lossy().to_string()
                }
                _ => new_name,
            }
        } else {
            path
        }
    };

    let note = Note::new(body.title, body.content, PathBuf::from(&final_path));

    if let Err(e) = storage.write_note(&note) {
        return err(StatusCode::BAD_REQUEST, "write_error", &e.to_string()).into_response();
    }
    drop(storage);

    let db = state.db.lock().await;
    if let Err(e) = db.index_note(&note) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    (
        StatusCode::CREATED,
        Json(serde_json::to_value(&note).unwrap()),
    )
        .into_response()
}

// ── PUT /api/notes/:id ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpdateNoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub path: Option<String>,
}

pub async fn update_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<UpdateNoteRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    // Check if the note is locked by a different user.
    {
        let now = chrono::Utc::now().to_rfc3339();
        if let Ok(Some(lock)) = db.get_lock(&id) {
            if lock.expires_at > now && lock.user_id != auth_user.username {
                return (
                    StatusCode::from_u16(423).unwrap(),
                    Json(serde_json::json!({
                        "error": "locked",
                        "message": format!("note is locked by {}", lock.user_id)
                    })),
                )
                    .into_response();
            }
        }
    }

    // Optimistic concurrency: check If-Match header against current content_hash.
    if let Some(if_match) = headers.get("if-match") {
        let expected = if_match.to_str().unwrap_or("").trim_matches('"');
        if expected != meta.content_hash {
            return err(
                StatusCode::PRECONDITION_FAILED,
                "conflict",
                "note has been modified since you last fetched it",
            )
            .into_response();
        }
    }

    let storage = state.storage.lock().await;
    let mut note = match storage.read_note(&meta.path) {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    // Fill in metadata from DB (storage only knows content+path).
    note.id = meta.id.clone();
    note.title = meta.title.clone();
    note.created_at = meta.created_at;
    note.updated_at = meta.updated_at;

    // Auto-rename file based on new title (if no explicit path change requested).
    if body.path.is_none() {
        if let Some(ref new_title) = body.title {
            let new_path = PathBuf::from(title_to_path(new_title));
            if new_path != note.path && !storage.exists(&new_path) {
                let _ = storage.delete_note(&note.path);
                note.path = new_path;
            }
        }
    }

    if let Some(title) = body.title {
        note.title = title;
    }
    if let Some(content) = body.content {
        note.content = content;
        note.update_hash();
    }
    if let Some(path) = body.path {
        let _ = storage.delete_note(&note.path);
        note.path = PathBuf::from(path);
    }
    note.updated_at = chrono::Utc::now();

    let editor_name = auth_user.display_name.unwrap_or(auth_user.username);
    note.last_updated_by = Some(editor_name);

    if let Err(e) = storage.write_note(&note) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "storage_error",
            &e.to_string(),
        )
        .into_response();
    }
    drop(storage);

    if let Err(e) = db.index_note(&note) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    // Extract wiki-links from content and update the link graph.
    let link_titles = extract_wiki_link_titles(&note.content);
    let all_notes = db.list_notes().unwrap_or_default();
    let to_ids: Vec<String> = link_titles
        .iter()
        .filter_map(|title| {
            all_notes
                .iter()
                .find(|n| n.title.eq_ignore_ascii_case(title))
                .map(|n| n.id.clone())
        })
        .collect();
    // Ignore errors from link extraction — it's non-critical.
    let _ = db.set_note_links(&note.id, &to_ids);

    // Automation: broadcast StatusChanged when note status becomes "done".
    if let Some(status) = extract_frontmatter_status(&note.content) {
        if status.eq_ignore_ascii_case("done") {
            let _ = state.events.send(WsEvent::StatusChanged {
                note_id: note.id.clone(),
                title: note.title.clone(),
                status,
            });
        }
    }

    (StatusCode::OK, Json(serde_json::to_value(&note).unwrap())).into_response()
}

/// Extract the `status` field from YAML frontmatter (--- ... ---) if present.
fn extract_frontmatter_status(content: &str) -> Option<String> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let frontmatter = &rest[..end];
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("status:") {
            let status = val.trim().trim_matches('"').trim_matches('\'').to_string();
            if !status.is_empty() {
                return Some(status);
            }
        }
    }
    None
}

// ── DELETE /api/notes/:id ────────────────────────────────────────────────────

pub async fn delete_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    let _ = storage.delete_note(&meta.path);
    drop(storage);

    if let Err(e) = db.delete_note(&id) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_title_to_path_simple() {
        assert_eq!(title_to_path("My Note"), "My Note.md");
    }

    #[test]
    fn test_title_to_path_preserves_slash_as_dir_separator() {
        assert_eq!(title_to_path("foo/bar"), "foo/bar.md");
    }

    #[test]
    fn test_title_to_path_unicode() {
        assert_eq!(title_to_path("Résumé Notes"), "Résumé Notes.md");
    }

    #[test]
    fn test_title_to_path_cjk_with_dir() {
        assert_eq!(title_to_path("日本語/メモ"), "日本語/メモ.md");
    }

    #[test]
    fn test_title_to_path_empty_component_becomes_untitled() {
        assert_eq!(title_to_path(""), "untitled.md");
    }

    #[test]
    fn test_title_to_path_strips_control_chars() {
        // null byte and control chars should be stripped
        assert_eq!(title_to_path("note\0name"), "notename.md");
    }

    #[test]
    fn test_title_to_path_trailing_slash_creates_untitled() {
        // trailing slash = directory, append untitled
        assert_eq!(title_to_path("folder/"), "folder/untitled.md");
    }
}
