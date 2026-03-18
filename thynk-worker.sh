#!/bin/bash
# Thynk GSD worker - runs opencode to work on tasks
# Called by cron hourly

export PATH="$HOME/.local/share/tooler/bin:$HOME/.opencode/bin:$HOME/.cargo/bin:$HOME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
export OPENCODE_API_KEY="${OPENCODE_API_KEY:-}"

LOCKFILE="/tmp/thynk-worker.lock"
LOG_DIR="$HOME/thynk-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/worker-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Acquire lock - exit if another instance is running
if ! mkdir "$LOCKFILE" 2>/dev/null; then
    log "Another worker instance is running, exiting"
    exit 0
fi
trap "rmdir $LOCKFILE" EXIT

log "=== GSD Worker cycle starting ==="

cd ~/thynk

# Pull latest
git pull origin main 2>&1 | tee -a "$LOG_FILE" || true

# Run QA first to check for failures
log "Running QA checks..."
if ! bash .hooks/pre-push 2>&1 | tee -a "$LOG_FILE"; then
    log "QA failed - attempting fixes..."
    # Fix cargo fmt
    cargo fmt --all 2>&1 | tee -a "$LOG_FILE"
    # Fix prettier
    command -v prettier && prettier --write "**/*.{md,json,yaml}" 2>&1 | tee -a "$LOG_FILE"
    # Commit fixes if any
    if git diff --quiet; then
        log "No fixes needed"
    else
        git add -A && git commit -m "style: fix QA issues" 2>&1 | tee -a "$LOG_FILE"
    fi
fi

# Run opencode with task
log "Starting opencode worker..."
timeout 3600 tooler run opencode run "You are the Thynk GSD worker. 

Read STATE.md and ROADMAP.md to understand current phase and status.

Check ROADMAP.md 'Known Issues & Backlog' section for priority bugs.

Pick ONE high-impact task from remaining work. Priority order:
1. Critical bugs (locking, websockets, refresh issues)
2. Infrastructure (self-hosted signaling, CI builds)
3. Features from backlog

Implementation requirements:
- TDD: write failing test first, then implement
- Verify: cargo build --quiet && cargo test --quiet && cd frontend && bun run build && bun test && cd .. && cargo clippy --quiet -- -D warnings
- Commit with conventional commit format: type(scope): description
- Push after verification
- Update STATE.md with progress

If QA hooks fail, fix the issues before committing." 2>&1 | tee -a "$LOG_FILE"

log "=== GSD Worker cycle complete ==="

# Clean old logs (keep last 20)
ls -t "$LOG_DIR"/worker-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true