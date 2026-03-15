use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct FavoriteToggleResponse {
    favorited: bool,
}

// ── POST /api/notes/:id/favorite ──────────────────────────────────────────────

pub async fn toggle_favorite(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    // Get current state.
    let currently = match db.is_favorited(&id) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "not_found", "message": "note not found" })),
            )
                .into_response();
        }
    };
    let new_state = !currently;
    if let Err(e) = db.set_favorited(&id, new_state) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response();
    }
    (
        StatusCode::OK,
        Json(FavoriteToggleResponse {
            favorited: new_state,
        }),
    )
        .into_response()
}

// ── GET /api/favorites ────────────────────────────────────────────────────────

pub async fn list_favorites(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_favorited_notes() {
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
    use std::path::PathBuf;
    use thynk_core::{Database, Note};

    #[test]
    fn test_toggle_favorite_roundtrip() {
        let db = Database::open_in_memory().unwrap();
        let note = Note::new("Fav Note".into(), "body".into(), PathBuf::from("fav.md"));
        let id = note.id.clone();
        db.index_note(&note).unwrap();

        assert!(!db.is_favorited(&id).unwrap());
        db.set_favorited(&id, true).unwrap();
        assert!(db.is_favorited(&id).unwrap());
        db.set_favorited(&id, false).unwrap();
        assert!(!db.is_favorited(&id).unwrap());
    }

    #[test]
    fn test_list_favorited_notes() {
        let db = Database::open_in_memory().unwrap();
        let note1 = Note::new("Note 1".into(), "body".into(), PathBuf::from("n1.md"));
        let note2 = Note::new("Note 2".into(), "body".into(), PathBuf::from("n2.md"));
        let id1 = note1.id.clone();
        db.index_note(&note1).unwrap();
        db.index_note(&note2).unwrap();

        db.set_favorited(&id1, true).unwrap();
        let favs = db.list_favorited_notes().unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].id, id1);
        assert!(favs[0].favorited);
    }
}
