mod routes;
mod state;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use notify::{RecursiveMode, Watcher};
use tokio::sync::{broadcast, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use thynk_core::{Config, Database, FilesystemStorage, NoteStorage};

use crate::state::{AppState, WsEvent};

/// Attempt to create an S3 Bucket from environment variables.
/// Returns None (with a log) if any required env var is missing or creation fails.
fn build_s3_bucket() -> Option<Arc<s3::Bucket>> {
    let endpoint = std::env::var("S3_ENDPOINT").ok()?;
    let bucket_name = std::env::var("S3_BUCKET").ok()?;
    let access_key = std::env::var("S3_ACCESS_KEY").ok()?;
    let secret_key = std::env::var("S3_SECRET_KEY").ok()?;
    let region_name = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    let credentials =
        match s3::creds::Credentials::new(Some(&access_key), Some(&secret_key), None, None, None) {
            Ok(c) => c,
            Err(e) => {
                warn!("S3 credentials error: {e}");
                return None;
            }
        };
    let region = s3::Region::Custom {
        region: region_name,
        endpoint,
    };
    match s3::Bucket::new(&bucket_name, region, credentials) {
        Ok(bucket) => {
            let bucket = *bucket.with_path_style();
            info!("S3 bucket configured: {bucket_name}");
            Some(Arc::new(bucket))
        }
        Err(e) => {
            warn!("Failed to configure S3 bucket: {e}");
            None
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("thynk=info".parse()?))
        .init();

    let config = Config::default();

    std::fs::create_dir_all(&config.data_dir)?;

    let db = Database::open(&config.db_path)?;
    let storage = FilesystemStorage::new(config.data_dir.clone())?;

    // Clean up any expired sessions from previous runs.
    let now = chrono::Utc::now().to_rfc3339();
    if let Err(e) = db.cleanup_expired_sessions(&now) {
        warn!("Failed to clean up expired sessions: {e}");
    }

    // Index all existing markdown files on startup.
    index_all_files(&db, &storage);

    let doc_count = db.list_notes().map(|n| n.len()).unwrap_or(0);
    println!(
        "Data directory: {} ({} files)",
        config.data_dir.display(),
        doc_count
    );

    let data_dir = storage.data_dir().clone();

    let (events_tx, _) = broadcast::channel::<WsEvent>(256);

    let s3_bucket = build_s3_bucket();
    if let Some(ref bucket) = s3_bucket {
        let bucket_name = std::env::var("S3_BUCKET").unwrap_or_default();
        info!("Uploads: S3 (bucket: {bucket_name})");
        // Health check — non-fatal.
        match bucket.list("".to_string(), None).await {
            Ok(_) => info!("S3 health check: OK"),
            Err(e) => warn!("S3 health check failed: {e}. Uploads may fail."),
        }
    } else {
        let uploads_path = config.data_dir.join(".uploads");
        info!("Uploads: local filesystem ({})", uploads_path.display());
    }

    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        storage: Arc::new(Mutex::new(storage)),
        config: Arc::new(config.clone()),
        events: events_tx.clone(),
        s3_bucket,
    };

    // Start file watcher in background.
    let watcher_state = state.clone();
    tokio::spawn(start_file_watcher(data_dir, watcher_state));

    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5173".parse()?,
            "http://127.0.0.1:5173".parse()?,
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router: API routes + optional static file serving.
    let api_router = routes::router(state).layer(cors);

    // Serve built frontend from frontend/dist if it exists.
    let dist_path = PathBuf::from("frontend/dist");
    let app = if dist_path.exists() {
        info!("Serving static files from {}", dist_path.display());
        api_router.fallback_service(
            ServeDir::new(&dist_path)
                .not_found_service(ServeFile::new(dist_path.join("index.html"))),
        )
    } else {
        api_router
    };

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("listening on {addr}");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Walk the data directory and index every markdown file into SQLite.
/// Also purges DB entries for files that no longer exist on disk.
fn index_all_files(db: &Database, storage: &FilesystemStorage) {
    match storage.list_files() {
        Ok(files) => {
            let count = files.len();

            // Purge orphaned DB entries (notes in DB whose file no longer exists).
            if let Ok(db_notes) = db.list_notes() {
                use std::collections::HashSet;
                let on_disk: HashSet<std::path::PathBuf> = files.iter().cloned().collect();
                let mut purged = 0usize;
                for meta in db_notes {
                    if !on_disk.contains(&meta.path) {
                        if let Err(e) = db.delete_note(&meta.id) {
                            warn!("Failed to purge orphan {}: {e}", meta.path.display());
                        } else {
                            purged += 1;
                        }
                    }
                }
                if purged > 0 {
                    info!("Purged {purged} orphaned DB entry/entries with no corresponding file");
                }
            }

            for path in &files {
                // Read raw content from file.
                let raw = match storage.read_note(path) {
                    Ok(n) => n,
                    Err(e) => {
                        warn!("Failed to read {}: {e}", path.display());
                        continue;
                    }
                };
                // Look up existing note by path to preserve ID, or create a new one.
                let note = match db.get_note_by_path(path) {
                    Ok(meta) => {
                        let mut n = thynk_core::Note::new(meta.title, raw.content, path.clone());
                        n.id = meta.id;
                        n.created_at = meta.created_at;
                        n
                    }
                    Err(_) => {
                        // New file: derive title from filename.
                        let title = path
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .replace(['-', '_'], " ");
                        let title = if title.is_empty() {
                            "Untitled".to_string()
                        } else {
                            title
                        };
                        thynk_core::Note::new(title, raw.content, path.clone())
                    }
                };
                if let Err(e) = db.index_note(&note) {
                    warn!("Failed to index {}: {e}", path.display());
                }
            }
            info!("Startup indexing complete: {count} file(s) indexed");
        }
        Err(e) => warn!("Startup indexing failed: {e}"),
    }
}

/// Watch the data directory for filesystem changes and update the index + broadcast events.
async fn start_file_watcher(data_dir: PathBuf, state: AppState) {
    let (sync_tx, sync_rx) = std::sync::mpsc::channel();

    let mut watcher = match notify::recommended_watcher(sync_tx) {
        Ok(w) => w,
        Err(e) => {
            warn!("Failed to create file watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&data_dir, RecursiveMode::Recursive) {
        warn!("Failed to watch {}: {e}", data_dir.display());
        return;
    }

    info!("Watching {} for changes", data_dir.display());

    // Bridge the sync notify channel to an async tokio channel.
    let (async_tx, mut async_rx) = tokio::sync::mpsc::channel(64);
    std::thread::spawn(move || {
        let _watcher = watcher; // keep watcher alive
        for event in sync_rx.iter().flatten() {
            let _ = async_tx.blocking_send(event);
        }
    });

    while let Some(event) = async_rx.recv().await {
        handle_file_event(event, &state, &data_dir).await;
    }
}

async fn handle_file_event(event: notify::Event, state: &AppState, data_dir: &Path) {
    use notify::EventKind;

    for path in &event.paths {
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let rel = match path.strip_prefix(data_dir) {
            Ok(p) => p.to_path_buf(),
            Err(_) => continue,
        };
        let rel_str = rel.to_string_lossy().to_string();

        match event.kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                let raw = {
                    let storage = state.storage.lock().await;
                    match storage.read_note(&rel) {
                        Ok(n) => n,
                        Err(e) => {
                            warn!("Failed to read {rel_str} after change: {e}");
                            continue;
                        }
                    }
                };

                let db = state.db.lock().await;
                let note = match db.get_note_by_path(&rel) {
                    Ok(meta) => {
                        let mut n = thynk_core::Note::new(meta.title, raw.content, rel.clone());
                        n.id = meta.id;
                        n.created_at = meta.created_at;
                        n
                    }
                    Err(_) => {
                        let title = rel
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .replace(['-', '_'], " ");
                        let title = if title.is_empty() {
                            "Untitled".to_string()
                        } else {
                            title
                        };
                        thynk_core::Note::new(title, raw.content, rel.clone())
                    }
                };

                if let Err(e) = db.index_note(&note) {
                    warn!("Re-index failed for {rel_str}: {e}");
                } else {
                    let ev = if matches!(event.kind, EventKind::Create(_)) {
                        WsEvent::FileCreated { path: rel_str }
                    } else {
                        WsEvent::FileModified { path: rel_str }
                    };
                    let _ = state.events.send(ev);
                }
            }
            EventKind::Remove(_) => {
                let db = state.db.lock().await;
                let _ = db.delete_note_by_path(&rel);
                let _ = state.events.send(WsEvent::FileDeleted { path: rel_str });
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

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

    /// Register a user and return the session cookie string ("thynk_session=<token>").
    async fn setup_auth(state: &AppState) -> String {
        // Register first user.
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({"username": "admin", "password": "password"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        // Login and extract session cookie.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"username": "admin", "password": "password"})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let cookie_header = res
            .headers()
            .get("set-cookie")
            .expect("login should set cookie")
            .to_str()
            .unwrap()
            .to_string();
        cookie_header.split(';').next().unwrap().to_string()
    }

    #[tokio::test]
    async fn test_list_notes_empty() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/notes")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_list_notes_requires_auth() {
        let app = routes::router(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/notes")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_create_and_get_note() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state.clone());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .body(Body::from(
                        serde_json::json!({
                            "title": "Test Note",
                            "content": "Hello world"
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
        let note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let id = note["id"].as_str().unwrap();
        assert!(note["content_hash"].as_str().is_some_and(|h| !h.is_empty()));

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/notes/{id}"))
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_note_no_content() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "No Content" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
    }

    #[tokio::test]
    async fn test_update_note_if_match() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        // Create a note.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "Hash Test", "content": "v1" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let id = note["id"].as_str().unwrap();
        let hash = note["content_hash"].as_str().unwrap();

        // Update with correct If-Match — should succeed.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .header("if-match", hash)
                    .body(Body::from(
                        serde_json::json!({ "content": "v2" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // Update with wrong If-Match — should fail with 412.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .header("if-match", "wrong-hash")
                    .body(Body::from(
                        serde_json::json!({ "content": "v3" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::PRECONDITION_FAILED);
    }

    #[tokio::test]
    async fn test_search_empty() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/search?q=test")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_tree_empty() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/tree")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_not_found() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/notes/nonexistent-id")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_delete_note() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "Delete Me", "content": "bye" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let id = note["id"].as_str().unwrap();

        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(&format!("/api/notes/{id}"))
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn test_search_finds_note_after_update() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        // Create a note.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "Search Test", "content": "findme keyword" })
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        // Search for it.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/search?q=findme")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let results: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(
            results.as_array().unwrap().len() >= 1,
            "should find the note"
        );
    }

    /// Register a second user using an existing user's session cookie.
    async fn setup_second_user(state: &AppState, admin_cookie: &str, username: &str) -> String {
        // Register second user (requires existing auth).
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .header("cookie", admin_cookie)
                .body(Body::from(
                    serde_json::json!({"username": username, "password": "pass2"}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        // Login as second user.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::json!({"username": username, "password": "pass2"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let cookie_header = res
            .headers()
            .get("set-cookie")
            .expect("login should set cookie")
            .to_str()
            .unwrap()
            .to_string();
        cookie_header.split(';').next().unwrap().to_string()
    }

    #[tokio::test]
    async fn test_lock_prevents_second_user_from_updating() {
        let state = test_state();
        let admin_cookie = setup_auth(&state).await;
        let bob_cookie = setup_second_user(&state, &admin_cookie, "bob").await;

        // Create a note as admin.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &admin_cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "Lockable Note", "content": "v1" })
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
        let note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let id = note["id"].as_str().unwrap();

        // Admin acquires lock.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(&format!("/api/notes/{id}/lock"))
                    .header("cookie", &admin_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // Bob tries to update the locked note — must get 423.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
                    .header("cookie", &bob_cookie)
                    .body(Body::from(
                        serde_json::json!({ "content": "bob's edit" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::from_u16(423).unwrap());

        // Admin (lock owner) can still update.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
                    .header("cookie", &admin_cookie)
                    .body(Body::from(
                        serde_json::json!({ "content": "admin's edit" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_lock_get_returns_locker_info() {
        let state = test_state();
        let admin_cookie = setup_auth(&state).await;

        // Create a note.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
                    .header("cookie", &admin_cookie)
                    .body(Body::from(
                        serde_json::json!({ "title": "Lock Test" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let id = note["id"].as_str().unwrap();

        // GET lock before acquiring — should be unlocked.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/notes/{id}/lock"))
                    .header("cookie", &admin_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let lock: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(lock["locked"], false);

        // Acquire lock.
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri(&format!("/api/notes/{id}/lock"))
                .header("cookie", &admin_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

        // GET lock after acquiring — should be locked by admin.
        let app = routes::router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/notes/{id}/lock"))
                    .header("cookie", &admin_cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let lock: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(lock["locked"], true);
        assert_eq!(lock["user"], "admin");
    }

    /// Verify that `index_all_files` does not modify files that already exist in the data dir.
    #[test]
    fn test_startup_does_not_modify_existing_files() {
        use std::fs;
        use std::time::SystemTime;

        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("existing.md");

        // Write a pre-existing file.
        fs::write(&file_path, "# Existing note\n\nContent").unwrap();

        // Record mtime and content before indexing.
        let meta_before = fs::metadata(&file_path).unwrap();
        let mtime_before = meta_before.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let content_before = fs::read_to_string(&file_path).unwrap();

        // Run the indexing routine (this is what happens on server startup).
        let db = Database::open_in_memory().unwrap();
        let storage = FilesystemStorage::new(dir.keep()).unwrap();
        index_all_files(&db, &storage);

        // Verify file was NOT modified.
        let meta_after = fs::metadata(&file_path).unwrap();
        let mtime_after = meta_after.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let content_after = fs::read_to_string(&file_path).unwrap();

        assert_eq!(
            content_before, content_after,
            "startup indexing must not change file contents"
        );
        assert_eq!(
            mtime_before, mtime_after,
            "startup indexing must not touch file modification time"
        );
    }

    #[tokio::test]
    async fn test_search_finds_indexed_note() {
        let state = test_state();
        let cookie = setup_auth(&state).await;

        // Create a note.
        let app = routes::router(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/notes")
                .header("content-type", "application/json")
                .header("cookie", &cookie)
                .body(Body::from(
                    serde_json::json!({
                        "title": "Searchable Note",
                        "content": "unique_keyword_xyz"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

        // Search for it.
        let app = routes::router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/search?q=unique_keyword_xyz")
                    .header("cookie", &cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap();
        let results: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(results.as_array().unwrap().len() >= 1);
    }

    #[tokio::test]
    async fn test_static_file_serving_serves_index_html() {
        use std::path::PathBuf;
        use tower_http::services::ServeDir;

        let state = test_state();
        let api_router = routes::router(state);

        // Create a temporary dist directory with an index.html
        let dist_dir = tempfile::tempdir().unwrap();
        std::fs::write(dist_dir.path().join("index.html"), "<html>test</html>").unwrap();

        // Build the app with static file serving (like desktop should do)
        let app = api_router.fallback_service(
            ServeDir::new(dist_dir.path())
                .not_found_service(ServeFile::new(dist_dir.path().join("index.html"))),
        );

        // Test that root path serves index.html
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"<html>test</html>");
    }
}
