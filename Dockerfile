# Build stage for Rust backend
FROM rust:1.85-bookworm AS rust-builder

WORKDIR /app

# Install dependencies for faster builds
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
COPY crates/thynk-core/Cargo.toml ./crates/thynk-core/
COPY crates/thynk-search/Cargo.toml ./crates/thynk-search/
COPY crates/thynk-sync/Cargo.toml ./crates/thynk-sync/
COPY crates/thynk-server/Cargo.toml ./crates/thynk-server/
RUN mkdir -p crates/thynk-core/src crates/thynk-search/src crates/thynk-sync/src crates/thynk-server/src && \
    echo "fn main() {}" > crates/thynk-core/src/lib.rs && \
    echo "fn main() {}" > crates/thynk-search/src/lib.rs && \
    echo "fn main() {}" > crates/thynk-sync/src/lib.rs && \
    echo "fn main() {}" > crates/thynk-server/src/main.rs

RUN cargo build --release && rm -rf target/release/deps/thynk*

# Build actual code
COPY crates ./crates
RUN cargo build --release --bin thynk-server

# Build stage for frontend
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend ./
RUN bun run build

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

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