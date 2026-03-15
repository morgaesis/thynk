use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

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
}
