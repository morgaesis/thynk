use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use tokio::time::{interval, Duration, Instant};
use tracing::{debug, warn};

use crate::state::AppState;

/// GET /api/ws — upgrade to WebSocket and stream file-change events.
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.events.subscribe();
    debug!("WebSocket client connected");

    let mut ping_interval = interval(Duration::from_secs(30));
    ping_interval.tick().await; // discard first immediate tick

    let pong_timeout = tokio::time::sleep(Duration::from_secs(3600)); // far future initially
    tokio::pin!(pong_timeout);
    let mut awaiting_pong = false;

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
                pong_timeout.as_mut().reset(Instant::now() + Duration::from_secs(10));
                awaiting_pong = true;
            }
            _ = &mut pong_timeout, if awaiting_pong => {
                warn!("WebSocket ping timeout, closing connection");
                break;
            }
            // Forward broadcast events to the client.
            result = rx.recv() => {
                match result {
                    Ok(event) => {
                        match serde_json::to_string(&event) {
                            Ok(json) => {
                                if socket.send(Message::Text(json.into())).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => warn!("Failed to serialize WS event: {e}"),
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        warn!("WS client lagged, skipped {n} events");
                    }
                }
            }
            // Handle incoming messages (ping/pong, close).
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Pong(_))) => {
                        awaiting_pong = false;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    debug!("WebSocket client disconnected");
}
