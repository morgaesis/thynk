use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use thynk_core::NoteStorage;

use crate::state::AppState;

// ── Error helpers ─────────────────────────────────────────────────────────────

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

// ── Wiki-link extraction ──────────────────────────────────────────────────────

/// Extract all `[[title]]` references from content, returning unique sorted titles.
/// Parses `[[...]]` without depending on the `regex` crate.
pub fn extract_wiki_link_titles(content: &str) -> Vec<String> {
    let mut titles: Vec<String> = Vec::new();
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i + 1 < len {
        // Look for `[[`
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            i += 2;
            let start = i;
            // Scan for `]]` – stop on `[` or newline to avoid runaway matches
            let mut found_end = false;
            while i + 1 < len {
                if bytes[i] == b']' && bytes[i + 1] == b']' {
                    found_end = true;
                    break;
                }
                if bytes[i] == b'[' || bytes[i] == b'\n' {
                    break;
                }
                i += 1;
            }
            if found_end {
                let title = content[start..i].trim().to_string();
                if !title.is_empty() {
                    titles.push(title);
                }
                i += 2; // skip `]]`
            }
        } else {
            i += 1;
        }
    }
    titles.sort();
    titles.dedup();
    titles
}

// ── @mention extraction ───────────────────────────────────────────────────────

/// Extract all `@username` mentions from content, returning unique sorted usernames.
/// Valid usernames: alphanumeric, underscores, hyphens, dots. Must start with letter.
/// Does not include trailing punctuation.
pub fn extract_mentions(content: &str) -> Vec<String> {
    let mut mentions: Vec<String> = Vec::new();
    let bytes = content.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i < len {
        if bytes[i] == b'@' && (i == 0 || !is_word_char(bytes[i - 1])) {
            i += 1;
            let start = i;
            while i < len && is_valid_username_char(bytes[i]) {
                i += 1;
            }
            // Trim trailing punctuation (.,!?:;-) that might have been captured
            let mut end = i;
            while end > start {
                let last_byte = bytes[end - 1];
                if last_byte == b'.'
                    || last_byte == b','
                    || last_byte == b'!'
                    || last_byte == b'?'
                    || last_byte == b':'
                    || last_byte == b';'
                    || last_byte == b'-'
                    || last_byte == b'_'
                    || last_byte == b' '
                    || last_byte == b'\n'
                    || last_byte == b'\t'
                {
                    end -= 1;
                } else {
                    break;
                }
            }
            if end > start {
                let username = content[start..end].to_string();
                if !username.is_empty()
                    && is_valid_username(&username)
                    && !mentions.contains(&username)
                {
                    mentions.push(username);
                }
            }
        } else {
            i += 1;
        }
    }
    mentions.sort();
    mentions
}

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

fn is_valid_username_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.'
}

fn is_valid_username(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let bytes = s.as_bytes();
    if !bytes[0].is_ascii_alphabetic() {
        return false;
    }
    for (i, &b) in bytes.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if !b.is_ascii_alphanumeric() && b != b'_' && b != b'-' && b != b'.' {
            return false;
        }
    }
    !s.ends_with('.') && !s.ends_with('-') && !s.ends_with('_')
}

// ── GET /api/notes/:id/backlinks ──────────────────────────────────────────────

pub async fn get_backlinks(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    // Verify the note exists first.
    if db.get_note_metadata(&id).is_err() {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }
    match db.get_backlinks(&id) {
        Ok(notes) => (StatusCode::OK, Json(serde_json::to_value(notes).unwrap())).into_response(),
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

// ── GET /api/notes/:id/links ──────────────────────────────────────────────────

pub async fn get_outgoing_links(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    // Verify the note exists first.
    if db.get_note_metadata(&id).is_err() {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }
    match db.get_outgoing_links(&id) {
        Ok(notes) => (StatusCode::OK, Json(serde_json::to_value(notes).unwrap())).into_response(),
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

// ── GET /api/notes/:id/mentions ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MentionResponse {
    pub mentions: Vec<String>,
}

pub async fn get_mentions(
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
    drop(db);
    let storage = state.storage.lock().await;
    let note = match storage.read_note(&meta.path) {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "read_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    let mentions = extract_mentions(&note.content);
    (StatusCode::OK, Json(MentionResponse { mentions })).into_response()
}

// ── GET /api/graph ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct GraphNode {
    id: String,
    title: String,
    path: String,
}

#[derive(Serialize)]
pub struct GraphEdge {
    from: String,
    to: String,
}

#[derive(Serialize)]
pub struct GraphResponse {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
}

pub async fn get_graph(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    let notes = match db.list_notes() {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    let edges_raw = match db.get_all_links() {
        Ok(e) => e,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };

    let nodes: Vec<GraphNode> = notes
        .into_iter()
        .map(|n| GraphNode {
            id: n.id,
            title: n.title,
            path: n.path.to_string_lossy().to_string(),
        })
        .collect();

    let edges: Vec<GraphEdge> = edges_raw
        .into_iter()
        .map(|(from, to)| GraphEdge { from, to })
        .collect();

    (StatusCode::OK, Json(GraphResponse { nodes, edges })).into_response()
}

// ── PUT /api/notes/:id/links (internal helper called from notes.rs) ───────────

#[derive(Deserialize)]
pub struct UpdateLinksRequest {
    pub link_titles: Vec<String>,
}

pub async fn update_links(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateLinksRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    // Verify the note exists.
    if db.get_note_metadata(&id).is_err() {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }

    // Resolve titles to IDs.
    let all_notes = match db.list_notes() {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };

    let to_ids: Vec<String> = body
        .link_titles
        .iter()
        .filter_map(|title| {
            all_notes
                .iter()
                .find(|n| n.title.eq_ignore_ascii_case(title))
                .map(|n| n.id.clone())
        })
        .collect();

    match db.set_note_links(&id, &to_ids) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

// ── GET /api/notes/:id/unlinked-mentions ─────────────────────────────────────────

#[derive(Serialize)]
pub struct UnlinkedMention {
    title: String,
    path: String,
    id: String,
    context: String,
}

pub async fn get_unlinked_mentions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    // Verify the note exists first.
    if db.get_note_metadata(&id).is_err() {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }

    // Get the note's title
    let note_meta = match db.get_note_metadata(&id) {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    let note_title = &note_meta.title;

    // Get all notes
    let all_notes = match db.list_notes() {
        Ok(n) => n,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };

    // Get outgoing links for this note
    let outgoing_links = match db.get_outgoing_links(&id) {
        Ok(links) => links,
        Err(e) => {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    };
    let linked_titles: std::collections::HashSet<String> = outgoing_links
        .iter()
        .map(|n| n.title.to_lowercase())
        .collect();

    // Get storage to read note contents
    let storage = state.storage.lock().await;

    let mut unlinked: Vec<UnlinkedMention> = Vec::new();

    // Check each note for mentions of this note's title (excluding already linked)
    for note in &all_notes {
        if note.id == id {
            continue;
        }

        // Skip if already linked
        if linked_titles.contains(&note.title.to_lowercase()) {
            continue;
        }

        // Read note content
        let note = match storage.read_note(&note.path) {
            Ok(n) => n,
            Err(_) => continue,
        };
        let content: &str = &note.content;

        // Check if note content mentions this note's title (case insensitive)
        // but not as a wiki-link
        let title_lower = note_title.to_lowercase();

        // Look for title mentions that aren't wiki-links
        let has_unlinked_mention = content.lines().any(|line| {
            let line_lower = line.to_lowercase();
            // Check if title appears in the line
            if line_lower.contains(&title_lower) {
                // Make sure it's not inside [[]]
                !line.contains("[[") || !line.contains("]]") ||
                    // Check if the wiki-link version also exists
                    (line.contains(&format!("[[{}]]", note_title)) || 
                     line.contains(&format!("[[{}|", note_title)))
            } else {
                false
            }
        });

        if has_unlinked_mention {
            // Find a snippet of context
            let context = content
                .lines()
                .find(|line| line.to_lowercase().contains(&title_lower))
                .map(|s| {
                    let s = s.trim();
                    if s.len() > 100 {
                        format!("{}...", &s[..100])
                    } else {
                        s.to_string()
                    }
                })
                .unwrap_or_default();

            unlinked.push(UnlinkedMention {
                title: note.title.clone(),
                path: note.path.to_string_lossy().to_string(),
                id: note.id.clone(),
                context,
            });
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::to_value(unlinked).unwrap()),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_wiki_link_titles_basic() {
        let content = "See [[Alpha]] and [[Beta]] for details.";
        let titles = extract_wiki_link_titles(content);
        assert_eq!(titles, vec!["Alpha", "Beta"]);
    }

    #[test]
    fn test_extract_wiki_link_titles_deduplication() {
        let content = "[[Alpha]] is mentioned twice: [[Alpha]]";
        let titles = extract_wiki_link_titles(content);
        assert_eq!(titles.len(), 1);
        assert_eq!(titles[0], "Alpha");
    }

    #[test]
    fn test_extract_wiki_link_titles_empty() {
        let content = "No wiki links here.";
        let titles = extract_wiki_link_titles(content);
        assert!(titles.is_empty());
    }

    #[test]
    fn test_extract_wiki_link_titles_whitespace_trimmed() {
        let content = "[[ My Note ]]";
        let titles = extract_wiki_link_titles(content);
        assert_eq!(titles, vec!["My Note"]);
    }

    #[test]
    fn test_extract_wiki_link_titles_multiple_lines() {
        let content = "Line 1: [[Note A]]\nLine 2: [[Note B]]\nLine 3: [[Note A]]";
        let titles = extract_wiki_link_titles(content);
        assert_eq!(titles, vec!["Note A", "Note B"]);
    }

    // ── @mention extraction tests ───────────────────────────────────────────────

    #[test]
    fn test_extract_mentions_basic() {
        let content = "Hey @alice and @bob, please review this.";
        let mentions = extract_mentions(content);
        assert_eq!(mentions, vec!["alice", "bob"]);
    }

    #[test]
    fn test_extract_mentions_deduplication() {
        let content = "Thanks @alice for the help. @alice can you check again?";
        let mentions = extract_mentions(content);
        assert_eq!(mentions, vec!["alice"]);
    }

    #[test]
    fn test_extract_mentions_empty() {
        let content = "No mentions here.";
        let mentions = extract_mentions(content);
        assert!(mentions.is_empty());
    }

    #[test]
    fn test_extract_mentions_special_chars() {
        let content = "Email @user.name or @user_name anytime.";
        let mentions = extract_mentions(content);
        assert_eq!(mentions, vec!["user.name", "user_name"]);
    }

    #[test]
    fn test_extract_mentions_underscore_numbers() {
        let content = "Contact @user123 or @test_123_test.";
        let mentions = extract_mentions(content);
        assert_eq!(mentions, vec!["test_123_test", "user123"]);
    }
}
