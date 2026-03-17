use std::path::{Path, PathBuf};
use std::str::FromStr;

use thynk_core::db::Database;
use thynk_core::note::Note;
use thynk_core::storage::{FilesystemStorage, NoteStorage};
use thynk_search::SearchEngine;

fn get_db_path(data_dir: &Path) -> PathBuf {
    data_dir.join(".thynk").join("index.db")
}

pub fn list_notes(data_dir: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let storage = FilesystemStorage::new(data_dir.to_path_buf())?;
    storage.list_files().map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn search_notes(data_dir: &Path, query: &str) -> anyhow::Result<Vec<SearchResult>> {
    let db = Database::open(&get_db_path(data_dir))?;
    let engine = SearchEngine::new(&db);
    engine.search(query).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn read_note(data_dir: &Path, path: &str) -> anyhow::Result<String> {
    let storage = FilesystemStorage::new(data_dir.to_path_buf())?;
    let note = storage.read_note(&PathBuf::from_str(path)?)?;
    Ok(note.content)
}

pub fn create_note(data_dir: &Path, path: &str, content: &str) -> anyhow::Result<()> {
    let storage = FilesystemStorage::new(data_dir.to_path_buf())?;
    let path_buf = PathBuf::from_str(path)?;
    let title = path_buf
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let note = Note::new(title, content.to_string(), path_buf);
    storage.write_note(&note)?;

    let db = Database::open(&get_db_path(data_dir))?;
    db.index_note(&note)?;
    Ok(())
}

pub fn delete_note(data_dir: &Path, path: &str) -> anyhow::Result<()> {
    let storage = FilesystemStorage::new(data_dir.to_path_buf())?;
    storage.delete_note(&PathBuf::from_str(path)?)?;

    let db = Database::open(&get_db_path(data_dir))?;
    db.delete_note_by_path(&PathBuf::from_str(path)?)?;
    Ok(())
}

use thynk_search::SearchResult;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_test_dir() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let data_dir = dir.path().to_path_buf();
        fs::create_dir_all(&data_dir).unwrap();
        (dir, data_dir)
    }

    #[test]
    fn test_list_notes_empty() {
        let (_dir, data_dir) = setup_test_dir();
        let notes = list_notes(&data_dir).unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn test_list_notes_with_files() {
        let (_dir, data_dir) = setup_test_dir();

        let note1 = Note::new("A".into(), "a".into(), PathBuf::from("a.md"));
        let storage = FilesystemStorage::new(data_dir.clone()).unwrap();
        storage.write_note(&note1).unwrap();

        let note2 = Note::new("B".into(), "b".into(), PathBuf::from("sub/b.md"));
        storage.write_note(&note2).unwrap();

        let notes = list_notes(&data_dir).unwrap();
        assert_eq!(notes.len(), 2);
    }

    #[test]
    fn test_search_notes() {
        let (_dir, data_dir) = setup_test_dir();

        let note = Note::new(
            "Test Note".into(),
            "Hello world content".into(),
            PathBuf::from("test.md"),
        );
        let storage = FilesystemStorage::new(data_dir.clone()).unwrap();
        storage.write_note(&note).unwrap();

        let db = Database::open(&get_db_path(&data_dir)).unwrap();
        db.index_note(&note).unwrap();

        let results = search_notes(&data_dir, "hello").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Test Note");
    }

    #[test]
    fn test_read_note() {
        let (_dir, data_dir) = setup_test_dir();

        let note = Note::new(
            "Test".into(),
            "Hello World".into(),
            PathBuf::from("test.md"),
        );
        let storage = FilesystemStorage::new(data_dir.clone()).unwrap();
        storage.write_note(&note).unwrap();

        let content = read_note(&data_dir, "test.md").unwrap();
        assert_eq!(content, "Hello World");
    }

    #[test]
    fn test_create_and_delete_note() {
        let (_dir, data_dir) = setup_test_dir();

        create_note(&data_dir, "new-note.md", "My content").unwrap();

        let content = read_note(&data_dir, "new-note.md").unwrap();
        assert_eq!(content, "My content");

        delete_note(&data_dir, "new-note.md").unwrap();

        let result = read_note(&data_dir, "new-note.md");
        assert!(result.is_err());
    }
}
