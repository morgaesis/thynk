use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct TagEntry {
    pub name: String,
    pub count: i64,
}

// ── GET /api/tags ─────────────────────────────────────────────────────────────

pub async fn list_tags(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_tags() {
        Ok(tags) => {
            let entries: Vec<TagEntry> = tags
                .into_iter()
                .map(|(name, count)| TagEntry { name, count })
                .collect();
            (StatusCode::OK, Json(serde_json::to_value(entries).unwrap())).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

// ── GET /api/tags/:name/notes ─────────────────────────────────────────────────

pub async fn get_notes_by_tag(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_notes_by_tag(&name) {
        Ok(notes) => (StatusCode::OK, Json(serde_json::to_value(notes).unwrap())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;
    use thynk_core::{Database, Note};

    #[test]
    fn test_list_tags_empty() {
        let db = Database::open_in_memory().unwrap();
        let tags = db.list_tags().unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn test_tags_extracted_from_content() {
        let db = Database::open_in_memory().unwrap();
        let mut note = Note::new(
            "Tagged Note".into(),
            "Hello #rust #programming world".into(),
            PathBuf::from("tagged.md"),
        );
        note.frontmatter = HashMap::new();
        db.index_note(&note).unwrap();

        let tags = db.list_tags().unwrap();
        assert_eq!(tags.len(), 2);
        let tag_names: Vec<&str> = tags.iter().map(|(n, _)| n.as_str()).collect();
        assert!(tag_names.contains(&"rust"));
        assert!(tag_names.contains(&"programming"));
    }

    #[test]
    fn test_tags_extracted_from_frontmatter() {
        let db = Database::open_in_memory().unwrap();
        let mut note = Note::new(
            "FM Note".into(),
            "No inline tags here".into(),
            PathBuf::from("fm.md"),
        );
        note.frontmatter
            .insert("tags".into(), "rust, web, async".into());
        db.index_note(&note).unwrap();

        let tags = db.list_tags().unwrap();
        assert_eq!(tags.len(), 3);
    }

    #[test]
    fn test_get_notes_by_tag() {
        let db = Database::open_in_memory().unwrap();
        let mut note = Note::new(
            "Rust Note".into(),
            "Content #rust".into(),
            PathBuf::from("rust.md"),
        );
        note.frontmatter = HashMap::new();
        db.index_note(&note).unwrap();

        let notes = db.get_notes_by_tag("rust").unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "Rust Note");
    }
}
