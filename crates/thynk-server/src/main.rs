mod routes;
mod state;

use std::sync::Arc;

use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::EnvFilter;

use thynk_core::{Config, Database, FilesystemStorage};

use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("thynk=info".parse()?))
        .init();

    let config = Config::default();

    std::fs::create_dir_all(&config.data_dir)?;

    let db = Database::open(&config.db_path)?;
    let storage = FilesystemStorage::new(config.data_dir.clone())?;

    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        storage: Arc::new(Mutex::new(storage)),
        config: Arc::new(config.clone()),
    };

    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5173".parse()?,
            "http://127.0.0.1:5173".parse()?,
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::router().layer(cors).with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("listening on {addr}");
    axum::serve(listener, app).await?;

    Ok(())
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

        AppState {
            db: Arc::new(Mutex::new(db)),
            storage: Arc::new(Mutex::new(storage)),
            config: Arc::new(Config::default()),
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

        // Create
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

        // Get
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
}
