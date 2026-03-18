#!/bin/bash
# Thynk GSD worker - runs opencode to work on tasks

export PATH="$HOME/.local/share/tooler/bin:$HOME/.opencode/bin:$HOME/.cargo/bin:$HOME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"

# Load API keys from system environment
if [ -f /etc/ai-tools/env ]; then
    eval "$(sudo cat /etc/ai-tools/env 2>/dev/null | grep -v '^#' | grep '=' | sed 's/^/export /')"
fi

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

PROMPT='Read STATE.md and ROADMAP.md for current status. Pick ONE high-impact task from ROADMAP.md backlog. Prioritize: CI/CD fixes for desktop build icons, Docker image build for watchtower, critical bugs. Write failing tests first, implement, verify with cargo build/test and bun build/test, commit with conventional format, push, update STATE.md.'

# Run opencode with task
log "Starting opencode worker (model: ${OPENCODE_MODEL:-default})..."
if [ -n "$OPENCODE_MODEL" ]; then
    timeout 3600 tooler run opencode run -m "$OPENCODE_MODEL" "$PROMPT" 2>&1 | tee -a "$LOG_FILE"
else
    timeout 3600 tooler run opencode run "$PROMPT" 2>&1 | tee -a "$LOG_FILE"
fi

log "=== GSD Worker cycle complete ==="

# Clean old logs (keep last 20)
ls -t "$LOG_DIR"/worker-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true