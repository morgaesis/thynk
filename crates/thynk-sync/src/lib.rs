use std::collections::HashMap;

use chrono::{DateTime, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SyncError {
    #[error("Database error: {0}")]
    DbError(#[from] rusqlite::Error),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, SyncError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub client_id: String,
    pub last_sync_at: DateTime<Utc>,
    pub sync_version: i64,
    pub note_states: HashMap<String, NoteState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteState {
    pub note_id: String,
    pub content_hash: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub note_id: String,
    pub action: AuditAction,
    pub user_id: Option<String>,
    pub old_hash: Option<String>,
    pub new_hash: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    Create,
    Update,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRequest {
    pub client_id: String,
    pub note_states: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResponse {
    pub sync_version: i64,
    pub changes: Vec<NoteChange>,
    pub deleted: Vec<String>,
    pub needs_pull: Vec<NoteChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteChange {
    pub note_id: String,
    pub path: String,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub action: ChangeAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeAction {
    Create,
    Update,
    Delete,
}

pub struct SyncEngine<'a> {
    conn: &'a Connection,
}

impl<'a> SyncEngine<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sync_state (
                client_id TEXT PRIMARY KEY,
                last_sync_at TEXT NOT NULL,
                sync_version INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS note_sync_state (
                note_id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id TEXT NOT NULL,
                action TEXT NOT NULL,
                user_id TEXT,
                old_hash TEXT,
                new_hash TEXT,
                timestamp TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_audit_note_id ON audit_log(note_id);
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
            ",
        )?;
        Ok(())
    }

    pub fn process_sync(
        &self,
        client_id: &str,
        local_states: &HashMap<String, String>,
        _user_id: Option<&str>,
    ) -> Result<SyncResponse> {
        let server_version = self.get_server_sync_version()?;
        let _local_version = self.get_client_sync_version(client_id)?;

        let server_note_states = self.get_all_note_states()?;

        let mut changes = Vec::new();
        let mut needs_pull = Vec::new();
        let deleted = Vec::new();

        for (note_id, server_hash) in &server_note_states {
            if let Some(local_hash) = local_states.get(note_id) {
                if local_hash != server_hash {
                    let note = self.get_note_content(note_id)?;
                    needs_pull.push(NoteChange {
                        note_id: note_id.clone(),
                        path: note.0,
                        title: note.1,
                        content: note.2,
                        content_hash: server_hash.clone(),
                        action: ChangeAction::Update,
                    });
                }
            } else {
                let note = self.get_note_content(note_id)?;
                needs_pull.push(NoteChange {
                    note_id: note_id.clone(),
                    path: note.0,
                    title: note.1,
                    content: note.2,
                    content_hash: server_hash.clone(),
                    action: ChangeAction::Create,
                });
            }
        }

        for (note_id, local_hash) in local_states {
            if !server_note_states.contains_key(note_id) {
                changes.push(NoteChange {
                    note_id: note_id.clone(),
                    path: String::new(),
                    title: String::new(),
                    content: String::new(),
                    content_hash: local_hash.clone(),
                    action: ChangeAction::Delete,
                });
            }
        }

        self.update_client_sync_state(client_id, server_version + 1)?;

        Ok(SyncResponse {
            sync_version: server_version + 1,
            changes,
            deleted,
            needs_pull,
        })
    }

    fn get_note_content(&self, note_id: &str) -> Result<(String, String, String)> {
        let mut stmt = self
            .conn
            .prepare("SELECT path, title, content FROM notes WHERE id = ?1")?;
        let result = stmt.query_row(params![note_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        });
        match result {
            Ok(r) => Ok(r),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                Err(SyncError::NotFound(note_id.to_string()))
            }
            Err(e) => Err(SyncError::DbError(e)),
        }
    }

    fn get_server_sync_version(&self) -> Result<i64> {
        let max_version: Option<i64> = self
            .conn
            .query_row("SELECT MAX(sync_version) FROM sync_state", [], |row| {
                row.get(0)
            })
            .ok();
        Ok(max_version.unwrap_or(0))
    }

    fn get_client_sync_version(&self, client_id: &str) -> Result<i64> {
        let version: Option<i64> = self
            .conn
            .query_row(
                "SELECT sync_version FROM sync_state WHERE client_id = ?1",
                params![client_id],
                |row| row.get(0),
            )
            .ok();
        Ok(version.unwrap_or(0))
    }

    fn get_all_note_states(&self) -> Result<HashMap<String, String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT note_id, content_hash FROM note_sync_state")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut states = HashMap::new();
        for row in rows {
            let (note_id, hash) = row?;
            states.insert(note_id, hash);
        }
        Ok(states)
    }

    fn update_client_sync_state(&self, client_id: &str, version: i64) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sync_state (client_id, last_sync_at, sync_version)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(client_id) DO UPDATE SET
                last_sync_at = excluded.last_sync_at,
                sync_version = excluded.sync_version",
            params![client_id, now, version],
        )?;
        Ok(())
    }

    pub fn record_change(
        &self,
        note_id: &str,
        action: AuditAction,
        user_id: Option<&str>,
        old_hash: Option<&str>,
        new_hash: Option<&str>,
    ) -> Result<()> {
        let timestamp = Utc::now().to_rfc3339();
        let action_str = match action {
            AuditAction::Create => "create",
            AuditAction::Update => "update",
            AuditAction::Delete => "delete",
        };
        self.conn.execute(
            "INSERT INTO audit_log (note_id, action, user_id, old_hash, new_hash, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![note_id, action_str, user_id, old_hash, new_hash, timestamp],
        )?;
        Ok(())
    }

    pub fn update_note_sync_state(&self, note_id: &str, content_hash: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO note_sync_state (note_id, content_hash, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(note_id) DO UPDATE SET
                content_hash = excluded.content_hash,
                updated_at = excluded.updated_at",
            params![note_id, content_hash, now],
        )?;
        Ok(())
    }

    pub fn remove_note_sync_state(&self, note_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM note_sync_state WHERE note_id = ?1",
            params![note_id],
        )?;
        Ok(())
    }

    pub fn get_audit_log(
        &self,
        note_id: Option<&str>,
        since: Option<DateTime<Utc>>,
        limit: Option<i64>,
    ) -> Result<Vec<AuditEntry>> {
        let mut sql = String::from(
            "SELECT id, note_id, action, user_id, old_hash, new_hash, timestamp FROM audit_log WHERE 1=1",
        );
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(nid) = note_id {
            sql.push_str(" AND note_id = ?");
            params_vec.push(Box::new(nid.to_string()));
        }
        if let Some(s) = since {
            sql.push_str(" AND timestamp > ?");
            params_vec.push(Box::new(s.to_rfc3339()));
        }
        sql.push_str(" ORDER BY timestamp DESC");
        if let Some(l) = limit {
            sql.push_str(&format!(" LIMIT {}", l));
        }

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let action_str: String = row.get(2)?;
            let action = match action_str.as_str() {
                "create" => AuditAction::Create,
                "update" => AuditAction::Update,
                "delete" => AuditAction::Delete,
                _ => AuditAction::Update,
            };
            Ok(AuditEntry {
                id: row.get(0)?,
                note_id: row.get(1)?,
                action,
                user_id: row.get(3)?,
                old_hash: row.get(4)?,
                new_hash: row.get(5)?,
                timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                    .unwrap_or_default()
                    .with_timezone(&Utc),
            })
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub fn get_sync_status(&self, client_id: &str) -> Result<SyncStatus> {
        let state = self.conn.query_row(
            "SELECT last_sync_at, sync_version FROM sync_state WHERE client_id = ?1",
            params![client_id],
            |row| {
                Ok(SyncStatus {
                    client_id: client_id.to_string(),
                    last_sync_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(0)?)
                        .unwrap_or_default()
                        .with_timezone(&Utc),
                    sync_version: row.get(1)?,
                })
            },
        );
        match state {
            Ok(s) => Ok(s),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(SyncStatus {
                client_id: client_id.to_string(),
                last_sync_at: Utc.timestamp_opt(0, 0).unwrap(),
                sync_version: 0,
            }),
            Err(e) => Err(SyncError::DbError(e)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub client_id: String,
    pub last_sync_at: DateTime<Utc>,
    pub sync_version: i64,
}

pub fn compute_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_engine(conn: &Connection) -> SyncEngine<'_> {
        let engine = SyncEngine::new(conn);
        engine.init_schema().unwrap();
        engine
    }

    #[test]
    fn test_sync_status_no_client() {
        let dir = tempdir().unwrap();
        let conn = Connection::open(dir.path().join("sync.db")).unwrap();
        let engine = test_engine(&conn);
        let status = engine.get_sync_status("new-client").unwrap();
        assert_eq!(status.sync_version, 0);
    }

    #[test]
    fn test_audit_log() {
        let dir = tempdir().unwrap();
        let conn = Connection::open(dir.path().join("sync.db")).unwrap();
        let engine = test_engine(&conn);

        engine
            .record_change(
                "note-1",
                AuditAction::Create,
                Some("user-1"),
                None,
                Some("hash-1"),
            )
            .unwrap();

        let entries = engine.get_audit_log(Some("note-1"), None, None).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, AuditAction::Create);
    }

    #[test]
    fn test_update_note_sync_state() {
        let dir = tempdir().unwrap();
        let conn = Connection::open(dir.path().join("sync.db")).unwrap();
        let engine = test_engine(&conn);

        engine.update_note_sync_state("note-1", "abc123").unwrap();

        let states = engine.get_all_note_states().unwrap();
        assert_eq!(states.get("note-1"), Some(&"abc123".to_string()));
    }
}
