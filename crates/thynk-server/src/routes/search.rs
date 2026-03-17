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
}

/// GET /api/search?q=query&tags=tag1&tags=tag2
pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let engine = SearchEngine::new(&db);

    let results = if params.tags.is_empty() {
        engine.search(&params.q)
    } else {
        let tag_refs: Vec<&str> = params.tags.iter().map(|s| s.as_str()).collect();
        engine.search_with_tags(&params.q, &tag_refs)
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
