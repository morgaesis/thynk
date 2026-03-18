# ROADMAP.md - Thynk Development Phases

## Overview

Single product release with all core features built in. Development is structured in four phases for sequencing work -- these are internal development milestones, not separate product versions.

---

## Phase Overview

```text
Phase 1: Foundation          Core infrastructure, editor, note CRUD
Phase 2: Knowledge & Data    Linking, search, tables, databases, calendar, project features
Phase 3: AI & Sync           BYOK AI, semantic search, cloud sync, audit trail
Phase 4: Collaboration       P2P real-time editing, @mentions, native apps
```

All phases target the same single release.

---

## Phase 1: Foundation

### Goals

Build the server + editor + file management working end-to-end in browser.

### Deliverables

| Deliverable         | Description                                        |
| ------------------- | -------------------------------------------------- |
| Project Scaffold    | Vite + React + TypeScript + Tailwind               |
| Rust Backend        | Axum server with filesystem ops and REST API       |
| SQLite Layer        | Metadata, indexes, structured data storage         |
| TipTap Editor       | Markdown editing, slash commands, code blocks      |
| Note CRUD           | Create, read, update, delete via API on real files |
| File Tree / Sidebar | Workspace navigation, folder structure             |
| FTS5 Search         | Full-text search via SQLite                        |
| Command Palette     | Quick switcher with fuzzy matching (MiniSearch)    |
| Theming             | Light/dark theme via CSS variables + Tailwind      |

### Exit Criteria

- Create and edit markdown notes in the browser, backed by real files on the filesystem
- Search across all notes with sub-100ms results
- Clean, responsive UI with sidebar navigation and command palette
- Sidebar shows folder tree; creating `foo/bar/baz.md` auto-creates directories
- New note creation always prompts for filename (default "untitled" if blank)
- Filesystem changes (external creates/deletes) immediately reflected in nav
- Delete from sidebar actually deletes the note (fixes stale state / cache drift)
- Code blocks: exit on double-Enter at end, show language tag, stable vertical height
- Offline/disconnected indicator in UI

---

## Phase 2: Knowledge & Data

### Goals

Build the features that make Thynk a knowledge base and project planning tool, not just a text editor.

### Deliverables

| Deliverable            | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| Bi-directional Linking | `[[wiki-links]]`, backlinks panel, unlinked mentions    |
| Graph View             | Note connections visualization                          |
| Tags & Organization    | Tags, favorites, recent notes, drag-and-drop            |
| Templates              | Note and project templates                              |
| Daily Notes            | Calendar-linked daily notes workflow                    |
| Tables                 | Sortable, filterable tables (TipTap table extension)    |
| Database Views         | List, board/kanban, timeline views over structured data |
| Calendar Views         | Time-based queries and calendar integration             |
| Page Properties        | YAML frontmatter UI for metadata editing                |
| Page Locking           | Server-enforced locks with lease/heartbeat              |
| Automations (minimal)  | Status sync: "done" in one view = "done" everywhere     |
| Vim Mode               | Optional vim keybindings for the editor                 |
| Settings Page          | UI for theme, keybindings, AI keys, sync config         |
| Import                 | Obsidian vaults, markdown folders                       |
| Export                 | Full markdown export, portable                          |

### Exit Criteria

- Full knowledge management workflow: link notes, visualize connections, structured data views
- Project planning via database views with board/kanban, status tracking, automations
- Page locking works for controlled documents
- Can import an existing Obsidian vault

---

## Phase 3: AI & Sync

### Goals

Add intelligence, cloud sync, and production-readiness.

### Deliverables

| Deliverable              | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| BYOK AI Integration      | OpenAI, Anthropic, OpenRouter, local Ollama support               |
| AI Writing Assist        | Summarization, Q&A over notes, writing suggestions                |
| AI Link Suggestions      | Suggest connections between notes                                 |
| Semantic Search          | Embeddings stored in SQLite, vector similarity search             |
| Custom Sync Engine       | Differential sync between local and cloud instances               |
| Cloud Deployment         | Per-workspace instances, scale-to-zero (Fly.io Machines)          |
| Conflict Resolution      | CRDT-based merge for sync conflicts                               |
| Audit Trail              | Append-only changelog: who changed what, when                     |
| Auth System              | JWT/session auth, OAuth (GitHub, Google) login methods            |
| Onboarding Flow          | Guided tutorial, progressive complexity                           |
| Performance Optimization | Meet all performance benchmarks                                   |
| Cloud Transcription      | ElevenLabs / Whisper API fallback for dictation (BYOK)            |
| Custom S3 Storage        | Allow users to configure their own S3-compatible storage endpoint |

### Exit Criteria

- AI features work with user-provided API keys (or local Ollama)
- Sync between localhost and cloud instances is reliable
- Cloud mode works: sign up, get a workspace, use Thynk in the browser like Notion
- Audit trail captures all document changes for compliance

---

## Phase 4: Collaboration & Platform

### Goals

Enable real-time collaboration and ship native apps.

### Deliverables

| Deliverable           | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| P2P Real-Time Editing | Yjs + y-webrtc (STUN) for live collaborative editing            |
| Cursor Presence       | See other users' cursors and selections                         |
| User Awareness        | Who's online, who's viewing what                                |
| @Mentions             | Mention users for assignment and notification                   |
| Notifications         | In-app notification system for mentions, assignments            |
| Permissions           | View/edit/admin roles per workspace and per page                |
| Shared Workspaces     | Invite users, manage workspace membership                       |
| Signaling Server      | WebRTC signaling in Rust, TURN fallback                         |
| Desktop Apps          | Tauri packaging for Mac, Windows, Linux                         |
| Mobile Apps           | Tauri for iOS and Android                                       |
| Cross-Platform Sync   | Desktop/mobile sync with cloud, offline support                 |
| CLI Interface         | `thynk` CLI for CRUD, search, export (LLM-friendly output mode) |
| User Profiles         | View shared docs, activity, mutual work with other users        |

### Exit Criteria

- Multiple users can edit the same document simultaneously with live cursors
- @mentions trigger notifications and can assign tasks
- Desktop apps launch and work offline with sync
- Mobile apps provide full read/write experience

---

## Architecture Notes

### Shared Rust Crates

Core backend logic is organized into shared crates so that the Axum cloud server and the Tauri desktop app reuse the same code:

```text
thynk-core/        File ops, markdown parsing, metadata extraction
thynk-search/      FTS5 indexing, semantic search
thynk-sync/        Differential sync engine, conflict resolution
thynk-server/      Axum HTTP server, API routes (used by cloud + localhost)
thynk-desktop/     Tauri app, wraps thynk-server + frontend
```

### Collab-Ready Architecture

TipTap + ProseMirror is chosen specifically because Yjs integrates via `y-prosemirror`. The editor, storage, and data model don't need to change when collaboration is added in Phase 4. Adding collab is:

1. Add Yjs document provider (y-webrtc)
2. Add signaling server
3. Add presence/cursor UI
4. Add auth + permissions layer

### Scale-to-Zero Cloud

Each workspace runs its own Rust instance with persistent volume:

- Gateway proxy routes requests by workspace
- Instance wakes on first request (~10-50ms cold start)
- Instance sleeps after idle timeout
- No shared-tenancy complexity

---

## Dependencies

### Phase Dependencies

```text
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

Each phase builds on the previous. No phase can be skipped.

---

## Known Issues & Backlog

See `STATE.md` for current blockers and active work.

### Critical Bugs

- ~~**Document locking**~~ - Locking doesn't persist; locked state lost on refresh (FIXED: lock intent stored in sessionStorage, re-acquires on page refresh)
- **Newlines truncated** - Multiple newlines collapse to one on refresh
- **Content loss** - Fast typing or images disappear on refresh; needs auto-save buffer
- ~~**404 on refresh**~~ - Opening note then refreshing gives 404, but note appears in UI (FIXED: spa_fallback handler now serves index.html for non-API paths)
- ~~**WebSocket failures**~~ - External signaling servers `y-webrtc-signaling-eu.herokuapp.com` and `signaling.yjs.dev` fail (FIXED: removed external fallback, now uses self-hosted signaling only)
- **History navigation** - Browser back/forward doesn't work between notes and settings

### Features Needed

- **Wiki links** - `[[note-name]]` should create note if it doesn't exist
- **Editor parity** - Match Obsidian feel with Notion slash-commands
- ~~**Code blocks**~~ - Fix styling, add copy button, show language (DONE: copy button added, 2026-03-18)
- ~~**Todo items**~~ - Support `- [ ]`, `- [/]`, `- [x]` states (DONE)
- **Multi-tenancy** - Workspaces with user signup and invitations
- **Cloud storage** - Sync notes to bucket, count towards quota
- **Document versioning** - Version history for notes

### UI/UX

- **Settings** - Modal overlay, not separate page
- **Notifications** - Bell icon, not full navbar line
- **Modal closing** - ESC and click-outside should close modals
- **Theme support** - Custom CSS themes, selector in settings

### Infrastructure

- **Desktop builds** - CI for Windows/Linux (arm/x86)
- **Self-hosted signaling** - Add STUN/TURN/signal server to docker-compose
- **Model discovery** - Auto-fetch model list from API provider

### External Dependencies

| Dependency              | Phase   | Risk   | Mitigation                        |
| ----------------------- | ------- | ------ | --------------------------------- |
| Tauri 2.0 mobile        | Phase 4 | Medium | Browser mode covers all platforms |
| ONNX/embedding models   | Phase 3 | Low    | Cloud AI fallback via BYOK        |
| WebRTC/STUN reliability | Phase 4 | Medium | TURN server fallback              |

---

## Risks

| Risk                         | Phase   | Mitigation                            |
| ---------------------------- | ------- | ------------------------------------- |
| Tauri mobile not ready       | Phase 4 | Browser mode is the primary interface |
| Sync complexity              | Phase 3 | Start with simple differential sync   |
| P2P connectivity issues      | Phase 4 | STUN + TURN server fallback           |
| Performance at scale (100K+) | Phase 3 | SQLite FTS5 benchmarks, pagination    |
| Competitor feature parity    | Ongoing | Focus on speed and UX differentiation |

---

_Document Version: 2.0_
_Status: Active_
