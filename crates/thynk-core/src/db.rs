use std::path::Path;

use rusqlite::{params, Connection};
use tracing::info;

use crate::error::{Result, ThynkError};
use crate::note::{Note, NoteMetadata};

/// A user account record.
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub display_name: Option<String>,
    pub storage_used: i64,
    pub storage_limit: i64,
    pub created_at: String,
    pub last_login: Option<String>,
}

/// A file upload record.
pub struct UploadRecord {
    pub id: String,
    pub user_id: String,
    pub s3_key: String,
    pub filename: String,
    pub content_type: String,
    pub size: i64,
    pub created_at: String,
}

/// An active session record.
pub struct SessionRecord {
    pub token: String,
    pub user_id: String,
    pub created_at: String,
    pub expires_at: String,
}

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

        // Users and sessions tables for multi-user auth.
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                storage_used INTEGER NOT NULL DEFAULT 0,
                storage_limit INTEGER NOT NULL DEFAULT 104857600,
                created_at TEXT NOT NULL,
                last_login TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS uploads (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'anonymous',
                s3_key TEXT NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            ",
        )?;

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

    // ── Auth: Users ──────────────────────────────────────────────────────────

    /// Count the total number of registered users.
    pub fn count_users(&self) -> anyhow::Result<i64> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        Ok(count)
    }

    /// Insert a new user record.
    pub fn create_user(
        &self,
        id: &str,
        username: &str,
        password_hash: &str,
        display_name: Option<&str>,
        created_at: &str,
    ) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, username, password_hash, display_name, created_at],
        )?;
        Ok(())
    }

    /// Look up a user by username.
    pub fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<UserRecord>> {
        let result = self.conn.query_row(
            "SELECT id, username, password_hash, display_name, storage_used, storage_limit,
                    created_at, last_login
             FROM users WHERE username = ?1",
            params![username],
            |row| {
                Ok(UserRecord {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    password_hash: row.get(2)?,
                    display_name: row.get(3)?,
                    storage_used: row.get(4)?,
                    storage_limit: row.get(5)?,
                    created_at: row.get(6)?,
                    last_login: row.get(7)?,
                })
            },
        );
        match result {
            Ok(u) => Ok(Some(u)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Look up a user by ID.
    pub fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<UserRecord>> {
        let result = self.conn.query_row(
            "SELECT id, username, password_hash, display_name, storage_used, storage_limit,
                    created_at, last_login
             FROM users WHERE id = ?1",
            params![id],
            |row| {
                Ok(UserRecord {
                    id: row.get(0)?,
                    username: row.get(1)?,
                    password_hash: row.get(2)?,
                    display_name: row.get(3)?,
                    storage_used: row.get(4)?,
                    storage_limit: row.get(5)?,
                    created_at: row.get(6)?,
                    last_login: row.get(7)?,
                })
            },
        );
        match result {
            Ok(u) => Ok(Some(u)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Update the last_login timestamp for a user.
    pub fn update_last_login(&self, user_id: &str, last_login: &str) -> anyhow::Result<()> {
        self.conn.execute(
            "UPDATE users SET last_login = ?1 WHERE id = ?2",
            params![last_login, user_id],
        )?;
        Ok(())
    }

    // ── Auth: Sessions ────────────────────────────────────────────────────────

    /// Insert a new session.
    pub fn create_session(
        &self,
        token: &str,
        user_id: &str,
        created_at: &str,
        expires_at: &str,
    ) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![token, user_id, created_at, expires_at],
        )?;
        Ok(())
    }

    /// Look up a session by token.
    pub fn get_session(&self, token: &str) -> anyhow::Result<Option<SessionRecord>> {
        let result = self.conn.query_row(
            "SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?1",
            params![token],
            |row| {
                Ok(SessionRecord {
                    token: row.get(0)?,
                    user_id: row.get(1)?,
                    created_at: row.get(2)?,
                    expires_at: row.get(3)?,
                })
            },
        );
        match result {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Delete a session by token (logout).
    pub fn delete_session(&self, token: &str) -> anyhow::Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE token = ?1", params![token])?;
        Ok(())
    }

    /// Remove all sessions whose `expires_at` is before `now`.
    pub fn cleanup_expired_sessions(&self, now: &str) -> anyhow::Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE expires_at < ?1", params![now])?;
        Ok(())
    }

    // ── Uploads ───────────────────────────────────────────────────────────────

    /// Insert a new upload record.
    #[allow(clippy::too_many_arguments)]
    pub fn create_upload(
        &self,
        id: &str,
        user_id: &str,
        s3_key: &str,
        filename: &str,
        content_type: &str,
        size: i64,
        created_at: &str,
    ) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO uploads (id, user_id, s3_key, filename, content_type, size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                user_id,
                s3_key,
                filename,
                content_type,
                size,
                created_at
            ],
        )?;
        Ok(())
    }

    /// Retrieve a single upload record by ID.
    pub fn get_upload(&self, id: &str) -> anyhow::Result<Option<UploadRecord>> {
        let result = self.conn.query_row(
            "SELECT id, user_id, s3_key, filename, content_type, size, created_at
             FROM uploads WHERE id = ?1",
            params![id],
            |row| {
                Ok(UploadRecord {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    s3_key: row.get(2)?,
                    filename: row.get(3)?,
                    content_type: row.get(4)?,
                    size: row.get(5)?,
                    created_at: row.get(6)?,
                })
            },
        );
        match result {
            Ok(u) => Ok(Some(u)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Delete an upload record by ID.
    pub fn delete_upload(&self, id: &str) -> anyhow::Result<()> {
        self.conn
            .execute("DELETE FROM uploads WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Sum all upload sizes for a given user (storage used in bytes).
    pub fn get_user_storage_used(&self, user_id: &str) -> anyhow::Result<i64> {
        let total: i64 = self.conn.query_row(
            "SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )?;
        Ok(total)
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
