# STATE.md - Thynk Current Status

## Project Status: PHASE 1 IN PROGRESS

**Current Phase:** Phase 1 -- Foundation
**Overall Progress:** Scaffold complete, core API functional

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

| Component           | Status      | Phase   |
| ------------------- | ----------- | ------- |
| Project Scaffold    | Done        | Phase 1 |
| Rust Backend (Axum) | Done        | Phase 1 |
| SQLite Layer        | Done        | Phase 1 |
| TipTap Editor       | Scaffolded  | Phase 1 |
| File Tree / Sidebar | Scaffolded  | Phase 1 |
| Search (FTS5)       | Done        | Phase 1 |
| Linking System      | Not Started | Phase 2 |
| Database Views      | Not Started | Phase 2 |
| Page Locking        | Not Started | Phase 2 |
| Automations         | Not Started | Phase 2 |
| AI Integration      | Not Started | Phase 3 |
| Sync Engine         | Not Started | Phase 3 |
| Cloud Deployment    | Not Started | Phase 3 |
| P2P Collaboration   | Not Started | Phase 4 |
| Desktop Apps        | Not Started | Phase 4 |

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

## Next Steps

1. **Wire frontend to backend** -- connect React app to Rust API, dev proxy working
2. **Command palette** -- Ctrl+K fuzzy search with MiniSearch
3. **Theming** -- light/dark theme with CSS variables + Tailwind
4. **Polish editor** -- markdown serialization, slash commands, code block highlighting
5. **End-to-end tests** -- integration tests for the full stack

---

Last Updated: 2026-03-14
