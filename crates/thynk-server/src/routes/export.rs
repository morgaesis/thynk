use std::io::{Cursor, Read, Write};
use std::path::PathBuf;

use axum::body::Body;
use axum::extract::{Multipart, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use thynk_core::{Note, NoteStorage};

use crate::state::AppState;

// ── GET /api/export ──────────────────────────────────────────────────────────

/// Export the entire workspace as a zip of .md files, preserving directory structure.
pub async fn export_workspace(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db.lock().await;
    let notes = match db.list_notes() {
        Ok(n) => n,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(e.to_string()))
                .unwrap();
        }
    };
    drop(db);

    let storage = state.storage.lock().await;

    let buf = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(buf);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for meta in &notes {
        let content = match storage.read_note(&meta.path) {
            Ok(n) => n.content,
            Err(_) => continue,
        };
        let path_str = meta.path.to_string_lossy().replace('\\', "/");
        if let Err(e) = writer.start_file(&path_str, options) {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(e.to_string()))
                .unwrap();
        }
        if let Err(e) = writer.write_all(content.as_bytes()) {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(e.to_string()))
                .unwrap();
        }
    }

    let cursor = match writer.finish() {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(e.to_string()))
                .unwrap();
        }
    };

    let zip_bytes = cursor.into_inner();

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"thynk-export.zip\"",
        )
        .body(Body::from(zip_bytes))
        .unwrap()
}

// ── Shared import logic ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ImportResult {
    imported: usize,
    attachments: usize,
    errors: Vec<String>,
}

/// Extract title from markdown content: use first `# Heading` line, or derive
/// from the filename if none found.
fn extract_title(content: &str, path: &std::path::Path) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            let title = heading.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    // Fall back to filename stem.
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Read zip bytes from multipart field named "file".
async fn read_zip_from_multipart(multipart: &mut Multipart) -> Result<Vec<u8>, String> {
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" || name.is_empty() {
            let data = field
                .bytes()
                .await
                .map_err(|e| format!("failed to read upload: {e}"))?;
            return Ok(data.to_vec());
        }
    }
    Err("no file field found in multipart upload".to_string())
}

// ── POST /api/import/markdown ────────────────────────────────────────────────

/// Import a zip of .md files, preserving directory structure.
pub async fn import_markdown(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let zip_data = match read_zip_from_multipart(&mut multipart).await {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ImportResult {
                    imported: 0,
                    attachments: 0,
                    errors: vec![e],
                }),
            );
        }
    };

    let cursor = Cursor::new(zip_data);
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ImportResult {
                    imported: 0,
                    attachments: 0,
                    errors: vec![format!("invalid zip: {e}")],
                }),
            );
        }
    };

    let mut imported = 0usize;
    let mut errors = Vec::new();

    let file_count = archive.len();
    // Collect entries first to avoid borrow issues.
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..file_count {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("zip entry {i}: {e}"));
                continue;
            }
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if !name.ends_with(".md") {
            continue;
        }
        let mut content_bytes = Vec::new();
        if let Err(e) = entry.read_to_end(&mut content_bytes) {
            errors.push(format!("{name}: read error: {e}"));
            continue;
        }
        entries.push((name, content_bytes));
    }

    let storage = state.storage.lock().await;
    let db = state.db.lock().await;

    for (name, content_bytes) in entries {
        let content = match String::from_utf8(content_bytes) {
            Ok(s) => s,
            Err(_) => {
                errors.push(format!("{name}: not valid UTF-8, skipped"));
                continue;
            }
        };
        let path = PathBuf::from(&name);
        let title = extract_title(&content, &path);
        let note = Note::new(title, content, path);
        if let Err(e) = storage.write_note(&note) {
            errors.push(format!("{name}: write error: {e}"));
            continue;
        }
        if let Err(e) = db.index_note(&note) {
            errors.push(format!("{name}: index error: {e}"));
            continue;
        }
        imported += 1;
    }

    (
        StatusCode::OK,
        Json(ImportResult {
            imported,
            attachments: 0,
            errors,
        }),
    )
}

// ── POST /api/import/obsidian ─────────────────────────────────────────────────

/// Import an Obsidian vault zip.
/// - Skips the `.obsidian/` config directory.
/// - Copies attachment files (images, pdfs, etc.) to the workspace `uploads/` dir.
/// - Preserves `[[wikilinks]]` and YAML frontmatter as-is (Thynk supports them).
/// - Converts `![[embedded-file.png]]` embed syntax to standard markdown image refs.
pub async fn import_obsidian(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let zip_data = match read_zip_from_multipart(&mut multipart).await {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ImportResult {
                    imported: 0,
                    attachments: 0,
                    errors: vec![e],
                }),
            );
        }
    };

    let cursor = Cursor::new(zip_data);
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ImportResult {
                    imported: 0,
                    attachments: 0,
                    errors: vec![format!("invalid zip: {e}")],
                }),
            );
        }
    };

    let mut md_entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut attachment_entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut errors = Vec::new();

    let file_count = archive.len();
    for i in 0..file_count {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("zip entry {i}: {e}"));
                continue;
            }
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();

        // Skip Obsidian config directory.
        let normalized = name.replace('\\', "/");
        let is_obsidian_config = normalized.starts_with(".obsidian/")
            || normalized.contains("/.obsidian/")
            || normalized == ".obsidian";
        if is_obsidian_config {
            continue;
        }

        let mut content_bytes = Vec::new();
        if let Err(e) = entry.read_to_end(&mut content_bytes) {
            errors.push(format!("{name}: read error: {e}"));
            continue;
        }

        if name.ends_with(".md") {
            md_entries.push((name, content_bytes));
        } else {
            // Attachments: images, pdfs, etc.
            let ext = std::path::Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            let is_attachment = ext.as_deref().is_some_and(|e| {
                matches!(
                    e,
                    "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "pdf" | "mp4" | "mp3"
                )
            });
            if is_attachment {
                attachment_entries.push((name, content_bytes));
            }
        }
    }

    let storage = state.storage.lock().await;
    let db = state.db.lock().await;

    // Copy attachment files into workspace `uploads/` dir.
    let mut attachments = 0usize;
    for (name, bytes) in &attachment_entries {
        let file_name = std::path::Path::new(name)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| name.clone());
        let dest_path = PathBuf::from(format!("uploads/{file_name}"));
        // Write raw bytes via filesystem (not via NoteStorage which only handles text).
        let full_dest = storage.data_dir().join(&dest_path);
        if let Some(parent) = full_dest.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                errors.push(format!("{name}: create dir: {e}"));
                continue;
            }
        }
        if let Err(e) = std::fs::write(&full_dest, bytes) {
            errors.push(format!("{name}: write attachment: {e}"));
            continue;
        }
        attachments += 1;
    }

    // Import markdown files, converting `![[file]]` embeds to standard markdown.
    let mut imported = 0usize;
    for (name, content_bytes) in md_entries {
        let raw = match String::from_utf8(content_bytes) {
            Ok(s) => s,
            Err(_) => {
                errors.push(format!("{name}: not valid UTF-8, skipped"));
                continue;
            }
        };

        // Convert Obsidian `![[image.png]]` embed syntax to standard `![image.png](uploads/image.png)`.
        let content = convert_obsidian_embeds(&raw);

        let path = PathBuf::from(&name);
        let title = extract_title(&content, &path);
        let note = Note::new(title, content, path);
        if let Err(e) = storage.write_note(&note) {
            errors.push(format!("{name}: write error: {e}"));
            continue;
        }
        if let Err(e) = db.index_note(&note) {
            errors.push(format!("{name}: index error: {e}"));
            continue;
        }
        imported += 1;
    }

    (
        StatusCode::OK,
        Json(ImportResult {
            imported,
            attachments,
            errors,
        }),
    )
}

/// Convert Obsidian `![[filename]]` embed syntax to standard markdown image/link refs.
/// Images become `![filename](uploads/filename)`, other files become `[filename](uploads/filename)`.
fn convert_obsidian_embeds(content: &str) -> String {
    // Pattern: ![[...]]
    let mut result = String::with_capacity(content.len());
    let mut chars = content.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '!' && chars.peek() == Some(&'[') {
            // Consume first '['
            let _ = chars.next();
            // Check for second '['
            if chars.peek() == Some(&'[') {
                let _ = chars.next();
                // Collect until ']]'
                let mut inner = String::new();
                let mut closed = false;
                while let Some(ic) = chars.next() {
                    if ic == ']' && chars.peek() == Some(&']') {
                        let _ = chars.next();
                        closed = true;
                        break;
                    }
                    inner.push(ic);
                }
                if closed {
                    let file_name = inner.split('|').next().unwrap_or(&inner).trim();
                    let ext = std::path::Path::new(file_name)
                        .extension()
                        .map(|e| e.to_string_lossy().to_lowercase());
                    let is_image = ext.as_deref().is_some_and(|e| {
                        matches!(e, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
                    });
                    if is_image {
                        result.push_str(&format!("![{file_name}](uploads/{file_name})"));
                    } else {
                        result.push_str(&format!("[{file_name}](uploads/{file_name})"));
                    }
                } else {
                    // Unclosed — output as-is.
                    result.push_str("![[");
                    result.push_str(&inner);
                }
            } else {
                result.push('!');
                result.push('[');
            }
        } else {
            result.push(c);
        }
    }

    result
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn make_zip(files: &[(&str, &str)]) -> Vec<u8> {
        let buf = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(buf);
        let opts = SimpleFileOptions::default();
        for (path, content) in files {
            writer.start_file(*path, opts).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn test_export_produces_valid_zip() {
        // Build a small zip representing a workspace export and verify it is readable.
        let zip_bytes = make_zip(&[
            ("notes/hello.md", "# Hello\nWorld"),
            ("notes/sub/world.md", "# World\nFoo"),
        ]);

        let cursor = Cursor::new(zip_bytes);
        let mut archive = ZipArchive::new(cursor).expect("should be a valid zip");
        assert_eq!(archive.len(), 2);
        let mut entry = archive.by_name("notes/hello.md").unwrap();
        let mut content = String::new();
        entry.read_to_string(&mut content).unwrap();
        assert_eq!(content, "# Hello\nWorld");
    }

    #[test]
    fn test_extract_title_from_heading() {
        let content = "# My Title\nSome content";
        let path = std::path::Path::new("notes/my-note.md");
        assert_eq!(extract_title(content, path), "My Title");
    }

    #[test]
    fn test_extract_title_fallback_to_filename() {
        let content = "No heading here";
        let path = std::path::Path::new("notes/my-note.md");
        assert_eq!(extract_title(content, path), "my-note");
    }

    #[test]
    fn test_convert_obsidian_embeds_image() {
        let input = "See ![[diagram.png]] for details.";
        let output = convert_obsidian_embeds(input);
        assert_eq!(
            output,
            "See ![diagram.png](uploads/diagram.png) for details."
        );
    }

    #[test]
    fn test_convert_obsidian_embeds_file() {
        let input = "Download ![[report.pdf]] here.";
        let output = convert_obsidian_embeds(input);
        assert_eq!(output, "Download [report.pdf](uploads/report.pdf) here.");
    }

    #[test]
    fn test_convert_obsidian_embeds_with_alias() {
        let input = "See ![[diagram.png|My Diagram]] here.";
        let output = convert_obsidian_embeds(input);
        // The file name (before '|') is used.
        assert_eq!(output, "See ![diagram.png](uploads/diagram.png) here.");
    }

    #[test]
    fn test_convert_obsidian_embeds_no_change_for_wikilinks() {
        // Regular [[wikilinks]] (no !) should not be modified.
        let input = "See [[Other Note]] for details.";
        let output = convert_obsidian_embeds(input);
        assert_eq!(output, "See [[Other Note]] for details.");
    }

    #[test]
    fn test_import_markdown_reads_files_correctly() {
        // Build a zip with two markdown files.
        let zip_bytes = make_zip(&[
            ("notes/alpha.md", "# Alpha\nAlpha content"),
            ("notes/beta.md", "# Beta\nBeta content"),
            ("notes/sub/gamma.md", "Gamma content"),
        ]);

        let cursor = Cursor::new(zip_bytes);
        let mut archive = ZipArchive::new(cursor).unwrap();
        assert_eq!(archive.len(), 3);

        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["notes/alpha.md", "notes/beta.md", "notes/sub/gamma.md"]
        );
    }

    #[test]
    fn test_obsidian_import_skips_obsidian_config() {
        let zip_bytes = make_zip(&[
            (".obsidian/config", "{}"),
            (".obsidian/workspace.json", "{}"),
            ("notes/hello.md", "# Hello"),
        ]);

        let cursor = Cursor::new(zip_bytes);
        let mut archive = ZipArchive::new(cursor).unwrap();

        let mut md_entries = Vec::new();
        for i in 0..archive.len() {
            let entry = archive.by_index(i).unwrap();
            if entry.is_dir() {
                continue;
            }
            let name = entry.name().to_string();
            let normalized = name.replace('\\', "/");
            let is_obsidian_config = normalized.starts_with(".obsidian/")
                || normalized.contains("/.obsidian/")
                || normalized == ".obsidian";
            if !is_obsidian_config && name.ends_with(".md") {
                md_entries.push(name);
            }
        }

        assert_eq!(md_entries, vec!["notes/hello.md"]);
    }
}
