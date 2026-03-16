use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use thynk_sync::{AuditEntry, SyncEngine, SyncRequest, SyncResponse, SyncStatus};

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncQuery {
    client_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditQuery {
    note_id: Option<String>,
    since: Option<String>,
    limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncErrorResponse {
    error: String,
}

pub async fn sync(
    State(state): State<AppState>,
    axum::extract::Extension(auth_user): axum::extract::Extension<crate::routes::auth::AuthUser>,
    Json(req): Json<SyncRequest>,
) -> Result<Json<SyncResponse>, Json<SyncErrorResponse>> {
    let user_id = Some(auth_user.id.as_str());

    let db = state.db.lock().await;
    let sync_engine = SyncEngine::new(db.conn());
    if let Err(e) = sync_engine.init_schema() {
        return Err(Json(SyncErrorResponse {
            error: e.to_string(),
        }));
    }

    match sync_engine.process_sync(&req.client_id, &req.note_states, user_id) {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err(Json(SyncErrorResponse {
            error: e.to_string(),
        })),
    }
}

pub async fn get_sync_status(
    State(state): State<AppState>,
    Query(query): Query<SyncQuery>,
) -> Result<Json<SyncStatus>, Json<SyncErrorResponse>> {
    let db = state.db.lock().await;
    let sync_engine = SyncEngine::new(db.conn());
    if let Err(e) = sync_engine.init_schema() {
        return Err(Json(SyncErrorResponse {
            error: e.to_string(),
        }));
    }

    match sync_engine.get_sync_status(&query.client_id) {
        Ok(status) => Ok(Json(status)),
        Err(e) => Err(Json(SyncErrorResponse {
            error: e.to_string(),
        })),
    }
}

pub async fn get_audit_log(
    State(state): State<AppState>,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Vec<AuditEntry>>, Json<SyncErrorResponse>> {
    let db = state.db.lock().await;
    let sync_engine = SyncEngine::new(db.conn());
    if let Err(e) = sync_engine.init_schema() {
        return Err(Json(SyncErrorResponse {
            error: e.to_string(),
        }));
    }

    let since = if let Some(s) = query.since {
        chrono::DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    } else {
        None
    };

    match sync_engine.get_audit_log(query.note_id.as_deref(), since, query.limit) {
        Ok(entries) => Ok(Json(entries)),
        Err(e) => Err(Json(SyncErrorResponse {
            error: e.to_string(),
        })),
    }
}
