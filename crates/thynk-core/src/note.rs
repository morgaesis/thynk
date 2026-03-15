use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Full note representation including content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub frontmatter: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_updated_by: Option<String>,
}

/// Lightweight note metadata for listing endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub content_hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_updated_by: Option<String>,
}

pub fn compute_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

impl Note {
    pub fn new(title: String, content: String, path: PathBuf) -> Self {
        let now = Utc::now();
        let content_hash = compute_hash(&content);
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            path,
            title,
            content_hash,
            content,
            frontmatter: HashMap::new(),
            created_at: now,
            updated_at: now,
            last_updated_by: None,
        }
    }

    pub fn update_hash(&mut self) {
        self.content_hash = compute_hash(&self.content);
    }

    pub fn metadata(&self) -> NoteMetadata {
        NoteMetadata {
            id: self.id.clone(),
            path: self.path.clone(),
            title: self.title.clone(),
            content_hash: self.content_hash.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            last_updated_by: self.last_updated_by.clone(),
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
        assert!(!note.content_hash.is_empty());
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
        assert_eq!(meta.content_hash, note.content_hash);
    }

    #[test]
    fn test_content_hash_changes_with_content() {
        let note1 = Note::new("T".to_string(), "Hello".to_string(), PathBuf::from("a.md"));
        let note2 = Note::new("T".to_string(), "World".to_string(), PathBuf::from("b.md"));
        assert_ne!(note1.content_hash, note2.content_hash);
    }

    #[test]
    fn test_update_hash() {
        let mut note = Note::new("T".to_string(), "old".to_string(), PathBuf::from("a.md"));
        let old_hash = note.content_hash.clone();
        note.content = "new".to_string();
        note.update_hash();
        assert_ne!(note.content_hash, old_hash);
    }
}
