use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use thynk_core::{Config, Database, FilesystemStorage, NoteStorage};

use thynk_server::routes::router;
use thynk_server::state::{AppState, WsEvent};

fn index_all_files(db: &Database, storage: &FilesystemStorage) {
    match storage.list_files() {
        Ok(files) => {
            let count = files.len();

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
                let raw = match storage.read_note(path) {
                    Ok(n) => n,
                    Err(e) => {
                        warn!("Failed to read {}: {e}", path.display());
                        continue;
                    }
                };
                let note = match db.get_note_by_path(path) {
                    Ok(meta) => {
                        let mut n = thynk_core::Note::new(meta.title, raw.content, path.clone());
                        n.id = meta.id;
                        n.created_at = meta.created_at;
                        n
                    }
                    Err(_) => {
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

fn setup_logging() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("thynk=info"));

    let file_appender = tracing_appender::rolling::daily("/tmp/thynk-desktop", "thynk.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(non_blocking)
        .with_ansi(false)
        .init();

    std::mem::forget(_guard);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_logging();

    let config = Config::default();

    std::fs::create_dir_all(&config.data_dir).expect("Failed to create data directory");

    let db = Database::open(&config.db_path).expect("Failed to open database");
    let storage =
        FilesystemStorage::new(config.data_dir.clone()).expect("Failed to create storage");

    let now = chrono::Utc::now().to_rfc3339();
    if let Err(e) = db.cleanup_expired_sessions(&now) {
        warn!("Failed to clean up expired sessions: {e}");
    }

    index_all_files(&db, &storage);

    let doc_count = db.list_notes().map(|n| n.len()).unwrap_or(0);
    info!(
        "Data directory: {} ({} files)",
        config.data_dir.display(),
        doc_count
    );

    let _data_dir = storage.data_dir().clone();

    let (events_tx, _) = broadcast::channel::<WsEvent>(256);

    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        storage: Arc::new(Mutex::new(storage)),
        config: Arc::new(config.clone()),
        events: events_tx.clone(),
        s3_bucket: None,
    };

    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:5173".parse().unwrap(),
            "http://127.0.0.1:5173".parse().unwrap(),
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = router(state.clone()).layer(cors);

    let dist_path = PathBuf::from("../frontend/dist");
    let app = if dist_path.exists() {
        info!("Serving static files from {}", dist_path.display());
        api_router.fallback_service(
            ServeDir::new(&dist_path).not_found_service(ServeFile::new(dist_path.join("index.html"))),
        )
    } else {
        info!("Frontend dist not found at {}, serving API only", dist_path.display());
        api_router
    };

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            let listener = tokio::net::TcpListener::bind("0.0.0.0:5173").await.unwrap();
            info!("Desktop server listening on http://localhost:5173");
            axum::serve(listener, app).await.unwrap();
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            let window = tauri::WebviewWindowBuilder::new(
                &handle,
                "main",
                tauri::WebviewUrl::App("http://localhost:5173".into()),
            )
            .title("Thynk")
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 600.0)
            .resizable(true)
            .center()
            .build()
            .unwrap();

            info!("Desktop app window ready");
            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
