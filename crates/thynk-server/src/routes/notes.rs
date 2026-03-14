use std::path::PathBuf;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use thynk_core::{Note, NoteStorage};

use crate::state::AppState;

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

pub async fn list_notes(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_notes() {
        Ok(notes) => (StatusCode::OK, Json(serde_json::to_value(notes).unwrap())).into_response(),
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
    let path = body.path.unwrap_or_else(|| {
        let slug: String = body
            .title
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .to_string();
        let slug = if slug.is_empty() {
            "untitled".to_string()
        } else {
            slug
        };
        format!("{slug}.md")
    });

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
            format!("{stem}-{ts}.md")
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
    Json(body): Json<UpdateNoteRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

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
            let slug: String = new_title
                .to_lowercase()
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' {
                        c
                    } else {
                        '-'
                    }
                })
                .collect::<String>()
                .trim_matches('-')
                .to_string();
            let slug = if slug.is_empty() {
                "untitled".to_string()
            } else {
                slug
            };
            let new_path = PathBuf::from(format!("{slug}.md"));
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

    (StatusCode::OK, Json(serde_json::to_value(&note).unwrap())).into_response()
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
