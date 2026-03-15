pub mod auth;
pub mod notes;
pub mod search;
pub mod tree;
pub mod uploads;
pub mod ws;

use axum::routing::{get, post};
use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Auth routes (no auth middleware — handled inside handlers as needed).
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        // Note and search routes.
        .route(
            "/api/notes",
            get(notes::list_notes).post(notes::create_note),
        )
        .route(
            "/api/notes/{id}",
            get(notes::get_note)
                .put(notes::update_note)
                .delete(notes::delete_note),
        )
        .route("/api/search", get(search::search))
        .route("/api/tree", get(tree::file_tree))
        .route("/api/ws", get(ws::ws_handler))
        .route("/api/uploads", post(uploads::upload_file))
        .route("/api/uploads/{id}", get(uploads::get_upload))
}
