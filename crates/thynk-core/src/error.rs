use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum ThynkError {
    #[error("note not found: {0}")]
    NotFound(String),

    #[error("I/O error: {source}")]
    IoError {
        #[from]
        source: std::io::Error,
    },

    #[error("database error: {source}")]
    DbError {
        #[from]
        source: rusqlite::Error,
    },

    #[error("JSON error: {source}")]
    JsonError {
        #[from]
        source: serde_json::Error,
    },

    #[error("invalid path: {0}")]
    InvalidPath(PathBuf),

    #[error("parse error: {0}")]
    ParseError(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("already exists: {0}")]
    AlreadyExists(String),
}

pub type Result<T> = std::result::Result<T, ThynkError>;
