# AGENTS.md - Thynk

## Setup

Before starting any work, ensure git hooks and their dependencies are installed.

Verify all required tools are available:

```bash
command -v infisical && command -v cargo && cargo clippy --version && cargo fmt --version && command -v markdownlint-cli2 && command -v prettier && echo "OK" || echo "MISSING TOOLS"
```

If any are missing, install them before proceeding. Then install the hooks:

```bash
bash .hooks/install.sh
```

This sets `core.hooksPath` to `.hooks/`, which runs:

- **pre-commit**: auto-formats staged files with prettier, then runs `infisical scan git-changes` to prevent secret leaks
- **pre-push**: QA checks (markdown lint, cargo check/clippy/fmt, frontend lint)

## CI/CD

CI runs automatically on push to `main` and on pull requests (`.github/workflows/qa.yml`):

- Markdown lint + prettier check
- Rust QA (check, clippy, fmt) -- when `Cargo.toml` exists
- Frontend lint -- when `package.json` exists
- Infisical secret scan

Releases are created automatically when a version tag is pushed (`.github/workflows/release.yml`).

### Versioning

Tags follow `v0.<phase>.<increment>`:

- `v0.1.0` -- Phase 1 milestone
- `v0.1.1` -- fix or checkpoint within Phase 1
- `v0.2.0` -- Phase 2 milestone
- `v0.3.0` -- Phase 3 milestone
- `v0.4.0` -- Phase 4 milestone
- `v1.0.0` -- full product release

## Project Documentation

| Document                                    | Purpose                                    |
| ------------------------------------------- | ------------------------------------------ |
| `PROJECT.md`                                | Vision, architecture, tech stack decisions |
| `ROADMAP.md`                                | 4-phase development plan and deliverables  |
| `STATE.md`                                  | Current status, decisions log, next steps  |
| `.planning/questions.md`                    | Resolved and open questions                |
| `.planning/research/competitor-analysis.md` | Competitor comparison                      |
| `.planning/research/tech-stack-analysis.md` | Tech stack evaluation                      |

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

## Development Process

### Test-Driven Development

Write tests first, then implement. For every feature or fix:

1. Write a failing test that defines the expected behavior
2. Implement the minimum code to make it pass
3. Refactor if needed, ensuring tests still pass

### Verification Before Completion

**Never claim work is "done" without verifying it actually works.** Before marking any task complete:

1. **Run the relevant tests** and confirm they pass
2. **Build the project** (`cargo build --quiet`, `bun run build`, etc.) and confirm it compiles
3. **Run the application** and manually verify the feature works end-to-end
4. **Run the QA hooks** (`bash .hooks/pre-push`) and confirm they pass
5. **Commit the work** -- uncommitted code is not done

If any step fails, fix it before reporting completion. Do not leave broken builds, failing tests, or uncommitted changes.

## Conventions

- Keep `STATE.md` updated when making significant progress or decisions
- Update `ROADMAP.md` when phase scope changes
- All features ship in a single release (no v1/v2 split)
- Commit messages MUST follow Conventional Commits format: `type(scope)?: description`

## Active Issues

See `ROADMAP.md` section "Known Issues & Backlog" for current bugs and feature requests. When fixing issues:

1. Reference the issue by name in your commit message
2. Update `ROADMAP.md` to mark items as complete
3. Run full QA (`bash .hooks/pre-push`) before pushing

## Data Safety

NEVER delete user data. The `data_dir` (default `./data` or `$THYNK_DATA_DIR`) contains real user documents. Tests MUST use isolated temporary directories. No automated process (CI, deploy, cleanup) may touch the data directory.

## Parallel Subagents

When implementing multiple independent features or fixes, use parallel subagents aggressively. Launch separate agents for tasks that don't depend on each other (e.g., backend and frontend fixes, independent bug fixes). This maximizes throughput.
