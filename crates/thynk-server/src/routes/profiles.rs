use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Serialize, Deserialize)]
pub struct UserProfileResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub recent_notes: Vec<NoteActivity>,
    pub mutual_work: Vec<NoteActivity>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NoteActivity {
    pub id: String,
    pub title: String,
    pub updated_at: String,
}

fn build_recent_notes(db: &thynk_core::Database, username: &str) -> Vec<NoteActivity> {
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

fn build_mutual_work(
    db: &thynk_core::Database,
    target_username: &str,
    current_username: &str,
) -> Vec<NoteActivity> {
    let all_notes = db.list_notes().unwrap_or_default();

    let target_user_notes: Vec<_> = all_notes
        .iter()
        .filter(|n| n.last_updated_by.as_deref() == Some(target_username))
        .collect();

    let current_user_notes: std::collections::HashSet<_> = all_notes
        .iter()
        .filter(|n| n.last_updated_by.as_deref() == Some(current_username))
        .map(|n| n.id.clone())
        .collect();

    let mut mutual: Vec<NoteActivity> = Vec::new();

    for note in target_user_notes {
        if let Ok(outgoing) = db.get_outgoing_links(&note.id) {
            for linked_note in outgoing {
                if current_user_notes.contains(&linked_note.id) {
                    mutual.push(NoteActivity {
                        id: note.id.clone(),
                        title: note.title.clone(),
                        updated_at: note.updated_at.to_rfc3339(),
                    });
                    break;
                }
            }
        }
    }

    mutual.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    mutual.truncate(10);
    mutual
}

pub async fn get_user_profile(
    State(state): State<AppState>,
    auth: axum::Extension<crate::routes::auth::AuthUser>,
    Path(user_id): Path<String>,
) -> Result<Json<UserProfileResponse>, StatusCode> {
    let db = state.db.lock().await;

    let target_user = db
        .get_user_by_id(&user_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let recent_notes = build_recent_notes(&db, &target_user.username);
    let mutual_work = build_mutual_work(&db, &target_user.username, &auth.username);

    Ok(Json(UserProfileResponse {
        id: target_user.id,
        username: target_user.username,
        display_name: target_user.display_name,
        recent_notes,
        mutual_work,
    }))
}

pub async fn get_user_profile_by_username(
    State(state): State<AppState>,
    auth: axum::Extension<crate::routes::auth::AuthUser>,
    Path(username): Path<String>,
) -> Result<Json<UserProfileResponse>, StatusCode> {
    let db = state.db.lock().await;

    let target_user = db
        .get_user_by_username(&username)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let recent_notes = build_recent_notes(&db, &target_user.username);
    let mutual_work = build_mutual_work(&db, &target_user.username, &auth.username);

    Ok(Json(UserProfileResponse {
        id: target_user.id,
        username: target_user.username,
        display_name: target_user.display_name,
        recent_notes,
        mutual_work,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routes::auth::AuthUser;
    use crate::routes::signaling::SignalingState;
    use axum::response::IntoResponse;
    use axum::Extension;
    use std::sync::Arc;
    use thynk_core::{Database, FilesystemStorage, Note};
    use tokio::sync::Mutex;

    #[tokio::test]
    async fn test_get_user_profile_by_username() {
        let temp_dir = tempfile::tempdir().unwrap();
        let state = {
            let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
            let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();
            db.create_user(
                "user1",
                "alice",
                "alice@example.com",
                Some("Alice"),
                "2024-01-01T00:00:00Z",
            )
            .unwrap();
            db.create_user(
                "user2",
                "bob",
                "bob@example.com",
                Some("Bob"),
                "2024-01-01T00:00:00Z",
            )
            .unwrap();

            let note = Note {
                id: "note-1".to_string(),
                path: std::path::PathBuf::from("alice-note.md"),
                title: "Alice Note".to_string(),
                content: "# Alice Note\nContent here".to_string(),
                content_hash: thynk_core::note::compute_hash("# Alice Note\nContent here"),
                frontmatter: std::collections::HashMap::new(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                last_updated_by: Some("alice".to_string()),
            };
            db.index_note(&note).unwrap();

            let (events, _) = tokio::sync::broadcast::channel(16);
            AppState {
                storage: Arc::new(Mutex::new(storage)),
                db: Arc::new(Mutex::new(db)),
                config: Arc::new(thynk_core::Config::default()),
                events,
                s3_bucket: None,
                signaling: SignalingState::new(),
            }
        };

        let auth_user = AuthUser {
            id: "user1".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "alice".to_string(),
            display_name: None,
        };

        let response = get_user_profile_by_username(
            State(state),
            Extension(auth_user),
            Path("alice".to_string()),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let profile: UserProfileResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(profile.username, "alice");
        assert!(!profile.recent_notes.is_empty());
        assert!(profile.mutual_work.is_empty());
    }

    #[tokio::test]
    async fn test_get_user_profile_mutual_work() {
        let temp_dir = tempfile::tempdir().unwrap();
        let state = {
            let storage = FilesystemStorage::new(temp_dir.path().to_path_buf()).unwrap();
            let db = Database::open(&temp_dir.path().join("db.sqlite")).unwrap();
            db.create_user(
                "user1",
                "alice",
                "alice@example.com",
                Some("Alice"),
                "2024-01-01T00:00:00Z",
            )
            .unwrap();
            db.create_user(
                "user2",
                "bob",
                "bob@example.com",
                Some("Bob"),
                "2024-01-01T00:00:00Z",
            )
            .unwrap();

            let note_alice = Note {
                id: "alice-note".to_string(),
                path: std::path::PathBuf::from("alice-note.md"),
                title: "Alice Note".to_string(),
                content: "# Alice Note\nSee [[bob-note]]".to_string(),
                content_hash: thynk_core::note::compute_hash("# Alice Note\nSee [[bob-note]]"),
                frontmatter: std::collections::HashMap::new(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                last_updated_by: Some("alice".to_string()),
            };
            db.index_note(&note_alice).unwrap();

            let note_bob = Note {
                id: "bob-note".to_string(),
                path: std::path::PathBuf::from("bob-note.md"),
                title: "Bob Note".to_string(),
                content: "# Bob Note\nContent".to_string(),
                content_hash: thynk_core::note::compute_hash("# Bob Note\nContent"),
                frontmatter: std::collections::HashMap::new(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
                last_updated_by: Some("bob".to_string()),
            };
            db.index_note(&note_bob).unwrap();

            db.set_note_links("alice-note", &["bob-note".to_string()])
                .unwrap();

            let (events, _) = tokio::sync::broadcast::channel(16);
            AppState {
                storage: Arc::new(Mutex::new(storage)),
                db: Arc::new(Mutex::new(db)),
                config: Arc::new(thynk_core::Config::default()),
                events,
                s3_bucket: None,
                signaling: SignalingState::new(),
            }
        };

        let auth_user = AuthUser {
            id: "user2".to_string(),
            role: thynk_core::db::UserRole::Owner,
            username: "bob".to_string(),
            display_name: None,
        };

        let response = get_user_profile_by_username(
            State(state),
            Extension(auth_user),
            Path("alice".to_string()),
        )
        .await
        .into_response();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .unwrap();
        let profile: UserProfileResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(profile.username, "alice");
        assert!(!profile.mutual_work.is_empty());
        assert_eq!(profile.mutual_work[0].title, "Alice Note");
    }
}
