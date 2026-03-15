use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct UserProfileResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub recent_notes: Vec<NoteActivity>,
}

#[derive(Serialize)]
pub struct NoteActivity {
    pub id: String,
    pub title: String,
    pub updated_at: String,
}

fn build_recent_notes(
    db: &thynk_core::Database,
    username: &str,
) -> Vec<NoteActivity> {
    let all_notes = db.list_notes().unwrap_or_default();
    let mut recent_notes: Vec<NoteActivity> = all_notes
        .into_iter()
        .filter(|n| n.last_updated_by.as_deref() == Some(username))
        .map(|n| NoteActivity {
            id: n.id,
            title: n.title,
            updated_at: n.updated_at.to_rfc3339(),
        })
        .collect();
    recent_notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    recent_notes.truncate(20);
    recent_notes
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    _auth: axum::Extension<crate::routes::auth::AuthUser>,
    Path(user_id): Path<String>,
) -> Result<Json<UserProfileResponse>, StatusCode> {
    let db = state.db.lock().await;

    let target_user = db
        .get_user_by_id(&user_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let recent_notes = build_recent_notes(&db, &target_user.username);

    Ok(Json(UserProfileResponse {
        id: target_user.id,
        username: target_user.username,
        display_name: target_user.display_name,
        recent_notes,
    }))
}

pub async fn get_user_profile_by_username(
    State(state): State<AppState>,
    _auth: axum::Extension<crate::routes::auth::AuthUser>,
    Path(username): Path<String>,
) -> Result<Json<UserProfileResponse>, StatusCode> {
    let db = state.db.lock().await;

    let target_user = db
        .get_user_by_username(&username)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let recent_notes = build_recent_notes(&db, &target_user.username);

    Ok(Json(UserProfileResponse {
        id: target_user.id,
        username: target_user.username,
        display_name: target_user.display_name,
        recent_notes,
    }))
}
