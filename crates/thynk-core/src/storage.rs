use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::error::{Result, ThynkError};
use crate::note::Note;

/// Trait defining note storage operations.
pub trait NoteStorage {
    fn read_note(&self, relative_path: &Path) -> Result<Note>;
    fn write_note(&self, note: &Note) -> Result<()>;
    fn delete_note(&self, relative_path: &Path) -> Result<()>;
    fn move_note(&self, from: &Path, to: &Path) -> Result<()>;
    fn list_files(&self) -> Result<Vec<PathBuf>>;
    fn exists(&self, relative_path: &Path) -> bool;
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

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
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

impl NoteStorage for FilesystemStorage {
    /// Read raw content from file. Returns a Note with only content+path set;
    /// caller is responsible for filling in id, title, and timestamps from DB.
    fn read_note(&self, relative_path: &Path) -> Result<Note> {
        let full_path = self.safe_resolve(relative_path)?;
        if !full_path.exists() {
            return Err(ThynkError::NotFound(relative_path.display().to_string()));
        }
        let content = fs::read_to_string(&full_path)?;
        let content_hash = crate::note::compute_hash(&content);
        let now = Utc::now();
        Ok(Note {
            id: String::new(),
            path: relative_path.to_path_buf(),
            title: String::new(),
            content,
            content_hash,
            frontmatter: std::collections::HashMap::new(),
            created_at: now,
            updated_at: now,
            last_updated_by: None,
        })
    }

    /// Write only the note's content to disk (no frontmatter).
    fn write_note(&self, note: &Note) -> Result<()> {
        let full_path = self.safe_resolve(&note.path)?;
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&full_path, &note.content)?;
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

    fn move_note(&self, from: &Path, to: &Path) -> Result<()> {
        let from_full = self.safe_resolve(from)?;
        let to_full = self.safe_resolve(to)?;
        if !from_full.exists() {
            return Err(ThynkError::NotFound(from.display().to_string()));
        }
        if to_full.exists() {
            return Err(ThynkError::AlreadyExists(to.display().to_string()));
        }
        if let Some(parent) = to_full.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&from_full, &to_full)?;
        Ok(())
    }

    fn list_files(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();
        collect_md_files(&self.data_dir, &self.data_dir, &mut files)?;
        Ok(files)
    }

    fn exists(&self, relative_path: &Path) -> bool {
        self.safe_resolve(relative_path)
            .map(|p| p.exists())
            .unwrap_or(false)
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
    use crate::note::Note;

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

        // Storage only persists content+path; id/title come from DB in real usage.
        assert_eq!(loaded.content, "World");
        assert_eq!(loaded.path, PathBuf::from("hello.md"));

        // Verify the file on disk contains plain content (no frontmatter).
        let disk_content = std::fs::read_to_string(dir.path().join("hello.md")).unwrap();
        assert_eq!(disk_content, "World");
        assert!(!disk_content.contains("---"));
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

    #[test]
    fn test_move_note() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new(
            "Test".into(),
            "Content".into(),
            PathBuf::from("original.md"),
        );
        storage.write_note(&note).unwrap();
        storage
            .move_note(Path::new("original.md"), Path::new("moved/note.md"))
            .unwrap();

        assert!(!storage.exists(Path::new("original.md")));
        assert!(storage.exists(Path::new("moved/note.md")));

        let loaded = storage.read_note(Path::new("moved/note.md")).unwrap();
        assert_eq!(loaded.content, "Content");
    }

    #[test]
    fn test_move_note_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new("Test".into(), "Content".into(), PathBuf::from("source.md"));
        storage.write_note(&note).unwrap();
        storage
            .move_note(Path::new("source.md"), Path::new("deeply/nested/dest.md"))
            .unwrap();

        assert!(storage.exists(Path::new("deeply/nested/dest.md")));
    }

    #[test]
    fn test_move_note_conflict() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note1 = Note::new("Note1".into(), "Content1".into(), PathBuf::from("a.md"));
        let note2 = Note::new("Note2".into(), "Content2".into(), PathBuf::from("b.md"));
        storage.write_note(&note1).unwrap();
        storage.write_note(&note2).unwrap();

        let result = storage.move_note(Path::new("a.md"), Path::new("b.md"));
        assert!(matches!(result.unwrap_err(), ThynkError::AlreadyExists(_)));
    }
}
