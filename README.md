# Thynk

Thynk is a browser-first, server-backed Markdown workspace.

The local server owns filesystem access, stores notes as Markdown files, and serves a React client for:

- Markdown note creation and editing;
- filesystem-backed saves;
- title, body, and tag search;
- frontmatter metadata;
- wiki-links and backlinks.

## Local Development

Install dependencies:

```bash
bun install
cargo check
```

Build the web client:

```bash
bun run build
```

Run the loopback server with the development token:

```bash
THYNK_DEV_AUTH=1 cargo run -p thynk-server
```

Open http://127.0.0.1:3789 and unlock with `local-dev-token`.

## Checks

```bash
bun run lint
cargo fmt --check
cargo clippy --workspace -- -D warnings
```
