use axum::{
    extract::State,
    response::IntoResponse,
    routing::{get, patch},
    Json, Router,
};
use axum::http::StatusCode;

use crate::routes::auth::AuthUser;
use crate::state::AppState;

#[allow(dead_code)]
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/notifications", get(get_notifications))
        .route("/api/notifications/unread-count", get(get_unread_count))
        .route("/api/notifications/{id}/read", patch(mark_read))
}

#[derive(serde::Serialize)]
pub struct NotificationResponse {
    pub notifications: Vec<thynk_core::db::Notification>,
}

pub async fn get_notifications(
    axum::extract::Extension(auth_user): axum::extract::Extension<AuthUser>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_notifications_for_user(&auth_user.id) {
        Ok(notifications) => (
            StatusCode::OK,
            Json(NotificationResponse { notifications }),
        )
            .into_response(),
        Err(e) => err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

#[derive(serde::Serialize)]
pub struct UnreadCountResponse {
    pub count: i64,
}

pub async fn get_unread_count(
    axum::extract::Extension(auth_user): axum::extract::Extension<AuthUser>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_unread_notification_count(&auth_user.id) {
        Ok(count) => (StatusCode::OK, Json(UnreadCountResponse { count })).into_response(),
        Err(e) => err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

pub async fn mark_read(
    axum::extract::Extension(_auth_user): axum::extract::Extension<AuthUser>,
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.mark_notification_read(&id) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

fn err_json(status: StatusCode, code: &str, message: &str) -> impl IntoResponse {
    (status, Json(serde_json::json!({ "error": code, "message": message })))
}
