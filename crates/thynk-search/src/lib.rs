use std::path::PathBuf;

use rusqlite::params;
use serde::Serialize;

use thynk_core::db::Database;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub note_id: String,
    pub title: String,
    pub path: PathBuf,
    pub snippet: String,
    pub rank: f64,
}

pub struct SearchEngine<'a> {
    db: &'a Database,
}

impl<'a> SearchEngine<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// Full-text search across notes. Returns results ranked by relevance.
    pub fn search(&self, query: &str) -> Result<Vec<SearchResult>, thynk_core::ThynkError> {
        let conn = self.db.conn();

        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.path, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32), rank
             FROM notes_fts
             JOIN notes n ON notes_fts.rowid = n.rowid
             WHERE notes_fts MATCH ?1
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(params![query], |row| {
            Ok(SearchResult {
                note_id: row.get(0)?,
                title: row.get(1)?,
                path: PathBuf::from(row.get::<_, String>(2)?),
                snippet: row.get(3)?,
                rank: row.get(4)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use thynk_core::note::Note;

    #[test]
    fn test_search_indexing_and_query() {
        let db = Database::open_in_memory().unwrap();

        let note1 = Note::new(
            "Rust Programming".into(),
            "Rust is a systems programming language focused on safety.".into(),
            PathBuf::from("rust.md"),
        );
        let note2 = Note::new(
            "Python Guide".into(),
            "Python is great for scripting and data science.".into(),
            PathBuf::from("python.md"),
        );
        db.index_note(&note1).unwrap();
        db.index_note(&note2).unwrap();

        let engine = SearchEngine::new(&db);
        let results = engine.search("rust").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Programming");
    }

    #[test]
    fn test_search_no_results() {
        let db = Database::open_in_memory().unwrap();
        let engine = SearchEngine::new(&db);
        let results = engine.search("nonexistent").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_multiple_results() {
        let db = Database::open_in_memory().unwrap();

        let note1 = Note::new(
            "Async Rust".into(),
            "Tokio provides async runtime for Rust.".into(),
            PathBuf::from("async.md"),
        );
        let note2 = Note::new(
            "Rust Error Handling".into(),
            "Rust uses Result and Option for error handling.".into(),
            PathBuf::from("errors.md"),
        );
        db.index_note(&note1).unwrap();
        db.index_note(&note2).unwrap();

        let engine = SearchEngine::new(&db);
        let results = engine.search("rust").unwrap();
        assert_eq!(results.len(), 2);
    }
}
