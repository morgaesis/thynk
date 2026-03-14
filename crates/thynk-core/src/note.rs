use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Full note representation including content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub content: String,
    pub frontmatter: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Lightweight note metadata for listing endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Note {
    pub fn new(title: String, content: String, path: PathBuf) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            path,
            title,
            content,
            frontmatter: HashMap::new(),
            created_at: now,
            updated_at: now,
        }
    }

    pub fn metadata(&self) -> NoteMetadata {
        NoteMetadata {
            id: self.id.clone(),
            path: self.path.clone(),
            title: self.title.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_note_creation() {
        let note = Note::new(
            "Test Note".to_string(),
            "Some content".to_string(),
            PathBuf::from("test.md"),
        );

        assert_eq!(note.title, "Test Note");
        assert_eq!(note.content, "Some content");
        assert_eq!(note.path, PathBuf::from("test.md"));
        assert!(!note.id.is_empty());
        assert!(note.frontmatter.is_empty());
        assert!(note.created_at <= Utc::now());
    }

    #[test]
    fn test_note_metadata() {
        let note = Note::new(
            "Test".to_string(),
            "Body".to_string(),
            PathBuf::from("test.md"),
        );
        let meta = note.metadata();

        assert_eq!(meta.id, note.id);
        assert_eq!(meta.title, note.title);
        assert_eq!(meta.path, note.path);
    }
}
