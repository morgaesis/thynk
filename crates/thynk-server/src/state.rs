use std::sync::Arc;

use serde::{Deserialize, Serialize};
use thynk_core::{Config, Database, FilesystemStorage};
use tokio::sync::{broadcast, Mutex};

/// Events broadcast to all connected WebSocket clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::enum_variant_names)]
pub enum WsEvent {
    FileCreated { path: String },
    FileModified { path: String },
    FileDeleted { path: String },
}

/// Shared application state passed to all route handlers.
#[derive(Clone)]
#[allow(dead_code)]
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub storage: Arc<Mutex<FilesystemStorage>>,
    pub config: Arc<Config>,
    /// Broadcast channel for pushing file-change events to WebSocket clients.
    pub events: broadcast::Sender<WsEvent>,
}
