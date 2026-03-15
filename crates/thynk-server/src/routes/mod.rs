pub mod auth;
pub mod export;
pub mod favorites;
pub mod links;
pub mod locks;
pub mod notes;
pub mod search;
pub mod tags;
pub mod templates;
pub mod tree;
pub mod uploads;
pub mod ws;

use axum::extract::DefaultBodyLimit;
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
        .route("/api/notes/{id}/backlinks", get(links::get_backlinks))
        .route(
            "/api/notes/{id}/links",
            get(links::get_outgoing_links).put(links::update_links),
        )
        .route("/api/graph", get(links::get_graph))
        .route("/api/ws", get(ws::ws_handler))
        .route(
            "/api/uploads",
            post(uploads::upload_file).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route("/api/uploads/{id}", get(uploads::get_upload))
        .route(
            "/api/notes/{id}/lock",
            get(locks::get_lock)
                .post(locks::acquire_lock)
                .delete(locks::release_lock),
        )
        .route(
            "/api/notes/{id}/lock/heartbeat",
            post(locks::heartbeat_lock),
        )
        .route("/api/tags", get(tags::list_tags))
        .route("/api/tags/{name}/notes", get(tags::get_notes_by_tag))
        .route("/api/notes/{id}/favorite", post(favorites::toggle_favorite))
        .route("/api/favorites", get(favorites::list_favorites))
        .route("/api/templates", get(templates::list_templates))
        .route(
            "/api/notes/from-template",
            post(templates::create_from_template),
        )
        .route("/api/export", get(export::export_workspace))
        .route("/api/import/markdown", post(export::import_markdown))
        .route("/api/import/obsidian", post(export::import_obsidian))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ))
        .with_state(state);

    Router::new().merge(public_routes).merge(protected_routes)
}
