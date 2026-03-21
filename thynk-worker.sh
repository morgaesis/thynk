#!/bin/bash
# Thynk GSD worker - runs opencode to work on tasks
# Schedule: hourly with jitter (0-10 min random delay)

export PATH="$HOME/.local/share/tooler/bin:$HOME/.opencode/bin:$HOME/.cargo/bin:$HOME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin"

# Load API keys from system environment (requires sudo to read /etc/ai-tools/env)
ENV_CONTENT=$(sudo cat /etc/ai-tools/env 2>/dev/null) || true
if [ -n "$ENV_CONTENT" ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        [[ "$line" == \#* ]] && continue
        key="${line%%=*}"
        value="${line#*=}"
        export "$key=$value"
    done <<< "$ENV_CONTENT"
fi

LOG_DIR="$HOME/thynk-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/worker-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Random jitter: 0-10 minutes
JITTER=$((RANDOM % 600))
log "Sleeping ${JITTER}s before starting..."
sleep "$JITTER"

# Kill any existing worker process (no lock, just restart)
pkill -9 -f 'opencode run' 2>/dev/null || true
log "=== GSD Worker cycle starting ==="

cd ~/thynk

# Pull latest
git pull origin main 2>&1 | tee -a "$LOG_FILE" || true

# Run QA first to check for failures
log "Running QA checks..."
if ! bash .hooks/pre-push 2>&1 | tee -a "$LOG_FILE"; then
    log "QA failed - attempting fixes..."
    cargo fmt --all 2>&1 | tee -a "$LOG_FILE"
    command -v prettier && prettier --write "**/*.{md,json,yaml}" 2>&1 | tee -a "$LOG_FILE"
    if git diff --quiet; then
        log "No fixes needed"
    else
        git add -A && git commit -m "style: fix QA issues" 2>&1 | tee -a "$LOG_FILE"
    fi
fi

PROMPT='You are the Thynk GSD worker. Read .planning/design-decisions.md, .planning/questions.md, STATE.md, and ROADMAP.md to understand current phase, design constraints, and priorities. 

Pick ONE high-impact task from ROADMAP.md backlog. Priority order:
1. Critical bugs (locking, websockets, content loss)
2. CI/CD (desktop build icons)
3. Infrastructure (watchtower, self-hosted signaling)
4. Features from backlog

Check .planning/ for design constraints before implementing. Write failing tests first, implement, verify with cargo build/test and bun build/test, commit with conventional format, push, update STATE.md.'

log "Starting opencode worker (model: minimax-m2.5-free)..."
timeout 3600 opencode run --model=minimax-m2.5-free "$PROMPT" 2>&1 | tee -a "$LOG_FILE"

log "=== GSD Worker cycle complete ==="

# Clean old logs (keep last 20)
ls -t "$LOG_DIR"/worker-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true