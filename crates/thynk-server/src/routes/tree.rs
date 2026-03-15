use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use thynk_core::NoteStorage;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum TreeNode {
    File {
        name: String,
    },
    Directory {
        name: String,
        children: Vec<TreeNode>,
    },
}

/// GET /api/tree
pub async fn file_tree(State(state): State<AppState>) -> impl IntoResponse {
    let storage = state.storage.lock().await;

    let files = match storage.list_files() {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    // Also collect all directories (including empty ones) so they appear in the tree.
    let data_dir = storage.data_dir().clone();
    drop(storage);

    let mut all_dirs: Vec<PathBuf> = Vec::new();
    collect_all_dirs(&data_dir, &data_dir, &mut all_dirs);

    let tree = build_tree(&files, &all_dirs);
    (StatusCode::OK, Json(serde_json::to_value(tree).unwrap())).into_response()
}

/// Recursively collect all subdirectory paths (relative to `base`) under `dir`.
fn collect_all_dirs(base: &Path, dir: &Path, result: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(rel) = path.strip_prefix(base) {
                result.push(rel.to_path_buf());
            }
            collect_all_dirs(base, &path, result);
        }
    }
}

/// Build a tree from file paths and explicit directory paths.
/// `dirs` ensures directories appear even when they contain no .md files.
fn build_tree(files: &[PathBuf], dirs: &[PathBuf]) -> Vec<TreeNode> {
    // Map: top-level name → (file children, subdir children)
    let mut dir_map: BTreeMap<String, (Vec<PathBuf>, Vec<PathBuf>)> = BTreeMap::new();
    let mut top_files: Vec<String> = Vec::new();

    // Register explicit directories so empty ones appear in the tree.
    for dir in dirs {
        let components: Vec<_> = dir.components().collect();
        if components.is_empty() {
            continue;
        }
        let name = components[0].as_os_str().to_string_lossy().to_string();
        let entry = dir_map.entry(name).or_default();
        if components.len() > 1 {
            let rest: PathBuf = components[1..].iter().collect();
            entry.1.push(rest);
        }
        // components.len() == 1 → just ensure the dir key exists (already done by or_default)
    }

    // Add files into the map.
    for file in files {
        let components: Vec<_> = file.components().collect();
        if components.len() == 1 {
            top_files.push(file.to_string_lossy().to_string());
        } else {
            let dir = components[0].as_os_str().to_string_lossy().to_string();
            let rest: PathBuf = components[1..].iter().collect();
            dir_map.entry(dir).or_default().0.push(rest);
        }
    }

    let mut nodes = Vec::new();

    for (dir_name, (file_children, subdir_children)) in dir_map {
        nodes.push(TreeNode::Directory {
            name: dir_name,
            children: build_tree(&file_children, &subdir_children),
        });
    }

    for file in top_files {
        nodes.push(TreeNode::File { name: file });
    }

    nodes
}
