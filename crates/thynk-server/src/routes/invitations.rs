use axum::extract::{State, Extension};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use argon2::password_hash::PasswordHasher;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;
use crate::routes::auth::{err_json, AuthUser};
use thynk_core::db::UserRole;

const INVITATION_EXPIRY_DAYS: i64 = 7;

#[derive(Serialize)]
pub struct InvitationResponse {
    pub id: String,
    pub email: String,
    pub role: String,
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role: Option<String>,
}

#[derive(Deserialize)]
pub struct AcceptInvitationRequest {
    pub token: String,
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Serialize)]
pub struct AcceptInvitationResponse {
    pub id: String,
    pub username: String,
    pub role: String,
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub async fn create_invitation(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    Json(body): Json<CreateInvitationRequest>,
) -> Response {
    if auth_user.role != UserRole::Owner && auth_user.role != UserRole::Admin {
        return err_json(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only owners and admins can create invitations",
        );
    }

    let db = state.db.lock().await;

    if let Ok(Some(_)) = db.get_user_by_username(&body.email) {
        return err_json(
            StatusCode::CONFLICT,
            "user_exists",
            "A user with this email already exists",
        );
    }

    if let Ok(Some(_)) = db.get_invitation_by_email(&body.email) {
        return err_json(
            StatusCode::CONFLICT,
            "invitation_exists",
            "An invitation already exists for this email",
        );
    }

    let id = Uuid::new_v4().to_string();
    let token = generate_token();
    let now = chrono::Utc::now();
    let expires = now + chrono::Duration::days(INVITATION_EXPIRY_DAYS);
    let role = body.role.unwrap_or_else(|| "viewer".to_string());

    if let Err(e) = db.create_invitation(
        &id,
        &body.email,
        &role,
        &auth_user.id,
        &token,
        &expires.to_rfc3339(),
        &now.to_rfc3339(),
    ) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    (
        StatusCode::CREATED,
        Json(InvitationResponse {
            id,
            email: body.email,
            role,
            expires_at: expires.to_rfc3339(),
            created_at: now.to_rfc3339(),
        }),
    )
        .into_response()
}

pub async fn list_invitations(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
) -> Response {
    if auth_user.role != UserRole::Owner && auth_user.role != UserRole::Admin {
        return err_json(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only owners and admins can list invitations",
        );
    }

    let db = state.db.lock().await;

    match db.list_invitations() {
        Ok(invs) => {
            let response: Vec<InvitationResponse> = invs
                .into_iter()
                .map(|i| InvitationResponse {
                    id: i.id,
                    email: i.email,
                    role: i.role,
                    expires_at: i.expires_at,
                    created_at: i.created_at,
                })
                .collect();
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        )
        .into_response(),
    }
}

pub async fn revoke_invitation(
    Extension(auth_user): Extension<AuthUser>,
    State(state): State<AppState>,
    axum::extract::Path(invitation_id): axum::extract::Path<String>,
) -> Response {
    if auth_user.role != UserRole::Owner && auth_user.role != UserRole::Admin {
        return err_json(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only owners and admins can revoke invitations",
        );
    }

    let db = state.db.lock().await;

    if let Err(e) = db.delete_invitation(&invitation_id) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    (StatusCode::NO_CONTENT).into_response()
}

pub async fn accept_invitation(
    State(state): State<AppState>,
    Json(body): Json<AcceptInvitationRequest>,
) -> Response {
    let db = state.db.lock().await;

    let invitation = match db.get_invitation_by_token(&body.token) {
        Ok(Some(i)) => i,
        Ok(None) => {
            return err_json(
                StatusCode::NOT_FOUND,
                "invalid_token",
                "Invalid invitation token",
            );
        }
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            );
        }
    };

    let now = chrono::Utc::now();
    let expires = match chrono::DateTime::parse_from_rfc3339(&invitation.expires_at) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "invalid_expiry",
                "Invalid invitation expiry date",
            );
        }
    };

    if now > expires {
        return err_json(
            StatusCode::GONE,
            "expired",
            "Invitation has expired",
        );
    }

    if let Ok(Some(_)) = db.get_user_by_username(&body.username) {
        return err_json(
            StatusCode::CONFLICT,
            "username_taken",
            "Username already exists",
        );
    }

    let salt = argon2::password_hash::SaltString::generate(&mut OsRng);
    let argon2 = argon2::Argon2::default();
    let password_hash = match argon2.hash_password(body.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "hash_error",
                &e.to_string(),
            );
        }
    };

    let id = Uuid::new_v4().to_string();
    let role: UserRole = invitation.role.parse().unwrap_or(UserRole::Viewer);

    if let Err(e) = db.create_user_with_role(
        &id,
        &body.username,
        &password_hash,
        body.display_name.as_deref(),
        &now.to_rfc3339(),
        role,
    ) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    if let Err(e) = db.delete_invitation(&invitation.id) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    (
        StatusCode::CREATED,
        Json(AcceptInvitationResponse {
            id,
            username: body.username,
            role: invitation.role,
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use std::sync::Arc;
    use tokio::sync::{broadcast, Mutex};
    use tower::ServiceExt;

    use thynk_core::{Config, Database, FilesystemStorage, NoteStorage};

    use crate::routes;
    use crate::state::AppState;

    fn test_state() -> AppState {
        let db = Database::open_in_memory().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.keep()).unwrap();
        let (events, _) = broadcast::channel(16);
        AppState {
            db: Arc::new(Mutex::new(db)),
            storage: Arc::new(Mutex::new(storage)),
            config: Arc::new(Config::default()),
            events,
            s3_bucket: None,
        }
    }

    #[tokio::test]
    async fn test_owner_can_create_invitation() {
        let state = test_state();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let owner_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations")
                    .header("content-type", "application/json")
                    .header("cookie", &owner_cookie)
                    .body(Body::from(
                        serde_json::json!({
                            "email": "newuser@example.com",
                            "role": "editor"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["email"], "newuser@example.com");
        assert_eq!(json["role"], "editor");
    }

    #[tokio::test]
    async fn test_viewer_cannot_create_invitation() {
        let state = test_state();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let owner_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .header("cookie", &owner_cookie)
                .body(Body::from(
                    serde_json::json!({ "username": "viewer", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "viewer", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let viewer_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations")
                    .header("content-type", "application/json")
                    .header("cookie", &viewer_cookie)
                    .body(Body::from(
                        serde_json::json!({ "email": "test@example.com" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn test_accept_invitation() {
        let state = test_state();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let owner_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations")
                    .header("content-type", "application/json")
                    .header("cookie", &owner_cookie)
                    .body(Body::from(
                        serde_json::json!({
                            "email": "newuser@example.com",
                            "role": "editor"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let _json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        let storage = state.storage.lock().await;
        let note = thynk_core::Note::new(
            "Test".into(),
            "Content".into(),
            std::path::PathBuf::from("test.md"),
        );
        storage.write_note(&note).unwrap();
        drop(storage);
        let db = state.db.lock().await;
        db.index_note(&note).unwrap();
        let inv = db.get_invitation_by_email("newuser@example.com").ok().flatten().unwrap();
        drop(db);

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations/accept")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "token": "invalid_token",
                            "username": "newuser",
                            "password": "password123"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations/accept")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "token": inv.token,
                            "username": "newuser",
                            "password": "password123"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["username"], "newuser");
        assert_eq!(json["role"], "editor");
    }

    #[tokio::test]
    async fn test_list_invitations() {
        let state = test_state();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let owner_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/invitations")
                .header("content-type", "application/json")
                .header("cookie", &owner_cookie)
                .body(Body::from(
                    serde_json::json!({ "email": "user1@example.com" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/invitations")
                .header("content-type", "application/json")
                .header("cookie", &owner_cookie)
                .body(Body::from(
                    serde_json::json!({ "email": "user2@example.com", "role": "admin" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/invitations")
                    .header("cookie", &owner_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json.is_array());
        assert_eq!(json.as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_revoke_invitation() {
        let state = test_state();

        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let login_res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "owner", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = login_res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let owner_cookie = cookie_header.split(';').next().unwrap().to_string();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/invitations")
                    .header("content-type", "application/json")
                    .header("cookie", &owner_cookie)
                    .body(Body::from(
                        serde_json::json!({ "email": "user@example.com" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let invitation_id = json["id"].as_str().unwrap();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(&format!("/api/invitations/{}", invitation_id))
                    .header("cookie", &owner_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/invitations")
                    .header("cookie", &owner_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json.as_array().unwrap().is_empty());
    }
}