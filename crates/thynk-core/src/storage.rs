use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::error::{Result, ThynkError};
use crate::note::Note;

/// Trait defining note storage operations.
pub trait NoteStorage {
    fn read_note(&self, relative_path: &Path) -> Result<Note>;
    fn write_note(&self, note: &Note) -> Result<()>;
    fn delete_note(&self, relative_path: &Path) -> Result<()>;
    fn list_files(&self) -> Result<Vec<PathBuf>>;
}

/// Filesystem-backed note storage with path traversal prevention.
pub struct FilesystemStorage {
    data_dir: PathBuf,
}

impl FilesystemStorage {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data_dir)?;
        let data_dir = data_dir.canonicalize()?;
        Ok(Self { data_dir })
    }

    /// Resolve a relative path against data_dir, preventing traversal outside it.
    fn safe_resolve(&self, relative_path: &Path) -> Result<PathBuf> {
        if relative_path.is_absolute() {
            return Err(ThynkError::InvalidPath(relative_path.to_path_buf()));
        }

        let full = self.data_dir.join(relative_path);

        // Normalize by resolving .. and . components manually,
        // since canonicalize requires the file to exist.
        let mut resolved = PathBuf::new();
        for component in full.components() {
            match component {
                std::path::Component::ParentDir => {
                    if !resolved.pop() {
                        return Err(ThynkError::InvalidPath(relative_path.to_path_buf()));
                    }
                }
                other => resolved.push(other.as_os_str()),
            }
        }

        if !resolved.starts_with(&self.data_dir) {
            return Err(ThynkError::InvalidPath(relative_path.to_path_buf()));
        }

        Ok(resolved)
    }
}

/// Serialize a Note to markdown with YAML frontmatter.
fn serialize_note(note: &Note) -> String {
    let mut parts = vec!["---".to_string()];
    parts.push(format!("id: {}", note.id));
    parts.push(format!("title: {}", note.title));
    parts.push(format!("created_at: {}", note.created_at.to_rfc3339()));
    parts.push(format!("updated_at: {}", note.updated_at.to_rfc3339()));
    for (k, v) in &note.frontmatter {
        parts.push(format!("{k}: {v}"));
    }
    parts.push("---".to_string());
    parts.push(String::new());
    parts.push(note.content.clone());
    parts.join("\n")
}

/// Parse markdown with YAML frontmatter into a Note.
fn parse_note(content: &str, relative_path: &Path) -> Result<Note> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return Err(ThynkError::ParseError(
            "missing frontmatter delimiter".to_string(),
        ));
    }

    let after_first = &trimmed[3..];
    let end = after_first
        .find("\n---")
        .ok_or_else(|| ThynkError::ParseError("unclosed frontmatter".to_string()))?;

    let frontmatter_block = &after_first[..end];
    let body = after_first[end + 4..].trim_start_matches('\n');

    let mut id = String::new();
    let mut title = String::new();
    let mut created_at: Option<DateTime<Utc>> = None;
    let mut updated_at: Option<DateTime<Utc>> = None;
    let mut frontmatter = HashMap::new();

    for line in frontmatter_block.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "id" => id = value.to_string(),
                "title" => title = value.to_string(),
                "created_at" => {
                    created_at = DateTime::parse_from_rfc3339(value)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc));
                }
                "updated_at" => {
                    updated_at = DateTime::parse_from_rfc3339(value)
                        .ok()
                        .map(|dt| dt.with_timezone(&Utc));
                }
                _ => {
                    frontmatter.insert(key.to_string(), value.to_string());
                }
            }
        }
    }

    if id.is_empty() {
        return Err(ThynkError::ParseError(
            "missing id in frontmatter".to_string(),
        ));
    }

    let now = Utc::now();
    Ok(Note {
        id,
        path: relative_path.to_path_buf(),
        title,
        content: body.to_string(),
        frontmatter,
        created_at: created_at.unwrap_or(now),
        updated_at: updated_at.unwrap_or(now),
    })
}

impl NoteStorage for FilesystemStorage {
    fn read_note(&self, relative_path: &Path) -> Result<Note> {
        let full_path = self.safe_resolve(relative_path)?;
        if !full_path.exists() {
            return Err(ThynkError::NotFound(relative_path.display().to_string()));
        }
        let content = fs::read_to_string(&full_path)?;
        parse_note(&content, relative_path)
    }

    fn write_note(&self, note: &Note) -> Result<()> {
        let full_path = self.safe_resolve(&note.path)?;
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serialize_note(note);
        fs::write(&full_path, content)?;
        Ok(())
    }

    fn delete_note(&self, relative_path: &Path) -> Result<()> {
        let full_path = self.safe_resolve(relative_path)?;
        if !full_path.exists() {
            return Err(ThynkError::NotFound(relative_path.display().to_string()));
        }
        fs::remove_file(&full_path)?;
        Ok(())
    }

    fn list_files(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();
        collect_md_files(&self.data_dir, &self.data_dir, &mut files)?;
        Ok(files)
    }
}

fn collect_md_files(base: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_md_files(base, &path, files)?;
        } else if path.extension().is_some_and(|ext| ext == "md") {
            if let Ok(rel) = path.strip_prefix(base) {
                files.push(rel.to_path_buf());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_traversal_prevention() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        // Attempting to escape data_dir should fail
        let result = storage.safe_resolve(Path::new("../../etc/passwd"));
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), ThynkError::InvalidPath(_)));
    }

    #[test]
    fn test_absolute_path_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let result = storage.safe_resolve(Path::new("/etc/passwd"));
        assert!(result.is_err());
    }

    #[test]
    fn test_write_and_read_note() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new(
            "Hello".to_string(),
            "World".to_string(),
            PathBuf::from("hello.md"),
        );

        storage.write_note(&note).unwrap();
        let loaded = storage.read_note(Path::new("hello.md")).unwrap();

        assert_eq!(loaded.id, note.id);
        assert_eq!(loaded.title, "Hello");
        assert_eq!(loaded.content, "World");
    }

    #[test]
    fn test_delete_note() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new(
            "ToDelete".to_string(),
            "Content".to_string(),
            PathBuf::from("delete-me.md"),
        );
        storage.write_note(&note).unwrap();
        storage.delete_note(Path::new("delete-me.md")).unwrap();

        let result = storage.read_note(Path::new("delete-me.md"));
        assert!(matches!(result.unwrap_err(), ThynkError::NotFound(_)));
    }

    #[test]
    fn test_list_files() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let n1 = Note::new("A".into(), "a".into(), PathBuf::from("a.md"));
        let n2 = Note::new("B".into(), "b".into(), PathBuf::from("sub/b.md"));
        storage.write_note(&n1).unwrap();
        storage.write_note(&n2).unwrap();

        let files = storage.list_files().unwrap();
        assert_eq!(files.len(), 2);
    }
}
