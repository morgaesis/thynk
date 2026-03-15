use std::path::PathBuf;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use thynk_core::{Note, NoteStorage};

use crate::state::AppState;

// ── GET /api/templates ────────────────────────────────────────────────────────

pub async fn list_templates(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_notes() {
        Ok(notes) => {
            let templates: Vec<_> = notes
                .into_iter()
                .filter(|n| n.path.to_string_lossy().starts_with(".templates/"))
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::to_value(templates).unwrap()),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

// ── POST /api/notes/from-template ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct FromTemplateRequest {
    pub template_id: String,
    pub title: String,
    pub path: Option<String>,
}

pub async fn create_from_template(
    State(state): State<AppState>,
    Json(body): Json<FromTemplateRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    // Look up the template note.
    let template_meta = match db.get_note_metadata(&body.template_id) {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "not_found", "message": "template not found" })),
            )
                .into_response();
        }
    };

    let storage = state.storage.lock().await;
    let template_note = match storage.read_note(&template_meta.path) {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "storage_error", "message": e.to_string() })),
            )
                .into_response();
        }
    };

    // Replace {{title}} placeholder in content.
    let content = template_note.content.replace("{{title}}", &body.title);

    // Determine path for new note.
    let path_str = body.path.unwrap_or_else(|| format!("{}.md", &body.title));
    let path = PathBuf::from(&path_str);

    // Ensure unique path.
    let final_path = if storage.exists(&path) {
        let stem = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ts = chrono::Utc::now().timestamp_millis();
        let new_name = format!("{stem}-{ts}.md");
        match path.parent() {
            Some(parent) if parent != std::path::Path::new("") => parent.join(new_name),
            _ => PathBuf::from(new_name),
        }
    } else {
        path
    };

    let new_note = Note::new(body.title, content, final_path);

    if let Err(e) = storage.write_note(&new_note) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "write_error", "message": e.to_string() })),
        )
            .into_response();
    }
    drop(storage);

    if let Err(e) = db.index_note(&new_note) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response();
    }

    (
        StatusCode::CREATED,
        Json(serde_json::to_value(&new_note).unwrap()),
    )
        .into_response()
}
