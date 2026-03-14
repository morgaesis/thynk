use std::collections::BTreeMap;

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

    let tree = build_tree(&files);
    (StatusCode::OK, Json(serde_json::to_value(tree).unwrap())).into_response()
}

fn build_tree(paths: &[std::path::PathBuf]) -> Vec<TreeNode> {
    // Intermediate representation for building nested structure.
    let mut dirs: BTreeMap<String, Vec<std::path::PathBuf>> = BTreeMap::new();
    let mut top_files: Vec<String> = Vec::new();

    for path in paths {
        let components: Vec<_> = path.components().collect();
        if components.len() == 1 {
            top_files.push(path.to_string_lossy().to_string());
        } else {
            let dir = components[0].as_os_str().to_string_lossy().to_string();
            let rest: std::path::PathBuf = components[1..].iter().collect();
            dirs.entry(dir).or_default().push(rest);
        }
    }

    let mut nodes = Vec::new();

    for (dir_name, children_paths) in dirs {
        nodes.push(TreeNode::Directory {
            name: dir_name,
            children: build_tree(&children_paths),
        });
    }

    for file in top_files {
        nodes.push(TreeNode::File { name: file });
    }

    nodes
}
