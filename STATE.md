# STATE.md - Thynk Current Status

## Project Status: PHASE 4 STARTED (Desktop Apps)

**Current Phase:** Phase 4 -- Collaboration & Platform (in progress)
**Overall Progress:** Phases 1, 2, and 3 complete; Phase 4 starting

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
| Linking System          | Done        | Phase 2 |
| Graph View              | Done        | Phase 2 |
| Tags                    | Done        | Phase 2 |
| Templates / Daily Notes | Done        | Phase 2 |
| Database Views          | Done        | Phase 2 |
| Page Locking            | Done        | Phase 2 |
| Automations             | Done        | Phase 2 |
| Vim Mode                | Done        | Phase 2 |
| Import/Export           | Done        | Phase 2 |
| Favorites               | Done        | Phase 2 |
| Page Properties         | Done        | Phase 2 |
| AI Settings UI          | Done        | Phase 3 |
| AI API Routes           | Done        | Phase 3 |
| AI Completion API       | Done        | Phase 3 |
| AI Chat API             | Done        | Phase 3 |
| AI Inline Completions    | Done        | Phase 3 |
| AI Integration          | Done        | Phase 3 |
| Sync Engine             | Done        | Phase 3 |
| Unlinked Mentions       | Done        | Phase 3 |
| Cloud Deployment        | Not Started | Phase 3 |
| P2P Collaboration       | Done (hook + presence + dynamic cursor color) | Phase 4 |
| Desktop Apps            | Done (static file serving fixed) | Phase 4 |
| Shared Workspaces       | Done (invitation system + Team Members UI) | Phase 4 |
| Signaling Server       | Done (WebSocket handler, room management, message routing) | Phase 4 |
| CLI Interface          | Done (thynk-cli crate with list/search/cat/create/delete) | Phase 4 |
| Mobile Apps            | Done (capabilities config, Android minSdk 24, iOS 14.0+) | Phase 4 |
| Search Tag Filtering  | Done (search_with_tags method, /api/search?tags= query) | Phase 4 |
| Search Pagination     | Done (limit/offset params, paginated results) | Phase 4 |
| Activity Feed       | Done (getAuditLog API, ActivityFeed component in sidebar) | Phase 4 |
| Trash/Soft Delete   | Done (trash/restore/permanent-delete API, DB methods, tests, TrashSection UI in sidebar) | Phase 4 |
| User Profiles        | Done (mutual work feature showing connected notes between users) | Phase 4 |
| Todo Items          | Done (TaskList extension, - [ ], - [/], - [x] syntax) | Phase 4 |
| Code Block Copy     | Done (copy button with clipboard API, hover state, tests) | Phase 4 |
| Security Fix         | Done (notification ownership validation on mark read) | - |

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

### Phase 2 Exit Criteria (all met)

- [x] `[[wiki-link]]` syntax with click navigation, backlinks panel, and graph view
- [x] D3.js force-directed graph view at `/graph`
- [x] Tags extracted from frontmatter, tag browser in sidebar, filter by tag
- [x] Templates: list, create from template; daily note calendar in sidebar
- [x] TipTap table extension with TableControls toolbar
- [x] Page properties: frontmatter key-value editor above the editor
- [x] Database views: list / kanban / timeline for structured notes
- [x] Calendar view for date-based note navigation
- [x] Page locking: 30-second leases, 15-second heartbeat, `423 Locked` on conflict
- [x] Favorites: toggle star, favorites section in sidebar
- [x] Vim mode: normal / insert / visual with standard keybindings
- [x] Automation log: WebSocket `status_changed` events shown in sidebar
- [x] Export workspace as `.zip`; import markdown files and Obsidian vaults
- [x] Settings page: vim toggle, font size, line height
- [x] 56 Rust tests pass; 48 frontend tests pass; ESLint/clippy/fmt pass

### Phase 2 Bug Fixes (2026-03-15)

| Bug | Root Cause | Fix |
| --- | --- | --- |
| Page locking race condition | `setTimeout(reset, 0)` in `useLock` could fire after `getLock` microtask, overriding correct lock state | Replaced with `Promise.resolve().then(reset)` so ordering is deterministic |
| Lock not enforced server-side | Was enforced but had no HTTP-level integration test | Added tests: 423 on locked-note update, GET returns locker info |
| "Today" button still in sidebar | `DailyNoteButton` was never removed from Sidebar | Removed component and import from Sidebar.tsx |
| Vim block cursor not shown | CSS targeted `.ProseMirror-cursor` (gap cursor, never present for text) | Hide native caret with `caret-color: transparent`; add `Decoration.inline`/`widget` for character highlight |
| Startup log format wrong | Two separate `println!` lines | Combined to single `"Data directory: <path> (<N> files)"` |
| Document locking doesn't persist on refresh | Lock released on component unmount, lost on page refresh | Store lock intent in sessionStorage; re-acquire on mount if user previously held lock |

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

## Phase 3 Next Steps

1. ~~AI Integration -- BYOK, inline completions, smart search~~ (done: settings UI, API routes, inline completions)
2. ~~Unlinked mentions~~ (done: backend endpoint + UI in backlinks panel)
3. ~~Sync Engine -- differential sync between devices and cloud~~ (done: sync crate, API endpoints, audit trail)
4. ~~Cloud Deployment~~ (moved to future phase)
5. ~~Desktop Apps~~ (done: Tauri 2.0 structure created, embedded server + UI)

## Phase 4 Next Steps (Collaboration & Platform)

1. **Desktop Apps** -- Tauri 2.0 app with embedded server (static file serving fixed, 2026-03-16)
2. **P2P Real-Time Editing** -- Yjs + y-webrtc integration (hook + TipTap extensions added, tests added, 2026-03-16)
3. **Cursor Presence** -- Show other users' cursors in editor (fixed: use dynamic user color from provider, 2026-03-16)
4. **User Awareness** -- Who's online, viewing what (PresenceIndicator component added, 2026-03-16)
5. **@Mentions** -- Mention users for assignment (MentionSuggestions component with @username autocomplete, 2026-03-16)
6. **Notifications** -- In-app notification system (NotificationsPanel, unread count, mark read API, 2026-03-16)
7. **Permissions** -- Page-level permissions (page_permissions table, API routes, permission checks on note access, 2026-03-16)
8. **Shared Workspaces** -- Invite users via email (workspace_invitations table, API routes for create/list/revoke/accept, Team Members UI in Settings, 2026-03-16)
9. ~~Signaling Server~~ -- WebRTC signaling in Rust (implemented: WebSocket handler, room management, message routing for offer/answer/ICE, frontend integration, 2026-03-17)
10. ~~CLI Interface~~ -- Command-line tool for note CRUD and search (thynk-cli crate with list/search/cat/create/delete commands, 2026-03-17)
11. ~~Mobile Apps~~ -- Tauri 2.0 mobile support (capabilities configuration, Android minSdk 24, iOS 14.0+, 2026-03-17)
12. ~~Note Move/Rename~~ -- Move notes via drag-and-drop in sidebar (move_note API endpoint, get_note_by_path endpoint, storage layer move_note, database update_note_path, frontend drag-drop integration, 2026-03-17)
13. ~~Search Tag Filtering~~ -- Filter search results by tags (search_with_tags method, /api/search?tags= query parameter, tests added, 2026-03-17)
14. ~~Search Pagination~~ -- Paginated search results with limit/offset params (SearchEngine updated, API endpoint accepts limit/offset, tests added, 2026-03-17)
15. ~~Activity Feed~~ -- Recent activity from audit log (getAuditLog API, ActivityFeed component in sidebar, 2026-03-17)
16. ~~Trash/Soft Delete~~ -- Soft delete with trash view, restore, and permanent delete (API routes: POST /trash, POST /restore, DELETE /permanent, GET /trashed; DB methods; frontend TrashSection UI in sidebar with restore/permanent-delete actions, tests added, 2026-03-17)
17. ~~User Profiles~~ -- View shared docs, activity, mutual work (mutual_work field in API, build_mutual_work function, backend tests, frontend component updated, 2026-03-17)
18. ~~Todo Items~~ -- Support for - [ ], - [/], - [x] syntax in editor (TaskList + TaskItem extensions added, Markdown extension configured for proper parsing, tests added, 2026-03-18)
19. ~~404 on Refresh~~ -- Fixed SPA routing so refreshing note pages returns index.html instead of 404 (spa_fallback handler added, tests added, 2026-03-18)
20. ~~Wiki-Link Auto-Create~~ -- Clicking [[non-existent note]] now creates the note automatically (onNavigate callback updated to call createNote when target doesn't exist, tests added, 2026-03-18)
21. ~~Code Block Copy Button~~ -- Copy button appears on hover, copies code to clipboard (CodeBlockCopyButton extension, click handler, CSS styling, tests added, 2026-03-18)
22. ~~Newline Preservation~~ -- Fixed blank lines collapsing to single newline on refresh by storing content as HTML instead of markdown (Editor.tsx updated, tests added, 2026-03-18)
23. ~~Content Buffer~~ -- Add sessionStorage-based content buffer to prevent data loss on refresh (useContentBuffer hook, immediate local backup on each edit, restore on page load, tests added, 2026-03-18)
24. ~~History Navigation~~ -- Browser back/forward now works between notes and settings (openNoteByPath fetches note from API when not in local cache, 2026-03-18)

---

Last Updated: 2026-03-18 (History Navigation: Fixed browser back/forward navigation to properly load notes from API when not in local cache)
