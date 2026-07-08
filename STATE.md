# STATE.md - Thynk Status

## Project Status

**Current Phase:** Phase 1 foundation slice
**Overall Progress:** Local Markdown workspace started

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
| Release: Single release        | **Decided** | All features built in, 4 internal dev phases   |

### Pending Decisions

| Question                  | Impact              | Status    |
| ------------------------- | ------------------- | --------- |
| Domain name               | Branding, marketing | Open      |
| Free tier team size limit | Pricing             | Open (5?) |

## Development Status

### Code Progress

| Component                       | Status      | Phase   |
| ------------------------------- | ----------- | ------- |
| Project Scaffold                | Started     | Phase 1 |
| Rust Backend (Axum)             | Started     | Phase 1 |
| Token-authenticated API         | Started     | Phase 1 |
| Markdown file storage           | Started     | Phase 1 |
| Frontmatter metadata extraction | Started     | Phase 1 |
| Wiki-links and backlinks        | Started     | Phase 1 |
| Basic filesystem search         | Started     | Phase 1 |
| SQLite Layer                    | Not Started | Phase 1 |
| TipTap Editor                   | Not Started | Phase 1 |
| File Tree / Sidebar             | Not Started | Phase 1 |
| FTS5 Search                     | Not Started | Phase 1 |
| Database Views                  | Not Started | Phase 2 |
| Page Locking                    | Not Started | Phase 2 |
| Automations                     | Not Started | Phase 2 |
| AI Integration                  | Not Started | Phase 3 |
| Sync Engine                     | Not Started | Phase 3 |
| Cloud Deployment                | Not Started | Phase 3 |
| P2P Collaboration               | Not Started | Phase 4 |
| Desktop Apps                    | Not Started | Phase 4 |

## Documentation Status

| Document              | Status     | Notes                           |
| --------------------- | ---------- | ------------------------------- |
| PROJECT.md            | Maintained | Vision and architecture         |
| ROADMAP.md            | Maintained | 4-phase development plan        |
| STATE.md              | Maintained | Repository state                |
| ARCHITECTURE.md       | Maintained | Runtime surfaces and API        |
| Competitor Analysis   | Maintained | `.planning/research/`           |
| Tech Stack Analysis   | Maintained | `.planning/research/`           |

## Next Steps

1. Replace basic textarea editing with TipTap while preserving Markdown round trip.
2. Add SQLite metadata and FTS5 indexing behind the existing note API.
3. Add file tree navigation and workspace settings.
4. Add import/export workflows for Markdown folders.
