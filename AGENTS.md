# AGENTS.md - Thynk

## Setup

Before starting any work, ensure git hooks and their dependencies are installed.

Verify all required tools are available:

```bash
command -v infisical && command -v cargo && cargo clippy --version && cargo fmt --version && echo "OK" || echo "MISSING TOOLS"
```

If any are missing, install them before proceeding. Then install the hooks:

```bash
bash .hooks/install.sh
```

This sets `core.hooksPath` to `.hooks/`, which runs:
- **pre-commit**: `infisical scan git-changes` to prevent secret leaks
- **pre-push**: QA checks (markdown lint, cargo check/clippy/fmt, frontend lint)

## Project Documentation

| Document                                       | Purpose                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `PROJECT.md`                                   | Vision, architecture, tech stack decisions |
| `ROADMAP.md`                                   | 4-phase development plan and deliverables  |
| `STATE.md`                                     | Current status, decisions log, next steps  |
| `.planning/questions.md`                       | Resolved and open questions                |
| `.planning/research/competitor-analysis.md`    | Competitor comparison                      |
| `.planning/research/tech-stack-analysis.md`    | Tech stack evaluation                      |

## Tech Stack

- **Backend**: Rust + Axum
- **Frontend**: React + TypeScript + Vite
- **Editor**: TipTap (ProseMirror)
- **Database**: SQLite (metadata, indexes, structured data)
- **Storage**: Filesystem (markdown files)
- **Search**: SQLite FTS5
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Desktop**: Tauri 2.0

## Architecture

Browser-first, server-backed. The browser connects to a Rust/Axum server (localhost or cloud). Files live on the filesystem, not in the browser. See `PROJECT.md` for deployment modes and full architecture details.

## Conventions

- Keep `STATE.md` updated when making significant progress or decisions
- Update `ROADMAP.md` when phase scope changes
- All features ship in a single release (no v1/v2 split)
