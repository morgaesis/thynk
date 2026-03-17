use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use thynk_search::SearchEngine;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

/// GET /api/search?q=query&tags=tag1&tags=tag2&limit=20&offset=0
pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let engine = SearchEngine::new(&db);

    let limit = if params.limit > 0 {
        Some(params.limit)
    } else {
        None
    };
    let offset = if params.offset > 0 {
        Some(params.offset)
    } else {
        None
    };

    let results = if params.tags.is_empty() {
        engine.search(&params.q, limit, offset)
    } else {
        let tag_refs: Vec<&str> = params.tags.iter().map(|s| s.as_str()).collect();
        engine.search_with_tags(&params.q, &tag_refs, limit, offset)
    };

    match results {
        Ok(results) => {
            (StatusCode::OK, Json(serde_json::to_value(results).unwrap())).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
