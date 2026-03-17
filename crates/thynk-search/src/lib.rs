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
    /// Supports pagination via limit and offset.
    pub fn search(
        &self,
        query: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<SearchResult>, thynk_core::ThynkError> {
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

        let limit_clause = limit.unwrap_or(50);
        let offset_clause = offset.unwrap_or(0);

        let mut stmt = conn.prepare(
            "SELECT n.id, n.title, n.path, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32), rank
             FROM notes_fts
             JOIN notes n ON notes_fts.rowid = n.rowid
             WHERE notes_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2 OFFSET ?3",
        )?;

        let rows = stmt.query_map(params![fts_query, limit_clause, offset_clause], |row| {
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
    /// Supports pagination via limit and offset.
    pub fn search_with_tags(
        &self,
        query: &str,
        tags: &[&str],
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<SearchResult>, thynk_core::ThynkError> {
        let results = self.search(query, None, None)?;

        if tags.is_empty() {
            return Self::paginate_results(results, limit, offset);
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

        Self::paginate_results(filtered, limit, offset)
    }

    fn paginate_results(
        results: Vec<SearchResult>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<SearchResult>, thynk_core::ThynkError> {
        let offset = offset.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50) as usize;

        Ok(results.into_iter().skip(offset).take(limit).collect())
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
        let results = engine.search("rust", None, None).unwrap();
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

        let results = engine
            .search_with_tags("rust", &["programming"], None, None)
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Rust Programming");

        let results = engine
            .search_with_tags("python", &["rust"], None, None)
            .unwrap();
        assert!(results.is_empty());

        let results = engine
            .search_with_tags("python", &["programming"], None, None)
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Python Guide");

        let results = engine
            .search_with_tags("rust", &["programming", "rust"], None, None)
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
        let results = engine
            .search_with_tags("hello", &["farewell"], None, None)
            .unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_no_results() {
        let db = Database::open_in_memory().unwrap();
        let engine = SearchEngine::new(&db);
        let results = engine.search("nonexistent", None, None).unwrap();
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
        let results = engine.search("hel", None, None).unwrap();
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
        let results = engine.search("rust", None, None).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_search_pagination() {
        let db = Database::open_in_memory().unwrap();

        for i in 0..10 {
            let note = Note::new(
                format!("Note {}", i),
                format!("Content for note {}", i),
                PathBuf::from(format!("note{}.md", i)),
            );
            db.index_note(&note).unwrap();
        }

        let engine = SearchEngine::new(&db);

        let results = engine.search("note", Some(3), Some(0)).unwrap();
        assert_eq!(results.len(), 3);

        let results = engine.search("note", Some(3), Some(3)).unwrap();
        assert_eq!(results.len(), 3);

        let results = engine.search("note", Some(3), Some(6)).unwrap();
        assert_eq!(results.len(), 3);

        let results = engine.search("note", Some(3), Some(9)).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_with_tags_pagination() {
        let db = Database::open_in_memory().unwrap();

        for i in 0..5 {
            let note = Note::new(
                format!("Tag Note {}", i),
                format!("Content for tagged note {}", i),
                PathBuf::from(format!("tagnote{}.md", i)),
            );
            db.index_note(&note).unwrap();
            db.sync_note_tags(&note.id, &["test".to_string()]).unwrap();
        }

        let engine = SearchEngine::new(&db);

        let results = engine
            .search_with_tags("note", &["test"], Some(2), Some(0))
            .unwrap();
        assert_eq!(results.len(), 2);

        let results = engine
            .search_with_tags("note", &["test"], Some(2), Some(2))
            .unwrap();
        assert_eq!(results.len(), 2);

        let results = engine
            .search_with_tags("note", &["test"], Some(2), Some(4))
            .unwrap();
        assert_eq!(results.len(), 1);
    }
}
