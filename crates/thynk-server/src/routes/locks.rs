use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use chrono::Utc;
use serde::Serialize;

use thynk_core::ThynkError;

use crate::routes::auth::AuthUser;
use crate::state::AppState;

/// Lock duration in seconds.
const LOCK_DURATION_SECS: i64 = 30;

#[derive(Serialize)]
pub struct LockResponse {
    pub locked: bool,
    pub user: Option<String>,
    pub expires_at: Option<String>,
}

// ── GET /api/notes/:id/lock ───────────────────────────────────────────────────

pub async fn get_lock(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let db = state.db.lock().await;
    let now = Utc::now().to_rfc3339();

    // Clean up expired locks first.
    let _ = db.cleanup_expired_locks(&now);

    match db.get_lock(&id) {
        Ok(Some(lock)) if lock.expires_at > now => Json(LockResponse {
            locked: true,
            user: Some(lock.user_id),
            expires_at: Some(lock.expires_at),
        })
        .into_response(),
        Ok(_) => Json(LockResponse {
            locked: false,
            user: None,
            expires_at: None,
        })
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

// ── POST /api/notes/:id/lock ──────────────────────────────────────────────────

pub async fn acquire_lock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let expires_at = (now + chrono::Duration::seconds(LOCK_DURATION_SECS)).to_rfc3339();

    match db.acquire_lock(&id, &auth_user.username, &now_str, &expires_at, &now_str) {
        Ok(()) => Json(LockResponse {
            locked: true,
            user: Some(auth_user.username),
            expires_at: Some(expires_at),
        })
        .into_response(),
        Err(ThynkError::Conflict(msg)) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "locked", "message": msg })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

// ── DELETE /api/notes/:id/lock ────────────────────────────────────────────────

pub async fn release_lock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    match db.release_lock(&id, &auth_user.username) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "db_error", "message": e.to_string() })),
        )
            .into_response(),
    }
}

// ── POST /api/notes/:id/lock/heartbeat ───────────────────────────────────────

pub async fn heartbeat_lock(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let now = Utc::now();
    let now_str = now.to_rfc3339();
    let expires_at = (now + chrono::Duration::seconds(LOCK_DURATION_SECS)).to_rfc3339();

    // Heartbeat: re-acquire (extending the lease). This will fail if someone
    // else holds the lock (Conflict), and will succeed if this user holds it.
    match db.acquire_lock(&id, &auth_user.username, &now_str, &expires_at, &now_str) {
        Ok(()) => Json(LockResponse {
            locked: true,
            user: Some(auth_user.username),
            expires_at: Some(expires_at),
        })
        .into_response(),
        Err(ThynkError::Conflict(msg)) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "locked", "message": msg })),
        )
            .into_response(),
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
    fn test_acquire_lock_success() {
        let db = Database::open_in_memory().unwrap();
        // Need a note to lock (due to FK constraint).
        let note = Note::new("Test".into(), "".into(), PathBuf::from("test.md"));
        db.index_note(&note).unwrap();

        let now = chrono::Utc::now();
        let now_str = now.to_rfc3339();
        let expires_at = (now + chrono::Duration::seconds(30)).to_rfc3339();

        db.acquire_lock(&note.id, "user1", &now_str, &expires_at, &now_str)
            .unwrap();

        let lock = db.get_lock(&note.id).unwrap();
        assert!(lock.is_some());
        assert_eq!(lock.unwrap().user_id, "user1");
    }

    #[test]
    fn test_acquire_lock_same_user_can_reacquire() {
        let db = Database::open_in_memory().unwrap();
        let note = Note::new("Test".into(), "".into(), PathBuf::from("test.md"));
        db.index_note(&note).unwrap();

        let now = chrono::Utc::now();
        let now_str = now.to_rfc3339();
        let expires_at = (now + chrono::Duration::seconds(30)).to_rfc3339();

        db.acquire_lock(&note.id, "user1", &now_str, &expires_at, &now_str)
            .unwrap();
        // Same user can re-acquire (heartbeat/refresh).
        db.acquire_lock(&note.id, "user1", &now_str, &expires_at, &now_str)
            .unwrap();

        let lock = db.get_lock(&note.id).unwrap();
        assert_eq!(lock.unwrap().user_id, "user1");
    }

    #[test]
    fn test_acquire_lock_different_user_conflict() {
        let db = Database::open_in_memory().unwrap();
        let note = Note::new("Test".into(), "".into(), PathBuf::from("test.md"));
        db.index_note(&note).unwrap();

        let now = chrono::Utc::now();
        let now_str = now.to_rfc3339();
        let expires_at = (now + chrono::Duration::seconds(30)).to_rfc3339();

        db.acquire_lock(&note.id, "user1", &now_str, &expires_at, &now_str)
            .unwrap();

        // Different user should get a Conflict error.
        let result = db.acquire_lock(&note.id, "user2", &now_str, &expires_at, &now_str);
        assert!(result.is_err());
        match result.unwrap_err() {
            thynk_core::ThynkError::Conflict(_) => {}
            e => panic!("expected Conflict, got {e:?}"),
        }
    }

    #[test]
    fn test_release_lock() {
        let db = Database::open_in_memory().unwrap();
        let note = Note::new("Test".into(), "".into(), PathBuf::from("test.md"));
        db.index_note(&note).unwrap();

        let now = chrono::Utc::now();
        let now_str = now.to_rfc3339();
        let expires_at = (now + chrono::Duration::seconds(30)).to_rfc3339();

        db.acquire_lock(&note.id, "user1", &now_str, &expires_at, &now_str)
            .unwrap();
        db.release_lock(&note.id, "user1").unwrap();

        let lock = db.get_lock(&note.id).unwrap();
        assert!(lock.is_none());
    }
}
