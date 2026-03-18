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
    fn save_version(&self, note: &Note) -> Result<()>;
    fn list_versions(&self, relative_path: &Path) -> Result<Vec<PathBuf>>;
    fn get_version_content(&self, version_path: &Path) -> Result<String>;
    fn delete_version(&self, version_path: &Path) -> Result<()>;
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

    fn save_version(&self, note: &Note) -> Result<()> {
        let versions_dir = self.data_dir.join(".thynk").join("versions");
        let note_versions_dir = versions_dir.join(
            note.path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .replace('/', "_"),
        );
        fs::create_dir_all(&note_versions_dir)?;

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%f").to_string();
        let version_file = note_versions_dir.join(format!("{}.json", timestamp));

        let version_data = serde_json::json!({
            "content": note.content,
            "path": note.path,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "hash": note.content_hash,
        });

        fs::write(&version_file, serde_json::to_string_pretty(&version_data)?)?;
        Ok(())
    }

    fn list_versions(&self, relative_path: &Path) -> Result<Vec<PathBuf>> {
        let versions_dir = self.data_dir.join(".thynk").join("versions");
        let note_key = relative_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .replace('/', "_");
        let note_versions_dir = versions_dir.join(&note_key);

        if !note_versions_dir.exists() {
            return Ok(Vec::new());
        }

        let mut versions = Vec::new();
        for entry in fs::read_dir(&note_versions_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "json") {
                versions.push(path);
            }
        }

        versions.sort_by(|a, b| b.cmp(a));
        Ok(versions)
    }

    fn get_version_content(&self, version_path: &Path) -> Result<String> {
        let content = fs::read_to_string(version_path)?;
        let version_data: serde_json::Value = serde_json::from_str(&content)?;
        version_data["content"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| ThynkError::InvalidPath(version_path.to_path_buf()))
    }

    fn delete_version(&self, version_path: &Path) -> Result<()> {
        fs::remove_file(version_path)?;
        Ok(())
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

    #[test]
    fn test_save_and_list_versions() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new(
            "Test".into(),
            "Original content".into(),
            PathBuf::from("test.md"),
        );
        storage.write_note(&note).unwrap();

        storage.save_version(&note).unwrap();

        let versions = storage.list_versions(Path::new("test.md")).unwrap();
        assert_eq!(versions.len(), 1);
        assert!(versions[0].display().to_string().contains("test"));
    }

    #[test]
    fn test_save_version_increments_count() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new("Test".into(), "v1".into(), PathBuf::from("test.md"));
        storage.write_note(&note).unwrap();
        storage.save_version(&note).unwrap();

        let mut note2 = note.clone();
        note2.content = "v2".into();
        storage.write_note(&note2).unwrap();
        storage.save_version(&note2).unwrap();

        let versions = storage.list_versions(Path::new("test.md")).unwrap();
        assert_eq!(versions.len(), 2);
    }

    #[test]
    fn test_get_version_content() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new(
            "Test".into(),
            "Versioned content".into(),
            PathBuf::from("test.md"),
        );
        storage.write_note(&note).unwrap();
        storage.save_version(&note).unwrap();

        let versions = storage.list_versions(Path::new("test.md")).unwrap();
        let version_path = &versions[0];

        let content = storage.get_version_content(version_path).unwrap();
        assert_eq!(content, "Versioned content");
    }

    #[test]
    fn test_delete_version() {
        let dir = tempfile::tempdir().unwrap();
        let storage = FilesystemStorage::new(dir.path().to_path_buf()).unwrap();

        let note = Note::new("Test".into(), "To delete".into(), PathBuf::from("test.md"));
        storage.write_note(&note).unwrap();
        storage.save_version(&note).unwrap();

        let versions = storage.list_versions(Path::new("test.md")).unwrap();
        storage.delete_version(&versions[0]).unwrap();

        let remaining = storage.list_versions(Path::new("test.md")).unwrap();
        assert!(remaining.is_empty());
    }
}
