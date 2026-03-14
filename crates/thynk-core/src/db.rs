use std::path::Path;

use rusqlite::{params, Connection};
use tracing::info;

use crate::error::{Result, ThynkError};
use crate::note::{Note, NoteMetadata};

pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open (or create) the database at the given path.
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Open an in-memory database (useful for tests).
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Create tables if they don't exist.
    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS notes (
                id           TEXT PRIMARY KEY,
                path         TEXT NOT NULL UNIQUE,
                title        TEXT NOT NULL,
                content      TEXT NOT NULL DEFAULT '',
                content_hash TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tags (
                id   INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (note_id, tag_id)
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                title,
                content,
                content='notes',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid, title, content)
                    VALUES (new.rowid, new.title, new.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content)
                    VALUES ('delete', old.rowid, old.title, old.content);
            END;

            CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
                INSERT INTO notes_fts(notes_fts, rowid, title, content)
                    VALUES ('delete', old.rowid, old.title, old.content);
                INSERT INTO notes_fts(rowid, title, content)
                    VALUES (new.rowid, new.title, new.content);
            END;
            ",
        )?;
        // Add content_hash column to existing DBs that predate this schema version.
        let _ = self.conn.execute(
            "ALTER TABLE notes ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''",
            [],
        );
        info!("database schema initialized");
        Ok(())
    }

    /// Returns a reference to the underlying connection (for search crate).
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Index (upsert) a note into the database.
    pub fn index_note(&self, note: &Note) -> Result<()> {
        self.conn.execute(
            "INSERT INTO notes (id, path, title, content, content_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                path         = excluded.path,
                title        = excluded.title,
                content      = excluded.content,
                content_hash = excluded.content_hash,
                updated_at   = excluded.updated_at",
            params![
                note.id,
                note.path.to_string_lossy().to_string(),
                note.title,
                note.content,
                note.content_hash,
                note.created_at.to_rfc3339(),
                note.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Retrieve metadata for a single note by ID.
    pub fn get_note_metadata(&self, id: &str) -> Result<NoteMetadata> {
        self.conn
            .query_row(
                "SELECT id, path, title, content_hash, created_at, updated_at FROM notes WHERE id = ?1",
                params![id],
                |row| {
                    Ok(NoteMetadata {
                        id: row.get(0)?,
                        path: std::path::PathBuf::from(row.get::<_, String>(1)?),
                        title: row.get(2)?,
                        content_hash: row.get(3)?,
                        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                            .unwrap_or_default()
                            .with_timezone(&chrono::Utc),
                        updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                            .unwrap_or_default()
                            .with_timezone(&chrono::Utc),
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => ThynkError::NotFound(id.to_string()),
                other => ThynkError::DbError { source: other },
            })
    }

    /// Find note metadata by filesystem path.
    pub fn get_note_by_path(&self, path: &Path) -> Result<NoteMetadata> {
        let path_str = path.to_string_lossy().to_string();
        self.conn
            .query_row(
                "SELECT id, path, title, content_hash, created_at, updated_at FROM notes WHERE path = ?1",
                params![path_str],
                |row| {
                    Ok(NoteMetadata {
                        id: row.get(0)?,
                        path: std::path::PathBuf::from(row.get::<_, String>(1)?),
                        title: row.get(2)?,
                        content_hash: row.get(3)?,
                        created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                            .unwrap_or_default()
                            .with_timezone(&chrono::Utc),
                        updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                            .unwrap_or_default()
                            .with_timezone(&chrono::Utc),
                    })
                },
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    ThynkError::NotFound(path.display().to_string())
                }
                other => ThynkError::DbError { source: other },
            })
    }

    /// List metadata for all notes.
    pub fn list_notes(&self) -> Result<Vec<NoteMetadata>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, title, content_hash, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteMetadata {
                id: row.get(0)?,
                path: std::path::PathBuf::from(row.get::<_, String>(1)?),
                title: row.get(2)?,
                content_hash: row.get(3)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .unwrap_or_default()
                    .with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                    .unwrap_or_default()
                    .with_timezone(&chrono::Utc),
            })
        })?;

        let mut notes = Vec::new();
        for row in rows {
            notes.push(row?);
        }
        Ok(notes)
    }

    /// Delete a note by ID.
    pub fn delete_note(&self, id: &str) -> Result<()> {
        let affected = self
            .conn
            .execute("DELETE FROM notes WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(ThynkError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Delete a note by path (used by file watcher when file is removed externally).
    pub fn delete_note_by_path(&self, path: &Path) -> Result<()> {
        let path_str = path.to_string_lossy().to_string();
        let affected = self
            .conn
            .execute("DELETE FROM notes WHERE path = ?1", params![path_str])?;
        if affected == 0 {
            return Err(ThynkError::NotFound(path.display().to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::note::Note;
    use std::path::PathBuf;

    #[test]
    fn test_schema_init() {
        let db = Database::open_in_memory().unwrap();
        let count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_index_and_list_notes() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new("Test".into(), "Content".into(), PathBuf::from("test.md"));
        db.index_note(&note).unwrap();

        let notes = db.list_notes().unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "Test");
        assert!(!notes[0].content_hash.is_empty());
    }

    #[test]
    fn test_get_note_metadata() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new("Find Me".into(), "Body".into(), PathBuf::from("find.md"));
        let id = note.id.clone();
        db.index_note(&note).unwrap();

        let meta = db.get_note_metadata(&id).unwrap();
        assert_eq!(meta.title, "Find Me");
        assert!(!meta.content_hash.is_empty());
    }

    #[test]
    fn test_get_note_by_path() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new("By Path".into(), "content".into(), PathBuf::from("path.md"));
        db.index_note(&note).unwrap();

        let meta = db.get_note_by_path(Path::new("path.md")).unwrap();
        assert_eq!(meta.title, "By Path");
    }

    #[test]
    fn test_delete_note() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new("Gone".into(), "Soon".into(), PathBuf::from("gone.md"));
        let id = note.id.clone();
        db.index_note(&note).unwrap();

        db.delete_note(&id).unwrap();
        assert!(db.get_note_metadata(&id).is_err());
    }

    #[test]
    fn test_delete_note_by_path() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new("Gone".into(), "Soon".into(), PathBuf::from("bypath.md"));
        db.index_note(&note).unwrap();

        db.delete_note_by_path(Path::new("bypath.md")).unwrap();
        assert!(db.get_note_by_path(Path::new("bypath.md")).is_err());
    }

    #[test]
    fn test_not_found() {
        let db = Database::open_in_memory().unwrap();
        let result = db.get_note_metadata("nonexistent");
        assert!(matches!(result.unwrap_err(), ThynkError::NotFound(_)));
    }
}
