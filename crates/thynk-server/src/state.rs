use std::sync::Arc;

use thynk_core::{Config, Database, FilesystemStorage};
use tokio::sync::Mutex;

/// Shared application state passed to all route handlers.
#[derive(Clone)]
#[allow(dead_code)]
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub storage: Arc<Mutex<FilesystemStorage>>,
    pub config: Arc<Config>,
}
