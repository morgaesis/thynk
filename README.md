# Thynk

A fast, local-first knowledge management platform. Not an Obsidian clone, not an Atlassian clone. Takes the best of each: speed and markdown-native from Obsidian, structured data and project planning from Notion, compliance and document control from Confluence, task management from Asana. All in one tool, all batteries included.

## Features

- Markdown-native editing with TipTap/ProseMirror
- Full-text search via SQLite FTS5 (sub-100ms)
- Bi-directional wiki-links and graph view
- Database views: list, kanban, timeline
- Calendar and daily notes workflow
- Page properties (YAML frontmatter UI)
- Page locking with lease/heartbeat
- Tags, favorites, templates
- Import/export (Obsidian vaults, Markdown)
- Vim mode
- Dark/light theme
- Real-time filesystem sync via WebSocket

## Tech Stack

- **Backend**: Rust + Axum (async HTTP server)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Editor**: TipTap (ProseMirror)
- **Database**: SQLite (metadata, FTS5 search, indexes)
- **Storage**: Filesystem (markdown files)
- **State**: Zustand
- **Desktop (planned)**: Tauri 2.0

## Getting Started

```bash
# Start the backend (defaults to port 3001, data in ./data)
cargo run

# In another terminal, start the frontend dev server
cd frontend && bun dev
```

Open <http://localhost:5173> in your browser.

Configure the data directory:

```bash
THYNK_DATA_DIR=/path/to/notes cargo run
```

## License

Functional Source License (FSL) — see [LICENSE](LICENSE).
