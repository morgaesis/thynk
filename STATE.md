# STATE.md - Thynk Current Status

## Project Status: PHASE 1 COMPLETE

**Current Phase:** Phase 2 -- Knowledge & Data (starting next)
**Overall Progress:** Phase 1 complete and production-quality

---

## Decisions Made

| Decision                       | Status      | Notes                                          |
| ------------------------------ | ----------- | ---------------------------------------------- |
| Project name: "Thynk"          | Tentative   | Working title, domain research pending         |
| Architecture: server-backed    | **Decided** | Rust/Axum backend, browser connects to server  |
| Backend: Rust + Axum           | **Decided** | Shared crates with Tauri desktop               |
| Frontend: React + TS + Vite    | **Decided** | TipTap editor, Zustand state, Tailwind CSS     |
| Editor: TipTap (ProseMirror)   | **Decided** | Yjs-compatible for future collab               |
| Storage: Filesystem + SQLite   | **Decided** | MD files on disk, SQLite for metadata/indexes  |
| Search: SQLite FTS5            | **Decided** | Full-text, native in Rust                      |
| AI: BYOK                       | **Decided** | No built-in AI, user provides API key          |
| Sync: Custom built-in          | **Decided** | Differential sync, we control the experience   |
| Collab: Yjs + WebRTC/STUN      | **Decided** | P2P real-time, signaling server in Rust        |
| Cloud: Per-workspace instances | **Decided** | Scale-to-zero, wake on first request           |
| Auth: Self-hosted JWT + OAuth  | **Decided** | Privacy-first, no third-party auth dependency  |
| Automations: Minimal first     | **Decided** | Status sync ("done" propagation), expand later |
| License: FSL                   | **Decided** | Functional Source License                      |
| Pricing: Free until users      | **Decided** | Ship first, monetize later                     |
| Release: Single release        | **Decided** | All features built-in, 4 internal dev phases   |

### Pending Decisions

| Question                  | Impact              | Status    |
| ------------------------- | ------------------- | --------- |
| Domain name               | Branding, marketing | Open      |
| Free tier team size limit | Pricing             | Open (5?) |

---

## Development Status

### Code Progress

| Component               | Status      | Phase   |
| ----------------------- | ----------- | ------- |
| Project Scaffold        | Done        | Phase 1 |
| Rust Backend (Axum)     | Done        | Phase 1 |
| SQLite Layer + FTS5     | Done        | Phase 1 |
| Note CRUD API           | Done        | Phase 1 |
| Content Hash (SHA-256)  | Done        | Phase 1 |
| If-Match concurrency    | Done        | Phase 1 |
| Startup file indexing   | Done        | Phase 1 |
| File watcher (notify)   | Done        | Phase 1 |
| WebSocket (/api/ws)     | Done        | Phase 1 |
| Static file serving     | Done        | Phase 1 |
| TipTap Editor           | Done        | Phase 1 |
| Sidebar + File tree     | Done        | Phase 1 |
| Command palette (FTS5)  | Done        | Phase 1 |
| Delete notes            | Done        | Phase 1 |
| Error toasts            | Done        | Phase 1 |
| Keyboard shortcuts      | Done        | Phase 1 |
| Dark/light theme        | Done        | Phase 1 |
| THYNK_DATA_DIR env var  | Done        | Phase 1 |
| Image uploads (inline)  | Done        | Phase 1 |
| Local file uploads      | Done        | Phase 1 |
| WS heartbeat            | Done        | Phase 1 |
| last_updated_by         | Done        | Phase 1 |
| Linking System          | Not Started | Phase 2 |
| Graph View              | Not Started | Phase 2 |
| Tags                    | Not Started | Phase 2 |
| Templates / Daily Notes | Not Started | Phase 2 |
| Database Views          | Not Started | Phase 2 |
| Page Locking            | Not Started | Phase 2 |
| Automations             | Not Started | Phase 2 |
| AI Integration          | Not Started | Phase 3 |
| Sync Engine             | Not Started | Phase 3 |
| Cloud Deployment        | Not Started | Phase 3 |
| P2P Collaboration       | Not Started | Phase 4 |
| Desktop Apps            | Not Started | Phase 4 |

### Phase 1 Exit Criteria (all met)

- [x] Create and edit markdown notes in the browser, backed by real files on the filesystem
- [x] Search across all notes with sub-100ms results (SQLite FTS5)
- [x] Clean, responsive UI with sidebar navigation and command palette
- [x] Sidebar shows folder tree; creating `foo/bar/baz.md` auto-creates directories
- [x] New note creation always prompts for filename (default "untitled" if blank)
- [x] Filesystem changes (external creates/deletes) immediately reflected in nav
- [x] Delete from sidebar actually deletes the note (stale state fixed)
- [x] Code blocks: exit on double-Enter at end, show language tag, stable vertical height
- [x] Offline/disconnected indicator in UI
- [x] All 44 frontend tests pass with `bun test`
- [x] All 32 Rust tests pass with `cargo test -- --test-threads=8`

---

## Documentation Status

| Document            | Status         | Notes                    |
| ------------------- | -------------- | ------------------------ |
| PROJECT.md          | Current (v2.0) | Vision and architecture  |
| ROADMAP.md          | Current (v2.0) | 4-phase development plan |
| STATE.md            | Current        | This file                |
| ARCHITECTURE.md     | Current (v1.0) | Detailed system design   |
| Competitor Analysis | Done           | .planning/research/      |
| Tech Stack Analysis | Done           | .planning/research/      |

---

## Phase 2 Next Steps

1. **Wiki-links** -- `[[note title]]` syntax with backlinks and hover previews
2. **Graph view** -- D3.js or similar, visualize note connections
3. **Tags** -- frontmatter tags, tag browser, filter by tag
4. **Templates** -- note templates, daily note shortcut
5. **Tables / database views** -- structured data in notes
6. **Import/export** -- Obsidian vault import, markdown export zip

---

Last Updated: 2026-03-15
