use std::path::PathBuf;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use thynk_core::{Note, NoteStorage};

use crate::state::AppState;

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn error_response(status: StatusCode, msg: &str) -> impl IntoResponse {
    (
        status,
        Json(ErrorResponse {
            error: msg.to_string(),
        }),
    )
}

/// GET /api/notes
pub async fn list_notes(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_notes() {
        Ok(notes) => (StatusCode::OK, Json(serde_json::to_value(notes).unwrap())).into_response(),
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response(),
    }
}

/// GET /api/notes/:id
pub async fn get_note(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    match storage.read_note(&meta.path) {
        Ok(note) => (StatusCode::OK, Json(serde_json::to_value(note).unwrap())).into_response(),
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub content: String,
    pub path: Option<String>,
}

/// POST /api/notes
pub async fn create_note(
    State(state): State<AppState>,
    Json(body): Json<CreateNoteRequest>,
) -> impl IntoResponse {
    let path = body.path.unwrap_or_else(|| {
        let slug: String = body
            .title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect();
        format!("{slug}.md")
    });

    let note = Note::new(body.title, body.content, PathBuf::from(&path));

    let storage = state.storage.lock().await;
    if let Err(e) = storage.write_note(&note) {
        return error_response(StatusCode::BAD_REQUEST, &e.to_string()).into_response();
    }

    let db = state.db.lock().await;
    if let Err(e) = db.index_note(&note) {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response();
    }

    (
        StatusCode::CREATED,
        Json(serde_json::to_value(note).unwrap()),
    )
        .into_response()
}

#[derive(Deserialize)]
pub struct UpdateNoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub path: Option<String>,
}

/// PUT /api/notes/:id
pub async fn update_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateNoteRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    let mut note = match storage.read_note(&meta.path) {
        Ok(n) => n,
        Err(e) => {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
                .into_response();
        }
    };

    if let Some(title) = body.title {
        note.title = title;
    }
    if let Some(content) = body.content {
        note.content = content;
    }
    if let Some(path) = body.path {
        // Delete old file, update path
        let _ = storage.delete_note(&note.path);
        note.path = PathBuf::from(path);
    }
    note.updated_at = chrono::Utc::now();

    if let Err(e) = storage.write_note(&note) {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response();
    }
    if let Err(e) = db.index_note(&note) {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response();
    }

    (StatusCode::OK, Json(serde_json::to_value(note).unwrap())).into_response()
}

/// DELETE /api/notes/:id
pub async fn delete_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    let _ = storage.delete_note(&meta.path);

    if let Err(e) = db.delete_note(&id) {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}
