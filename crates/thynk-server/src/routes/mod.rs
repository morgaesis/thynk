pub mod auth;
pub mod notes;
pub mod search;
pub mod tree;
pub mod uploads;
pub mod ws;

use axum::middleware;
use axum::routing::{get, post};
use axum::Router;

use crate::state::AppState;

/// Build the application router.
///
/// Public routes (no auth required):
///   POST /api/auth/login
///   POST /api/auth/register  (unauthenticated only if no users exist; see handler)
///   POST /api/auth/logout
///   GET  /api/auth/me        (returns 401 if not logged in — used by the frontend)
///
/// All other /api/* routes require a valid session cookie.
pub fn router(state: AppState) -> Router {
    let public_routes = Router::new()
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        .with_state(state.clone());

    let protected_routes = Router::new()
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
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ))
        .with_state(state);

    Router::new().merge(public_routes).merge(protected_routes)
}
