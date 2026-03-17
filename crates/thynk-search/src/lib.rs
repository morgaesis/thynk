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
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }

        // Build an FTS5 query with prefix wildcards on each term.
        // Filter out FTS5 special characters to avoid parse errors.
        let fts_query: String = query
            .split_whitespace()
            .filter_map(|word| {
                let clean: String = word
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
                    .collect();
                if clean.is_empty() {
                    None
                } else {
                    Some(format!("{clean}*"))
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.db.conn();

        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.path, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32), rank
             FROM notes_fts
             JOIN notes n ON notes_fts.rowid = n.rowid
             WHERE notes_fts MATCH ?1
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(params![fts_query], |row| {
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

    /// Full-text search with tag filtering. Only returns notes that have ALL specified tags.
    pub fn search_with_tags(
        &self,
        query: &str,
        tags: &[&str],
    ) -> Result<Vec<SearchResult>, thynk_core::ThynkError> {
        let results = self.search(query)?;

        if tags.is_empty() {
            return Ok(results);
        }

        let conn = self.db.conn();
        let tags_owned: Vec<String> = tags.iter().map(|s| s.to_string()).collect();
        let placeholders: Vec<String> = tags_owned.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT note_id FROM note_tags nt JOIN tags t ON nt.tag_id = t.id WHERE t.name IN ({}) GROUP BY note_id HAVING COUNT(DISTINCT t.name) = {}",
            placeholders.join(","),
            tags_owned.len()
        );
        let mut stmt = conn.prepare(&sql)?;

        let params: Vec<&dyn rusqlite::ToSql> = tags_owned
            .iter()
            .map(|s| s as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt.query_map(params.as_slice(), |row| row.get::<_, String>(0))?;

        let mut matching_note_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        for row in rows {
            matching_note_ids.insert(row?);
        }

        let filtered: Vec<SearchResult> = results
            .into_iter()
            .filter(|r| matching_note_ids.contains(&r.note_id))
            .collect();

        Ok(filtered)
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
    fn test_search_with_tags() {
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

        db.sync_note_tags(&note1.id, &["programming".to_string(), "rust".to_string()])
            .unwrap();
        db.sync_note_tags(
            &note2.id,
            &["programming".to_string(), "scripting".to_string()],
        )
        .unwrap();

        let engine = SearchEngine::new(&db);

        let results = engine.search_with_tags("rust", &["programming"]).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Programming");

        let results = engine.search_with_tags("python", &["rust"]).unwrap();
        assert!(results.is_empty());

        let results = engine.search_with_tags("python", &["programming"]).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Python Guide");

        let results = engine
            .search_with_tags("rust", &["programming", "rust"])
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Programming");
    }

    #[test]
    fn test_search_with_tags_no_match() {
        let db = Database::open_in_memory().unwrap();

        let note = Note::new(
            "Hello Note".into(),
            "This note contains the word hello.".into(),
            PathBuf::from("hello.md"),
        );
        db.index_note(&note).unwrap();
        db.sync_note_tags(&note.id, &["greeting".to_string()])
            .unwrap();

        let engine = SearchEngine::new(&db);
        let results = engine.search_with_tags("hello", &["farewell"]).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_no_results() {
        let db = Database::open_in_memory().unwrap();
        let engine = SearchEngine::new(&db);
        let results = engine.search("nonexistent").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_prefix_match() {
        let db = Database::open_in_memory().unwrap();
        let note = Note::new(
            "Hello Note".into(),
            "This note contains the word hello.".into(),
            PathBuf::from("hello.md"),
        );
        db.index_note(&note).unwrap();

        let engine = SearchEngine::new(&db);
        let results = engine.search("hel").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Hello Note");
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
