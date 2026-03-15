use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use axum_extra::extract::cookie::Cookie;
use axum_extra::extract::CookieJar;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

const SESSION_COOKIE: &str = "thynk_session";

/// Authenticated user info, injected by the require_auth middleware as a request extension.
#[derive(Clone)]
pub struct AuthUser {
    pub username: String,
    pub display_name: Option<String>,
}
/// 30 days in seconds.
const SESSION_MAX_AGE_SECS: i64 = 2_592_000;

// ── Error helper ──────────────────────────────────────────────────────────────

fn err_json(status: StatusCode, error: &str, message: &str) -> Response {
    (
        status,
        Json(serde_json::json!({ "error": error, "message": message })),
    )
        .into_response()
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
}

pub async fn register(
    jar: CookieJar,
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Response {
    let token = jar.get(SESSION_COOKIE).map(|c| c.value().to_string());

    let db = state.db.lock().await;

    // First-run check: if users already exist, require a valid session.
    let user_count = match db.count_users() {
        Ok(c) => c,
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            );
        }
    };

    if user_count > 0 {
        // Require authentication to create additional users.
        if validate_token(token.as_deref(), &db).is_err() {
            return err_json(
                StatusCode::FORBIDDEN,
                "registration_closed",
                "Registration requires an invitation from an existing user",
            );
        }
    }

    // Hash the password.
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
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
    let created_at = chrono::Utc::now().to_rfc3339();

    if let Err(e) = db.create_user(
        &id,
        &body.username,
        &password_hash,
        body.display_name.as_deref(),
        &created_at,
    ) {
        let msg = e.to_string();
        // Unique constraint failure → username taken.
        if msg.contains("UNIQUE") {
            return err_json(
                StatusCode::CONFLICT,
                "username_taken",
                "username already exists",
            );
        }
        return err_json(StatusCode::INTERNAL_SERVER_ERROR, "db_error", &msg);
    }

    (
        StatusCode::CREATED,
        Json(RegisterResponse {
            id,
            username: body.username,
            display_name: body.display_name,
        }),
    )
        .into_response()
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub storage_used: i64,
    pub storage_limit: i64,
}

pub async fn login(
    jar: CookieJar,
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Response {
    let db = state.db.lock().await;

    let user = match db.get_user_by_username(&body.username) {
        Ok(Some(u)) => u,
        Ok(None) => {
            return err_json(
                StatusCode::UNAUTHORIZED,
                "invalid_credentials",
                "invalid username or password",
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

    // Verify password.
    let parsed_hash = match PasswordHash::new(&user.password_hash) {
        Ok(h) => h,
        Err(e) => {
            return err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                "hash_error",
                &e.to_string(),
            );
        }
    };
    if Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return err_json(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            "invalid username or password",
        );
    }

    // Generate session token (32 random bytes, hex-encoded).
    let token_bytes: [u8; 32] = rand::random();
    let token: String = token_bytes.iter().map(|b| format!("{b:02x}")).collect();

    let now = chrono::Utc::now();
    let expires_at = now + chrono::Duration::seconds(SESSION_MAX_AGE_SECS);

    if let Err(e) = db.create_session(
        &token,
        &user.id,
        &now.to_rfc3339(),
        &expires_at.to_rfc3339(),
    ) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    if let Err(e) = db.update_last_login(&user.id, &now.to_rfc3339()) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    let mut cookie = Cookie::new(SESSION_COOKIE, token);
    cookie.set_http_only(true);
    cookie.set_same_site(axum_extra::extract::cookie::SameSite::Lax);
    cookie.set_path("/");
    cookie.set_max_age(time::Duration::seconds(SESSION_MAX_AGE_SECS));

    let new_jar = jar.add(cookie);

    (
        new_jar,
        Json(LoginResponse {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            storage_used: user.storage_used,
            storage_limit: user.storage_limit,
        }),
    )
        .into_response()
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

pub async fn logout(jar: CookieJar, State(state): State<AppState>) -> Response {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        let token = cookie.value().to_string();
        let db = state.db.lock().await;
        let _ = db.delete_session(&token);
    }

    let mut removal = Cookie::new(SESSION_COOKIE, "");
    removal.set_path("/");
    removal.set_max_age(time::Duration::seconds(0));

    let new_jar = jar.remove(removal);
    (new_jar, StatusCode::NO_CONTENT).into_response()
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MeResponse {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub storage_used: i64,
    pub storage_limit: i64,
}

pub async fn me(jar: CookieJar, State(state): State<AppState>) -> Response {
    let token = jar.get(SESSION_COOKIE).map(|c| c.value().to_string());

    let db = state.db.lock().await;

    match validate_token(token.as_deref(), &db) {
        Ok(user) => (
            StatusCode::OK,
            Json(MeResponse {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                storage_used: user.storage_used,
                storage_limit: user.storage_limit,
            }),
        )
            .into_response(),
        Err(response) => response,
    }
}

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpdateMeRequest {
    pub display_name: Option<String>,
}

pub async fn update_me(
    axum::extract::Extension(auth_user): axum::extract::Extension<AuthUser>,
    State(state): State<AppState>,
    Json(body): Json<UpdateMeRequest>,
) -> Response {
    let db = state.db.lock().await;

    let user = match db.get_user_by_username(&auth_user.username) {
        Ok(Some(u)) => u,
        Ok(None) => {
            return err_json(
                StatusCode::NOT_FOUND,
                "not_found",
                "User not found",
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

    if let Err(e) = db.update_display_name(&user.id, body.display_name.as_deref()) {
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            "db_error",
            &e.to_string(),
        );
    }

    let updated_display_name = body.display_name;
    (
        StatusCode::OK,
        Json(MeResponse {
            id: user.id,
            username: user.username,
            display_name: updated_display_name,
            storage_used: user.storage_used,
            storage_limit: user.storage_limit,
        }),
    )
        .into_response()
}

// ── Auth middleware ────────────────────────────────────────────────────────────

/// Tower middleware that rejects unauthenticated requests with 401.
/// Apply this to all protected API routes.
pub async fn require_auth(
    State(state): State<crate::state::AppState>,
    jar: CookieJar,
    mut request: Request,
    next: Next,
) -> Response {
    let token = jar.get(SESSION_COOKIE).map(|c| c.value().to_string());
    let db = state.db.lock().await;
    match validate_token(token.as_deref(), &db) {
        Ok(user) => {
            drop(db);
            request.extensions_mut().insert(AuthUser {
                username: user.username,
                display_name: user.display_name,
            });
            next.run(request).await
        }
        Err(response) => response,
    }
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/// Validate a session token string and return the `UserRecord`, or a 401 Response.
#[allow(clippy::result_large_err)]
fn validate_token(
    token: Option<&str>,
    db: &thynk_core::Database,
) -> Result<thynk_core::UserRecord, Response> {
    let token = match token {
        Some(t) => t,
        None => {
            return Err(err_json(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required",
            ));
        }
    };

    let session = match db.get_session(token) {
        Ok(Some(s)) => s,
        Ok(None) => {
            return Err(err_json(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required",
            ));
        }
        Err(_) => {
            return Err(err_json(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required",
            ));
        }
    };

    // Check expiry.
    let expires_at = chrono::DateTime::parse_from_rfc3339(&session.expires_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::DateTime::<chrono::Utc>::MIN_UTC);
    if chrono::Utc::now() > expires_at {
        return Err(err_json(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Session expired",
        ));
    }

    // Look up the user.
    let user = match db.get_user_by_id(&session.user_id) {
        Ok(Some(u)) => u,
        _ => {
            return Err(err_json(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required",
            ));
        }
    };

    Ok(user)
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use std::sync::Arc;
    use tokio::sync::{broadcast, Mutex};
    use tower::ServiceExt;

    use thynk_core::{Config, Database, FilesystemStorage};

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
    async fn test_register_first_user() {
        let app = routes::router(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/register")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "username": "alice",
                            "password": "secret123"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["username"], "alice");
    }

    #[tokio::test]
    async fn test_login_and_me() {
        let state = test_state();
        let app = routes::router(state.clone());

        // Register first.
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "bob", "password": "pass123" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        // Login.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "bob", "password": "pass123" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::OK);

        // Extract the Set-Cookie header.
        let cookie_header = res
            .headers()
            .get("set-cookie")
            .expect("should have Set-Cookie header")
            .to_str()
            .unwrap()
            .to_string();

        // Extract just the cookie value (name=value part).
        let cookie_value = cookie_header.split(';').next().unwrap().to_string();

        // Call /api/auth/me with the session cookie.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .header("cookie", &cookie_value)
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
        assert_eq!(json["username"], "bob");
    }

    #[tokio::test]
    async fn test_me_unauthenticated() {
        let app = routes::router(test_state());

        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_login_wrong_password() {
        let state = test_state();

        // Register.
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "carol", "password": "correct" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        // Login with wrong password.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "carol", "password": "wrong" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_logout() {
        let state = test_state();

        // Register + login.
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({ "username": "dave", "password": "pass" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({ "username": "dave", "password": "pass" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let cookie_header = res
            .headers()
            .get("set-cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let cookie_value = cookie_header.split(';').next().unwrap().to_string();

        // Logout.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/logout")
                    .header("cookie", &cookie_value)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);

        // After logout, /me should be 401.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .header("cookie", &cookie_value)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }
}
