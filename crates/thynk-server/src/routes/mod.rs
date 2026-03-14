pub mod notes;
pub mod search;
pub mod tree;
pub mod ws;

use axum::routing::get;
use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
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
}
