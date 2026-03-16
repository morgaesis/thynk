# Build stage for Rust backend (server-only, no Tauri)
FROM rust:1.85-bookworm AS rust-builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# First, copy workspace manifests for dependency caching
COPY Cargo.toml Cargo.lock ./
COPY crates/thynk-core/Cargo.toml ./crates/thynk-core/
COPY crates/thynk-search/Cargo.toml ./crates/thynk-search/
COPY crates/thynk-sync/Cargo.toml ./crates/thynk-sync/
COPY crates/thynk-server/Cargo.toml ./crates/thynk-server/

# Replace the workspace members to exclude src-tauri (it uses glob pattern)
RUN sed -i 's/members = \["crates\/\*", "src-tauri"\]/members = ["crates\/\*"]/' Cargo.toml

# Create placeholder source files
RUN mkdir -p crates/thynk-core/src crates/thynk-search/src crates/thynk-sync/src crates/thynk-server/src && \
    echo "pub fn placeholder() {}" > crates/thynk-core/src/lib.rs && \
    echo "pub fn placeholder() {}" > crates/thynk-search/src/lib.rs && \
    echo "pub fn placeholder() {}" > crates/thynk-sync/src/lib.rs && \
    echo "fn main() {}" > crates/thynk-server/src/main.rs

# Cache dependencies
RUN cargo build --release --locked

# Now copy actual source
COPY crates ./crates

# Build the server binary
RUN cargo build --release --bin thynk-server --locked

# Build stage for frontend
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend ./
RUN bun run build

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend binary
COPY --from=rust-builder /app/target/release/thynk-server /usr/local/bin/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create data directory
RUN mkdir -p /data

ENV THYNK_DATA_DIR=/data
ENV THYNK_FRONTEND_DIR=/app/frontend/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["thynk-server"]