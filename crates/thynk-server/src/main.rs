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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("thynk=info".parse()?))
        .init();

    let config = Config::default();

    std::fs::create_dir_all(&config.data_dir)?;

    let db = Database::open(&config.db_path)?;
    let storage = FilesystemStorage::new(config.data_dir.clone())?;

    // Index all existing markdown files on startup.
    index_all_files(&db, &storage);

    let data_dir = storage.data_dir().clone();

    let (events_tx, _) = broadcast::channel::<WsEvent>(256);

    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        storage: Arc::new(Mutex::new(storage)),
        config: Arc::new(config.clone()),
        events: events_tx.clone(),
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
    let api_router = routes::router().with_state(state).layer(cors);

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
fn index_all_files(db: &Database, storage: &FilesystemStorage) {
    match storage.list_files() {
        Ok(files) => {
            let count = files.len();
            for path in files {
                match storage.read_note(&path) {
                    Ok(note) => {
                        if let Err(e) = db.index_note(&note) {
                            warn!("Failed to index {}: {e}", path.display());
                        }
                    }
                    Err(e) => warn!("Failed to read {}: {e}", path.display()),
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
                let storage = state.storage.lock().await;
                match storage.read_note(&rel) {
                    Ok(note) => {
                        drop(storage);
                        let db = state.db.lock().await;
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
                    Err(e) => warn!("Failed to read {rel_str} after change: {e}"),
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
        }
    }

    #[tokio::test]
    async fn test_list_notes_empty() {
        let app = routes::router().with_state(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/notes")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_and_get_note() {
        let state = test_state();

        let app = routes::router().with_state(state.clone());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
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

        let app = routes::router().with_state(state);
        let response = app
            .oneshot(
                Request::builder()
                    .uri(&format!("/api/notes/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_note_no_content() {
        // content is now optional — omitting it should succeed.
        let app = routes::router().with_state(test_state());
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
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

        // Create a note.
        let app = routes::router().with_state(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
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
        let app = routes::router().with_state(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
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
        let app = routes::router().with_state(state);
        let res = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(&format!("/api/notes/{id}"))
                    .header("content-type", "application/json")
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
        let app = routes::router().with_state(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/search?q=test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_tree_empty() {
        let app = routes::router().with_state(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/tree")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_not_found() {
        let app = routes::router().with_state(test_state());

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/notes/nonexistent-id")
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

        let app = routes::router().with_state(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/notes")
                    .header("content-type", "application/json")
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

        let app = routes::router().with_state(state);
        let res = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(&format!("/api/notes/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn test_search_finds_indexed_note() {
        let state = test_state();

        // Create a note.
        let app = routes::router().with_state(state.clone());
        app.oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/notes")
                .header("content-type", "application/json")
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
        let app = routes::router().with_state(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/search?q=unique_keyword_xyz")
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
}
