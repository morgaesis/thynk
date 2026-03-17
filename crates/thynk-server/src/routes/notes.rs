use std::path::PathBuf;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use thynk_core::db::UserRole;
use thynk_core::{Note, NoteStorage};

use crate::routes::auth::AuthUser;
use crate::routes::links::{extract_mentions, extract_wiki_link_titles};
use crate::state::{AppState, WsEvent};

/// Convert a title to a filesystem path, preserving `/` as directory separators.
/// Each path component is sanitized by stripping only characters that are invalid
/// on Linux filesystems (null bytes and control characters). Unicode, spaces,
/// accents, CJK, emoji, etc. are all preserved.
fn title_to_path(title: &str) -> String {
    let parts: Vec<&str> = title.split('/').collect();
    let sanitized: Vec<String> = parts
        .iter()
        .map(|component| {
            let cleaned: String = component
                .chars()
                .filter(|c| *c != '\0' && !c.is_control())
                .collect();
            let cleaned = cleaned.trim().to_string();
            if cleaned.is_empty() {
                "untitled".to_string()
            } else {
                cleaned
            }
        })
        .collect();
    format!("{}.md", sanitized.join("/"))
}

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

/// Check if a user can access a note with the given permission level.
/// Returns Ok(()) if allowed, or Err(response) if denied.
fn check_note_permission(
    db: &thynk_core::Database,
    note_id: &str,
    auth_user: &AuthUser,
    required_permission: &str,
) -> Result<(), impl IntoResponse> {
    // Owners and admins can access everything.
    if auth_user.role == UserRole::Owner || auth_user.role == UserRole::Admin {
        return Ok(());
    }

    // Check if the note has custom permissions.
    let has_custom = db.has_custom_permissions(note_id).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
    })?;

    if !has_custom {
        // No custom permissions means it's accessible to all workspace members.
        // Anyone can view. Editors can edit.
        if required_permission == "view" {
            return Ok(());
        }
        if required_permission == "edit" {
            // For edit, allow if user is an editor or above.
            if auth_user.role == UserRole::Editor {
                return Ok(());
            }
            // Backward compatibility: allow edit for now if no custom permissions set.
            // This can be made stricter later.
            return Ok(());
        }
        return Ok(());
    }

    // Check specific permission for this user.
    match db.get_user_page_permission(note_id, &auth_user.id) {
        Ok(Some(perm)) => {
            let perm_level = perm.permission.as_str();
            if required_permission == "view" && (perm_level == "view" || perm_level == "edit") {
                return Ok(());
            }
            if required_permission == "edit" && perm_level == "edit" {
                return Ok(());
            }
            Err(err(
                StatusCode::FORBIDDEN,
                "forbidden",
                "You don't have permission to access this note",
            ))
        }
        Ok(None) => {
            // User not in permissions list - deny access.
            Err(err(
                StatusCode::FORBIDDEN,
                "forbidden",
                "You don't have permission to access this note",
            ))
        }
        Err(e) => Err(err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )),
    }
}

// ── GET /api/notes ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ListNotesQuery {
    pub prefix: Option<String>,
}

pub async fn list_notes(
    State(state): State<AppState>,
    Query(query): Query<ListNotesQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.list_notes() {
        Ok(notes) => {
            let filtered = if let Some(ref prefix) = query.prefix {
                notes
                    .into_iter()
                    .filter(|n| n.path.to_string_lossy().starts_with(prefix.as_str()))
                    .collect()
            } else {
                notes
            };
            (
                StatusCode::OK,
                Json(serde_json::to_value(filtered).unwrap()),
            )
                .into_response()
        }
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

// ── GET /api/notes/:id ───────────────────────────────────────────────────────

pub async fn get_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    // Check view permission.
    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "view") {
        return resp.into_response();
    }

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

// ── GET /api/notes/by-path/:path ───────────────────────────────────────────────

pub async fn get_note_by_path(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    let meta = match db.get_note_by_path(&PathBuf::from(&path)) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    // Check view permission.
    if let Err(resp) = check_note_permission(&db, &meta.id, &auth_user, "view") {
        return resp.into_response();
    }

    #[derive(Serialize)]
    struct NoteByPathResponse {
        id: String,
        path: String,
        title: String,
    }

    (
        StatusCode::OK,
        Json(NoteByPathResponse {
            id: meta.id,
            path: meta.path.to_string_lossy().to_string(),
            title: meta.title,
        }),
    )
        .into_response()
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
    let path = body.path.unwrap_or_else(|| title_to_path(&body.title));
    // If path ends with '/', it's a directory — append "untitled.md".
    let path = if path.ends_with('/') {
        format!("{path}untitled.md")
    } else {
        path
    };

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
            let new_name = format!("{stem}-{ts}.md");
            match candidate.parent() {
                Some(parent) if parent != std::path::Path::new("") => {
                    parent.join(new_name).to_string_lossy().to_string()
                }
                _ => new_name,
            }
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

    // Extract wiki-links from content and populate the link graph on creation.
    let link_titles = extract_wiki_link_titles(&note.content);
    let all_notes = db.list_notes().unwrap_or_default();
    let to_ids: Vec<String> = link_titles
        .iter()
        .filter_map(|title| {
            all_notes
                .iter()
                .find(|n| n.title.eq_ignore_ascii_case(title))
                .map(|n| n.id.clone())
        })
        .collect();
    let _ = db.set_note_links(&note.id, &to_ids);

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
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<UpdateNoteRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    // Check edit permission.
    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    // Check if the note is locked by a different user.
    {
        let now = chrono::Utc::now().to_rfc3339();
        if let Ok(Some(lock)) = db.get_lock(&id) {
            if lock.expires_at > now && lock.user_id != auth_user.username {
                return (
                    StatusCode::from_u16(423).unwrap(),
                    Json(serde_json::json!({
                        "error": "locked",
                        "message": format!("note is locked by {}", lock.user_id)
                    })),
                )
                    .into_response();
            }
        }
    }

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
    // Store old content for mention comparison before any updates.
    let old_content = note.content.clone();
    // Fill in metadata from DB (storage only knows content+path).
    note.id = meta.id.clone();
    note.title = meta.title.clone();
    note.created_at = meta.created_at;
    note.updated_at = meta.updated_at;

    // Auto-rename file based on new title (if no explicit path change requested).
    if body.path.is_none() {
        if let Some(ref new_title) = body.title {
            let new_path = PathBuf::from(title_to_path(new_title));
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

    let editor_name = auth_user
        .display_name
        .clone()
        .unwrap_or_else(|| auth_user.username.clone());
    note.last_updated_by = Some(editor_name.clone());

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

    // Extract wiki-links from content and update the link graph.
    let link_titles = extract_wiki_link_titles(&note.content);
    let all_notes = db.list_notes().unwrap_or_default();
    let to_ids: Vec<String> = link_titles
        .iter()
        .filter_map(|title| {
            all_notes
                .iter()
                .find(|n| n.title.eq_ignore_ascii_case(title))
                .map(|n| n.id.clone())
        })
        .collect();
    // Ignore errors from link extraction — it's non-critical.
    let _ = db.set_note_links(&note.id, &to_ids);

    // Notifications: create notifications for new @mentions.
    let old_mentions: std::collections::HashSet<_> =
        extract_mentions(&old_content).into_iter().collect();
    let new_mentions: Vec<_> = extract_mentions(&note.content)
        .into_iter()
        .filter(|m| !old_mentions.contains(m))
        .collect();
    for mentioned_username in new_mentions {
        if let Ok(Some(target_user)) = db.get_user_by_username(&mentioned_username) {
            // Don't notify the user if they're mentioning themselves.
            if target_user.id != auth_user.id {
                let exists = db
                    .mention_notification_exists(&target_user.id, &note.id, &auth_user.username)
                    .unwrap_or(false);
                if !exists {
                    let notification_id = uuid::Uuid::new_v4().to_string();
                    let message = format!("{} mentioned you in \"{}\"", editor_name, note.title);
                    let _ = db.create_notification(
                        &notification_id,
                        &target_user.id,
                        &note.id,
                        "mention",
                        &message,
                        &chrono::Utc::now().to_rfc3339(),
                    );
                }
            }
        }
    }

    // Automation: broadcast StatusChanged when note status becomes "done".
    if let Some(status) = extract_frontmatter_status(&note.content) {
        if status.eq_ignore_ascii_case("done") {
            let _ = state.events.send(WsEvent::StatusChanged {
                note_id: note.id.clone(),
                title: note.title.clone(),
                status,
            });
        }
    }

    (StatusCode::OK, Json(serde_json::to_value(&note).unwrap())).into_response()
}

/// Extract the `status` field from YAML frontmatter (--- ... ---) if present.
fn extract_frontmatter_status(content: &str) -> Option<String> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let frontmatter = &rest[..end];
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("status:") {
            let status = val.trim().trim_matches('"').trim_matches('\'').to_string();
            if !status.is_empty() {
                return Some(status);
            }
        }
    }
    None
}

// ── DELETE /api/notes/:id ────────────────────────────────────────────────────

pub async fn delete_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    // Check edit permission (deleting requires edit access).
    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

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

// ── POST /api/notes/:id/trash ─────────────────────────────────────────────────

pub async fn trash_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    let storage = state.storage.lock().await;
    let _ = storage.delete_note(&meta.path);
    drop(storage);

    if let Err(e) = db.trash_note(&id) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── POST /api/notes/:id/restore ───────────────────────────────────────────────

pub async fn restore_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

    if let Err(e) = db.restore_note(&id) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── GET /api/notes/trashed ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct TrashedNotesResponse {
    pub notes: Vec<thynk_core::NoteMetadata>,
}

pub async fn list_trashed_notes(
    Extension(_auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    let notes = match db.list_trashed_notes() {
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

    Json(TrashedNotesResponse { notes }).into_response()
}

// ── DELETE /api/notes/:id/permanent ─────────────────────────────────────────────

pub async fn permanently_delete_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

    if let Err(e) = db.permanently_delete_note(&id) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── PUT /api/notes/:id/move ────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct MoveNoteRequest {
    pub new_path: String,
}

#[derive(Serialize, Deserialize)]
pub struct MoveNoteResponse {
    pub id: String,
    pub path: String,
    pub title: String,
}

pub async fn move_note(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MoveNoteRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    if let Err(resp) = check_note_permission(&db, &id, &auth_user, "edit") {
        return resp.into_response();
    }

    let meta = match db.get_note_metadata(&id) {
        Ok(m) => m,
        Err(_) => {
            return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
        }
    };

    let new_path = title_to_path(&body.new_path);
    let new_path_buf = std::path::PathBuf::from(&new_path);

    let storage = state.storage.lock().await;
    if let Err(e) = storage.move_note(&meta.path, &new_path_buf) {
        return match e {
            thynk_core::error::ThynkError::AlreadyExists(_) => err(
                StatusCode::CONFLICT,
                "already_exists",
                "a note already exists at the destination path",
            )
            .into_response(),
            thynk_core::error::ThynkError::NotFound(_) => {
                err(StatusCode::NOT_FOUND, "not_found", "source note not found").into_response()
            }
            _ => err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "io_error",
                &e.to_string(),
            )
            .into_response(),
        };
    }
    drop(storage);

    if let Err(e) = db.update_note_path(&id, &new_path_buf) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    let new_title = std::path::Path::new(&body.new_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .to_string();

    (
        StatusCode::OK,
        Json(MoveNoteResponse {
            id: id.clone(),
            path: new_path,
            title: new_title,
        }),
    )
        .into_response()
}

// ── Page Permissions ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetPermissionRequest {
    pub user_id: String,
    pub permission: String,
}

pub async fn set_page_permission(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(note_id): Path<String>,
    Json(body): Json<SetPermissionRequest>,
) -> impl IntoResponse {
    if auth_user.role != thynk_core::db::UserRole::Owner
        && auth_user.role != thynk_core::db::UserRole::Admin
    {
        return err(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only owners and admins can manage page permissions",
        )
        .into_response();
    }

    let db = state.db.lock().await;

    if let Err(_e) = db.get_note_metadata(&note_id) {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }

    let now = chrono::Utc::now().to_rfc3339();
    if let Err(e) = db.set_page_permission(
        &note_id,
        &body.user_id,
        &body.permission,
        &auth_user.id,
        &now,
    ) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "note_id": note_id,
            "user_id": body.user_id,
            "permission": body.permission,
        })),
    )
        .into_response()
}

pub async fn get_page_permissions(
    Extension(_auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path(note_id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;

    if let Err(_e) = db.get_note_metadata(&note_id) {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }

    match db.get_page_permissions(&note_id) {
        Ok(permissions) => (
            StatusCode::OK,
            Json(serde_json::to_value(permissions).unwrap()),
        )
            .into_response(),
        Err(e) => err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

pub async fn delete_page_permission(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Path((note_id, user_id)): Path<(String, String)>,
) -> impl IntoResponse {
    if auth_user.role != thynk_core::db::UserRole::Owner
        && auth_user.role != thynk_core::db::UserRole::Admin
    {
        return err(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only owners and admins can manage page permissions",
        )
        .into_response();
    }

    let db = state.db.lock().await;

    if let Err(_e) = db.get_note_metadata(&note_id) {
        return err(StatusCode::NOT_FOUND, "not_found", "note not found").into_response();
    }

    if let Err(e) = db.delete_page_permission(&note_id, &user_id) {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_title_to_path_simple() {
        assert_eq!(title_to_path("My Note"), "My Note.md");
    }

    #[test]
    fn test_title_to_path_preserves_slash_as_dir_separator() {
        assert_eq!(title_to_path("foo/bar"), "foo/bar.md");
    }

    #[test]
    fn test_title_to_path_unicode() {
        assert_eq!(title_to_path("Résumé Notes"), "Résumé Notes.md");
    }

    #[test]
    fn test_title_to_path_cjk_with_dir() {
        assert_eq!(title_to_path("日本語/メモ"), "日本語/メモ.md");
    }

    #[test]
    fn test_title_to_path_empty_component_becomes_untitled() {
        assert_eq!(title_to_path(""), "untitled.md");
    }

    #[test]
    fn test_title_to_path_strips_control_chars() {
        // null byte and control chars should be stripped
        assert_eq!(title_to_path("note\0name"), "notename.md");
    }

    #[test]
    fn test_title_to_path_trailing_slash_creates_untitled() {
        // trailing slash = directory, append untitled
        assert_eq!(title_to_path("folder/"), "folder/untitled.md");
    }

    #[tokio::test]
    async fn test_move_note_success() {
        use crate::routes::auth::AuthUser;
        use crate::routes::signaling::SignalingState;
        use std::sync::Arc;
        use thynk_core::{Database, FilesystemStorage};
        use tokio::sync::Mutex;

        let temp_dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
        let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();

        let note = thynk_core::Note {
            id: "test-note-1".to_string(),
            path: std::path::PathBuf::from("original.md"),
            title: "Original".to_string(),
            content: "# Test\nHello world".to_string(),
            content_hash: thynk_core::note::compute_hash("# Test\nHello world"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        storage.write_note(&note).unwrap();
        db.index_note(&note).unwrap();

        let (events, _) = tokio::sync::broadcast::channel(16);
        let state = crate::state::AppState {
            storage: Arc::new(Mutex::new(storage)),
            db: Arc::new(Mutex::new(db)),
            config: Arc::new(thynk_core::Config::default()),
            events,
            s3_bucket: None,
            signaling: SignalingState::new(),
        };

        let auth_user = AuthUser {
            id: "user1".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "owner".to_string(),
            display_name: None,
        };

        let req = MoveNoteRequest {
            new_path: "moved/note".to_string(),
        };

        let response = move_note(
            Extension(auth_user),
            State(state),
            Path("test-note-1".to_string()),
            Json(req),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let result: MoveNoteResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(result.path, "moved/note.md");
        assert_eq!(result.title, "note");
    }

    #[tokio::test]
    async fn test_move_note_conflict() {
        use crate::routes::auth::AuthUser;
        use crate::routes::signaling::SignalingState;
        use std::sync::Arc;
        use thynk_core::{Database, FilesystemStorage};
        use tokio::sync::Mutex;

        let temp_dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
        let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();

        let note1 = thynk_core::Note {
            id: "note-1".to_string(),
            path: std::path::PathBuf::from("note1.md"),
            title: "Note 1".to_string(),
            content: "# Note 1".to_string(),
            content_hash: thynk_core::note::compute_hash("# Note 1"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        let note2 = thynk_core::Note {
            id: "note-2".to_string(),
            path: std::path::PathBuf::from("target.md"),
            title: "Target".to_string(),
            content: "# Target".to_string(),
            content_hash: thynk_core::note::compute_hash("# Target"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        storage.write_note(&note1).unwrap();
        storage.write_note(&note2).unwrap();
        db.index_note(&note1).unwrap();
        db.index_note(&note2).unwrap();

        let (events, _) = tokio::sync::broadcast::channel(16);
        let state = crate::state::AppState {
            storage: Arc::new(Mutex::new(storage)),
            db: Arc::new(Mutex::new(db)),
            config: Arc::new(thynk_core::Config::default()),
            events,
            s3_bucket: None,
            signaling: SignalingState::new(),
        };

        let auth_user = AuthUser {
            id: "user1".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "owner".to_string(),
            display_name: None,
        };

        let req = MoveNoteRequest {
            new_path: "target".to_string(),
        };

        let response = move_note(
            Extension(auth_user),
            State(state),
            Path("note-1".to_string()),
            Json(req),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn test_trash_and_restore_note() {
        use crate::routes::auth::AuthUser;
        use crate::routes::signaling::SignalingState;
        use std::sync::Arc;
        use thynk_core::{Database, FilesystemStorage};
        use tokio::sync::Mutex;

        let temp_dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
        let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();

        let note = thynk_core::Note {
            id: "trash-test-1".to_string(),
            path: std::path::PathBuf::from("to-trash.md"),
            title: "To Trash".to_string(),
            content: "# Test content".to_string(),
            content_hash: thynk_core::note::compute_hash("# Test content"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        storage.write_note(&note).unwrap();
        db.index_note(&note).unwrap();

        let (events, _) = tokio::sync::broadcast::channel(16);
        let state = crate::state::AppState {
            storage: Arc::new(Mutex::new(storage)),
            db: Arc::new(Mutex::new(db)),
            config: Arc::new(thynk_core::Config::default()),
            events,
            s3_bucket: None,
            signaling: SignalingState::new(),
        };

        let auth_user = AuthUser {
            id: "user1".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "owner".to_string(),
            display_name: None,
        };

        let response = trash_note(
            Extension(auth_user.clone()),
            State(state.clone()),
            Path("trash-test-1".to_string()),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let db = state.db.lock().await;
        let trashed = db.list_trashed_notes().unwrap();
        assert_eq!(trashed.len(), 1);
        assert_eq!(trashed[0].id, "trash-test-1");
        drop(db);

        let response = restore_note(
            Extension(auth_user),
            State(state),
            Path("trash-test-1".to_string()),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn test_list_trashed_notes() {
        use crate::routes::auth::AuthUser;
        use crate::routes::signaling::SignalingState;
        use std::sync::Arc;
        use thynk_core::{Database, FilesystemStorage};
        use tokio::sync::Mutex;

        let temp_dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
        let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();

        let note1 = thynk_core::Note {
            id: "trash-list-1".to_string(),
            path: std::path::PathBuf::from("note1.md"),
            title: "Note 1".to_string(),
            content: "Content 1".to_string(),
            content_hash: thynk_core::note::compute_hash("Content 1"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        let note2 = thynk_core::Note {
            id: "trash-list-2".to_string(),
            path: std::path::PathBuf::from("note2.md"),
            title: "Note 2".to_string(),
            content: "Content 2".to_string(),
            content_hash: thynk_core::note::compute_hash("Content 2"),
            frontmatter: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_updated_by: None,
        };
        storage.write_note(&note1).unwrap();
        storage.write_note(&note2).unwrap();
        db.index_note(&note1).unwrap();
        db.index_note(&note2).unwrap();

        db.trash_note("trash-list-1").unwrap();

        let (events, _) = tokio::sync::broadcast::channel(16);
        let state = crate::state::AppState {
            storage: Arc::new(Mutex::new(storage)),
            db: Arc::new(Mutex::new(db)),
            config: Arc::new(thynk_core::Config::default()),
            events,
            s3_bucket: None,
            signaling: SignalingState::new(),
        };

        let auth_user = AuthUser {
            id: "user1".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "owner".to_string(),
            display_name: None,
        };

        let response = list_trashed_notes(Extension(auth_user), State(state))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let result: TrashedNotesResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(result.notes.len(), 1);
        assert_eq!(result.notes[0].id, "trash-list-1");
    }
}
