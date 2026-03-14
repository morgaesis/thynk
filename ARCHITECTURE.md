# ARCHITECTURE.md - Thynk System Design

## System Overview

Thynk is a browser-first, server-backed knowledge management platform. The browser is the primary UI. A Rust/Axum server handles all file operations, indexing, and API requests. Files live on the filesystem as plain Markdown with YAML frontmatter; SQLite holds metadata, indexes, and structured data.

```text
+---------------------------+        +-----------------------------+
|       Browser (React)     |        |    Rust Backend (Axum)      |
|                           |  REST  |                             |
|  +---------------------+  | <----> |  thynk-server               |
|  | TipTap Editor       |  |   WS   |    - HTTP routes            |
|  +---------------------+  | <----> |    - WebSocket (file watch) |
|  | Sidebar / File Tree |  |        |    - Static asset serving   |
|  +---------------------+  |        |                             |
|  | Command Palette     |  |        |  thynk-core                 |
|  +---------------------+  |        |    - File I/O               |
|  | Zustand State       |  |        |    - Markdown parsing       |
|  +---------------------+  |        |    - Frontmatter extraction |
+---------------------------+        |                             |
                                     |  thynk-search               |
                                     |    - FTS5 index (SQLite)    |
                                     |    - Query engine           |
                                     |                             |
                                     +-----------------------------+
                                                  |
                                     +------------+------------+
                                     |                         |
                              +------+------+          +-------+------+
                              | SQLite DB   |          | Filesystem   |
                              | (metadata,  |          | (*.md files) |
                              |  FTS index) |          |              |
                              +-------------+          +--------------+
```

### Deployment Modes

| Mode                | Description                           | Backend                         | Storage                       |
| ------------------- | ------------------------------------- | ------------------------------- | ----------------------------- |
| Browser + localhost | Browser connects to local Rust server | `cargo run` on user machine     | Local filesystem              |
| Browser + cloud     | Browser connects to hosted instance   | Per-workspace Fly.io Machine    | Persistent volume (cloud)     |
| Desktop (Tauri)     | Native app, embedded Rust server      | `thynk-desktop` (Tauri wrapper) | Local filesystem + cloud sync |
| Mobile (Tauri)      | Native app, embedded Rust server      | `thynk-desktop` (Tauri wrapper) | Local filesystem + cloud sync |

**Cloud deployment**: Each workspace runs its own Rust process with an attached persistent volume. A gateway proxy routes by workspace slug. Instances scale to zero and wake on the first request (~10-50ms cold start).

---

## Crate Structure

Rust workspace with shared library crates consumed by both the server binary and the Tauri desktop wrapper. No business logic lives in `thynk-server` or `thynk-desktop` -- both are thin shells over the shared crates.

```text
Cargo.toml          (workspace root)
thynk-core/         Core domain: file ops, markdown parsing, note model
thynk-search/       FTS5 index management and query engine
thynk-server/       Axum HTTP server, route handlers, WebSocket
thynk-sync/         Differential sync engine (Phase 3)
thynk-desktop/      Tauri app wrapper (Phase 4)
```

### `thynk-core`

Owns the canonical note model and all filesystem interaction. No HTTP, no database connections.

Responsibilities:

- Read and write Markdown files from the workspace directory
- Parse YAML frontmatter into typed structs
- Extract metadata: title, tags, created/updated timestamps, content hash
- Walk directory trees and produce file-tree representations
- Note model: `Note`, `NoteMeta`, `Frontmatter`

### `thynk-search`

Owns the SQLite database connection and all FTS5 operations.

Responsibilities:

- Initialize and migrate the SQLite schema
- Index notes on create/update, remove on delete
- Execute full-text queries and return ranked results
- Manage the `notes`, `notes_fts`, `tags`, and `note_tags` tables

### `thynk-server`

Thin Axum application. Wires routes to handlers. Handlers call `thynk-core` and `thynk-search`.

Responsibilities:

- Define and serve REST API routes
- Manage WebSocket connections for file-watch events
- CORS configuration
- Serve the compiled frontend (static files)
- Configuration: workspace path, bind address, allowed origins

### `thynk-sync` (Phase 3)

Differential sync engine for local-to-cloud replication.

Responsibilities:

- Content-addressed diff (file hash comparison)
- Push/pull operations between local and remote instances
- CRDT-based conflict resolution for concurrent edits
- Sync state tracking per file

### `thynk-desktop` (Phase 4)

Tauri 2.0 application wrapper. Embeds `thynk-server` as a sidecar or spawns it as a subprocess, then loads the frontend in a webview.

Responsibilities:

- Native app packaging (macOS, Windows, Linux, iOS, Android)
- System tray, window management, native OS integration
- Expose Tauri commands for operations that need native APIs (e.g., file picker)
- Handle offline mode and local sync scheduling

---

## API Surface

All routes are under `/api`. The server also serves compiled frontend assets from `/`.

### REST Endpoints (Phase 1)

#### Notes

```text
GET    /api/notes
GET    /api/notes/:id
POST   /api/notes
PUT    /api/notes/:id
DELETE /api/notes/:id
```

#### Search and Navigation

```text
GET    /api/search?q=<query>
GET    /api/tree
```

#### Real-Time

```text
WS     /api/ws
```

---

### Request / Response Shapes

```typescript
// GET /api/notes
// Response: list of note metadata, no content body
interface NoteListItem {
  id: string; // stable ID derived from path (e.g., SHA of relative path)
  path: string; // relative path from workspace root, e.g. "projects/thynk.md"
  title: string;
  tags: string[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

type NoteListResponse = NoteListItem[];

// GET /api/notes/:id
// Response: full note including content
interface NoteResponse {
  id: string;
  path: string;
  title: string;
  content: string; // raw Markdown, including frontmatter
  frontmatter: Record<string, unknown>;
  tags: string[];
  created_at: string;
  updated_at: string;
  content_hash: string; // SHA-256 of content, used for optimistic concurrency
}

// POST /api/notes
interface CreateNoteRequest {
  path: string; // desired path relative to workspace root
  content: string; // full Markdown content (frontmatter + body)
}

interface CreateNoteResponse {
  id: string;
  path: string;
  created_at: string;
}

// PUT /api/notes/:id
interface UpdateNoteRequest {
  content: string; // full Markdown content
  if_match?: string; // optional content_hash for optimistic concurrency check
}

interface UpdateNoteResponse {
  id: string;
  updated_at: string;
  content_hash: string;
}

// DELETE /api/notes/:id
// Response: 204 No Content

// GET /api/search?q=<query>
interface SearchResult {
  id: string;
  path: string;
  title: string;
  snippet: string; // FTS5 highlight snippet
  rank: number; // FTS5 rank score
}

type SearchResponse = SearchResult[];

// GET /api/tree
interface TreeNode {
  name: string;
  path: string; // relative path
  type: 'file' | 'directory';
  children?: TreeNode[];
}

type TreeResponse = TreeNode;

// WS /api/ws
// Server-sent events (JSON messages over WebSocket)
interface WsEvent {
  type: 'created' | 'updated' | 'deleted' | 'renamed';
  path: string;
  new_path?: string; // for "renamed" events only
  id: string;
}
```

### Error Responses

All errors follow a consistent envelope:

```typescript
interface ApiError {
  error: string; // machine-readable code, e.g. "not_found", "path_traversal"
  message: string; // human-readable description
}
```

HTTP status codes: `400` (bad request), `404` (not found), `409` (conflict / if_match mismatch), `422` (validation error), `500` (internal error).

---

## Data Model

SQLite database stored at `<workspace>/.thynk/index.db`. One database per workspace.

### Schema

```sql
CREATE TABLE notes (
    id           TEXT PRIMARY KEY,   -- SHA-256 of relative path (hex, first 16 bytes)
    path         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL,       -- SHA-256 of full file content
    frontmatter  TEXT,                -- JSON blob of parsed YAML frontmatter
    created_at   TEXT NOT NULL,       -- ISO 8601
    updated_at   TEXT NOT NULL        -- ISO 8601
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 1'
);

-- FTS triggers to keep notes_fts in sync with notes
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (new.rowid, new.title, (SELECT content FROM note_content WHERE id = new.id));
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, '');
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content)
    VALUES ('delete', old.rowid, old.title, '');
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (new.rowid, new.title, (SELECT content FROM note_content WHERE id = new.id));
END;

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Indexes
CREATE INDEX idx_notes_path       ON notes(path);
CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX idx_note_tags_note   ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag    ON note_tags(tag_id);
```

### FTS5 Notes

FTS5 `content=''` mode stores content in a separate shadow table. The `note_content` view (or a separate table) holds raw text extracted from Markdown (stripped of syntax) to improve search relevance. The `content_hash` in `notes` allows the indexer to skip re-indexing files that haven't changed.

### Future Tables (not yet defined)

| Table        | Phase   | Purpose                                                 |
| ------------ | ------- | ------------------------------------------------------- |
| `users`      | Phase 3 | Auth: user accounts, OAuth provider tokens              |
| `sessions`   | Phase 3 | JWT session store                                       |
| `audit_log`  | Phase 3 | Append-only change log for compliance                   |
| `locks`      | Phase 2 | Page lock leases with heartbeat timestamps              |
| `note_links` | Phase 2 | Resolved `[[wiki-link]]` graph edges                    |
| `embeddings` | Phase 3 | Vector embeddings for semantic search                   |
| `sync_state` | Phase 3 | Per-file sync metadata (last synced hash, vector clock) |

---

## Frontend Architecture

### Component Tree

```text
App
  Router
    Layout
      Sidebar
        WorkspaceHeader
        FileTree
          TreeNode (recursive)
        TagList
        RecentNotes
      EditorPane
        NoteHeader (title, frontmatter UI)
        TipTapEditor
          Extensions: StarterKit, Markdown, Table, CodeBlock, WikiLink, ...
        NoteFooter (word count, last saved)
      CommandPalette (modal, triggered by Cmd+K)
        SearchInput
        ResultList
          ResultItem
    SettingsPage
    SearchPage
```

### State Management (Zustand)

Three top-level stores. Each store is a single Zustand slice; they do not reference each other directly -- cross-store reads happen in components or via selectors.

**`noteStore`**

```typescript
interface NoteStore {
  notes: Map<string, NoteListItem>; // keyed by id
  activeNoteId: string | null;
  activeNote: NoteResponse | null; // full content of the open note
  loadNotes: () => Promise<void>;
  openNote: (id: string) => Promise<void>;
  createNote: (path: string, content?: string) => Promise<NoteResponse>;
  updateNote: (id: string, content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}
```

**`uiStore`**

```typescript
interface UiStore {
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  tree: TreeNode | null;
  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: UiStore['theme']) => void;
  loadTree: () => Promise<void>;
}
```

**`searchStore`**

```typescript
interface SearchStore {
  query: string;
  results: SearchResult[];
  loading: boolean;
  setQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  clearResults: () => void;
}
```

### TipTap Editor

TipTap is initialized with ProseMirror as the underlying engine. Extensions used in Phase 1:

| Extension                          | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `StarterKit`                       | Headings, bold, italic, lists, blockquote, code        |
| `CodeBlockLowlight`                | Syntax-highlighted code blocks (lowlight/highlight.js) |
| `Table` + `TableRow` + `TableCell` | Markdown tables                                        |
| `Placeholder`                      | Empty state hint                                       |
| `Typography`                       | Smart quotes, dashes                                   |
| `Markdown` (tiptap-markdown)       | Serialize/deserialize raw Markdown                     |

Phase 4 additions: `Collaboration` (Yjs), `CollaborationCursor` (cursor presence).

The editor persists on a debounced interval (500ms after last keystroke). On save, the full Markdown string is extracted via `editor.storage.markdown.getMarkdown()` and sent to `PUT /api/notes/:id`. The `content_hash` from the last fetch is sent as `if_match` to detect write conflicts.

### API Client Layer

A thin typed client in `src/api/client.ts` wraps `fetch`. Each endpoint has a corresponding function. No third-party HTTP library. The client reads the base URL from `import.meta.env.VITE_API_BASE_URL` (defaults to `''` for same-origin requests).

```typescript
// src/api/client.ts (shape, not exhaustive)
export const api = {
  notes: {
    list: (): Promise<NoteListItem[]> => ...,
    get: (id: string): Promise<NoteResponse> => ...,
    create: (req: CreateNoteRequest): Promise<CreateNoteResponse> => ...,
    update: (id: string, req: UpdateNoteRequest): Promise<UpdateNoteResponse> => ...,
    delete: (id: string): Promise<void> => ...,
  },
  search: (q: string): Promise<SearchResult[]> => ...,
  tree: (): Promise<TreeNode> => ...,
};
```

WebSocket connection is managed in a singleton hook `useFileWatcher` that subscribes to `/api/ws` and dispatches `WsEvent` messages to `noteStore` and `uiStore` to trigger re-fetches.

---

## Directory Structure

```text
thynk/
  Cargo.toml                   Workspace root
  Cargo.lock
  .github/
    workflows/
      qa.yml                   CI: lint, check, clippy, fmt, secret scan
      release.yml              Release on version tag push
  .hooks/
    install.sh
    pre-commit                 prettier format + infisical secret scan
    pre-push                   QA: markdownlint, cargo check/clippy/fmt, eslint

  thynk-core/
    Cargo.toml
    src/
      lib.rs
      note.rs                  Note and NoteMeta types
      fs.rs                    Filesystem read/write operations
      parser.rs                Markdown + frontmatter parsing

  thynk-search/
    Cargo.toml
    src/
      lib.rs
      db.rs                    SQLite connection, migrations
      index.rs                 FTS5 indexing operations
      query.rs                 Search query execution

  thynk-server/
    Cargo.toml
    src/
      main.rs                  Entry point, config, server startup
      routes/
        mod.rs
        notes.rs               CRUD handlers
        search.rs              Search handler
        tree.rs                File tree handler
        ws.rs                  WebSocket handler
      state.rs                 Axum shared state (AppState)
      error.rs                 Error types and Into<Response>

  thynk-sync/                  (Phase 3)
    Cargo.toml
    src/
      lib.rs
      diff.rs
      push.rs
      pull.rs
      conflict.rs

  thynk-desktop/               (Phase 4)
    Cargo.toml
    src/
      main.rs                  Tauri entry point
      commands.rs              Tauri IPC commands

  frontend/
    package.json
    vite.config.ts
    tailwind.config.ts
    tsconfig.json
    index.html
    src/
      main.tsx                 React entry point
      App.tsx
      api/
        client.ts              Typed API client
        types.ts               Shared API interfaces (mirrors Rust types)
      components/
        Layout/
        Sidebar/
          FileTree.tsx
          TagList.tsx
        Editor/
          TipTapEditor.tsx
          NoteHeader.tsx
        CommandPalette/
      stores/
        noteStore.ts
        uiStore.ts
        searchStore.ts
      hooks/
        useFileWatcher.ts      WebSocket hook
        useDebounce.ts
      styles/
        globals.css
        themes.css             CSS variables for light/dark themes
```

---

## Security Considerations

### Path Traversal Prevention

All file paths from API requests are treated as untrusted. Before any filesystem operation, `thynk-core` resolves the requested path against the workspace root and verifies the canonical path starts with the canonical workspace root. Any path that escapes the workspace (e.g., `../../etc/passwd`) returns a `400` error with code `path_traversal`. This check happens in one place (`fs.rs`) so it cannot be bypassed by individual handlers.

### Input Sanitization

- Frontmatter is parsed with a strict YAML parser; malformed YAML returns a `422` error rather than crashing.
- Note IDs accepted in URL params are validated as hex strings before use in SQLite queries.
- SQLite queries use parameterized statements exclusively -- no string interpolation.

### CORS Configuration

In localhost mode, CORS allows `http://localhost:*` origins. In cloud mode, the allowed origin list is set at startup from an environment variable (`THYNK_ALLOWED_ORIGINS`) and defaults to the same origin. The `Access-Control-Allow-Origin` header is never set to `*` in production.

### Optimistic Concurrency

`PUT /api/notes/:id` accepts an optional `if_match` field containing the `content_hash` from the last read. If provided and the current file hash differs, the server returns `409 Conflict` instead of silently overwriting. The client uses this to detect out-of-band edits (e.g., another process editing the same file).

### Future Considerations (Phase 3+)

- Auth tokens are short-lived JWTs with refresh rotation.
- All database writes to the audit log are append-only; rows cannot be updated or deleted.
- Page locks use a server-enforced lease model with a heartbeat interval; stale locks are automatically released.
- Cloud instances run in isolated namespaces (no shared filesystem between workspaces).

---

_Document Version: 1.0_
_Status: Active_
