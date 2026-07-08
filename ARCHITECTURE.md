# Architecture

Thynk is a browser-first, server-backed Markdown workspace. A Rust/Axum server owns filesystem access and exposes a JSON API to a React/Vite client.

## Runtime Surfaces

- `crates/thynk-server`: Axum server, token auth, Markdown note API, and static web serving.
- `apps/web`: React client for the first Markdown workspace.
- `.thynk`: ignored local runtime data for notes and private operator state.

## API

- `GET /api/health`: unauthenticated health check.
- `GET /api/notes`: Markdown note summaries.
- `POST /api/notes`: create a Markdown note.
- `GET /api/notes/{slug}`: read a Markdown note.
- `PUT /api/notes/{slug}`: save a Markdown note.
- `GET /api/search?q=`: search title, body, and tags.

All API routes except `/api/health` require `Authorization: Bearer <token>`.

## Storage

Runtime storage is filesystem-native:

- notes: `.thynk/workspace/notes/*.md`;
- local runtime state: `.thynk/`.

Markdown frontmatter supplies `title` and `tags`. Wiki-links use `[[target]]` syntax, and backlinks are computed from note contents.
