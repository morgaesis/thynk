use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info};

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SignalingMessage {
    #[serde(rename = "subscribe")]
    Subscribe { rooms: Vec<String> },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { rooms: Vec<String> },
    #[serde(rename = "sync")]
    Sync { room: String, clients: Vec<String> },
    #[serde(rename = "offer")]
    Offer {
        to: String,
        from: String,
        #[serde(rename = "sdp")]
        sdp: String,
    },
    #[serde(rename = "answer")]
    Answer {
        to: String,
        from: String,
        #[serde(rename = "sdp")]
        sdp: String,
    },
    #[serde(rename = "ice")]
    Ice {
        to: String,
        from: String,
        candidate: String,
    },
    #[serde(rename = "peer")]
    Peer { clients: Vec<String> },
    #[serde(rename = "disconnect")]
    Disconnect { room: String, clients: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalingQuery {
    pub room: Option<String>,
}

#[allow(dead_code)]
pub(crate) struct SignalingClient {
    id: String,
    sender: broadcast::Sender<String>,
}

pub(crate) type SignalingRooms = Arc<RwLock<HashMap<String, HashMap<String, SignalingClient>>>>;

pub struct SignalingState {
    pub(crate) rooms: SignalingRooms,
}

impl SignalingState {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl Default for SignalingState {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for SignalingState {
    fn clone(&self) -> Self {
        Self {
            rooms: self.rooms.clone(),
        }
    }
}

pub async fn signaling_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<SignalingQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let room = query.room.unwrap_or_else(|| "default".to_string());
    
    ws.on_upgrade(move |socket| handle_signaling_socket(socket, room, state))
}

async fn handle_signaling_socket(socket: WebSocket, room: String, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let client_id = uuid::Uuid::new_v4().to_string();
    
    info!("New signaling client: {} for room: {}", client_id, room);
    
    let (tx, mut rx) = broadcast::channel::<String>(100);
    
    let rooms = state.signaling.rooms.clone();
    
    {
        let mut rooms_lock = rooms.write().await;
        let room_clients = rooms_lock.entry(room.clone()).or_insert_with(HashMap::new);
        room_clients.insert(client_id.clone(), SignalingClient {
            id: client_id.clone(),
            sender: tx.clone(),
        });
    }
    
    let sync_msg = SignalingMessage::Sync {
        room: room.clone(),
        clients: vec![],
    };
    let sync_json = serde_json::to_string(&sync_msg).unwrap();
    let _ = sender.send(Message::Text(sync_json.into())).await;
    
    {
        let rooms_lock = rooms.read().await;
        if let Some(room_clients) = rooms_lock.get(&room) {
            let _clients: Vec<String> = room_clients.keys().cloned().collect();
            for (id, client) in room_clients {
                if id != &client_id {
                    let peer_msg = SignalingMessage::Peer {
                        clients: vec![client_id.clone()],
                    };
                    if let Ok(json) = serde_json::to_string(&peer_msg) {
                        let _ = client.sender.send(json);
                    }
                }
            }
        }
    }
    
    let tx_clone = tx.clone();
    let client_id_clone = client_id.clone();
    let room_clone = room.clone();
    let rooms_clone = rooms.clone();
    
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
        
        let mut rooms_lock = rooms_clone.write().await;
        if let Some(room_clients) = rooms_lock.get_mut(&room_clone) {
            room_clients.remove(&client_id_clone);
            if room_clients.is_empty() {
                rooms_lock.remove(&room_clone);
            }
        }
        
        info!("Signaling client {} disconnected", client_id_clone);
    });
    
    let rooms_for_recv = rooms.clone();
    let client_id_for_recv = client_id.clone();
    let room_for_recv = room.clone();
    
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(signaling_msg) = serde_json::from_str::<SignalingMessage>(&text) {
                        handle_signaling_message(
                            signaling_msg,
                            &client_id_for_recv,
                            &room_for_recv,
                            &rooms_for_recv,
                            &tx_clone,
                        ).await;
                    }
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });
    
    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

async fn handle_signaling_message(
    msg: SignalingMessage,
    client_id: &str,
    room: &str,
    rooms: &SignalingRooms,
    sender: &broadcast::Sender<String>,
) {
    match msg {
        SignalingMessage::Subscribe { rooms: subscribe_rooms } => {
            debug!("Client {} subscribing to rooms: {:?}", client_id, subscribe_rooms);
            
            let mut rooms_lock = rooms.write().await;
            for room_name in subscribe_rooms {
                let room_clients = rooms_lock.entry(room_name.clone()).or_insert_with(HashMap::new);
                room_clients.insert(client_id.to_string(), SignalingClient {
                    id: client_id.to_string(),
                    sender: sender.clone(),
                });
                
                let clients: Vec<String> = room_clients.keys().filter(|&c| c != client_id).cloned().collect();
                if !clients.is_empty() {
                    let sync_msg = SignalingMessage::Sync {
                        room: room_name,
                        clients,
                    };
                    if let Ok(json) = serde_json::to_string(&sync_msg) {
                        let _ = sender.send(json);
                    }
                }
            }
        }
        SignalingMessage::Unsubscribe { rooms: unsubscribe_rooms } => {
            debug!("Client {} unsubscribing from rooms: {:?}", client_id, unsubscribe_rooms);
            
            let mut rooms_lock = rooms.write().await;
            for room_name in unsubscribe_rooms {
                if let Some(room_clients) = rooms_lock.get_mut(&room_name) {
                    room_clients.remove(client_id);
                    if room_clients.is_empty() {
                        rooms_lock.remove(&room_name);
                    } else {
                        let disconnect_msg = SignalingMessage::Disconnect {
                            room: room_name,
                            clients: vec![client_id.to_string()],
                        };
                        let msg_json = serde_json::to_string(&disconnect_msg).unwrap();
                        for client in room_clients.values_mut() {
                            let _ = client.sender.send(msg_json.clone());
                        }
                    }
                }
            }
        }
        SignalingMessage::Offer { to, from, sdp } => {
            debug!("Forwarding offer from {} to {}", from, to);
            let to_clone = to.clone();
            forward_message(rooms, room, client_id, &to_clone, SignalingMessage::Offer { to, from, sdp }).await;
        }
        SignalingMessage::Answer { to, from, sdp } => {
            debug!("Forwarding answer from {} to {}", from, to);
            let to_clone = to.clone();
            forward_message(rooms, room, client_id, &to_clone, SignalingMessage::Answer { to, from, sdp }).await;
        }
        SignalingMessage::Ice { to, from, candidate } => {
            debug!("Forwarding ICE from {} to {}", from, to);
            let to_clone = to.clone();
            forward_message(rooms, room, client_id, &to_clone, SignalingMessage::Ice { to, from, candidate }).await;
        }
        _ => {}
    }
}

async fn forward_message(
    rooms: &SignalingRooms,
    room: &str,
    _from: &str,
    to: &str,
    msg: SignalingMessage,
) {
    let rooms_lock = rooms.read().await;
    if let Some(room_clients) = rooms_lock.get(room) {
        if let Some(target_client) = room_clients.get(to) {
            if let Ok(json) = serde_json::to_string(&msg) {
                let _ = target_client.sender.send(json);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signaling_state_new() {
        let state = SignalingState::new();
        assert!(state.rooms.try_read().is_ok());
    }

    #[test]
    fn test_signaling_state_default() {
        let state = SignalingState::default();
        assert!(state.rooms.try_read().is_ok());
    }

    #[test]
    fn test_signaling_state_clone() {
        let state = SignalingState::new();
        let cloned = state.clone();
        assert!(cloned.rooms.try_read().is_ok());
    }

    #[tokio::test]
    async fn test_rooms_handle_subscribe() {
        let rooms: SignalingRooms = Arc::new(RwLock::new(HashMap::new()));
        
        {
            let mut rooms_lock = rooms.write().await;
            let room_clients = rooms_lock.entry("test-room".to_string()).or_insert_with(HashMap::new);
            room_clients.insert("client-1".to_string(), SignalingClient {
                id: "client-1".to_string(),
                sender: tokio::sync::broadcast::channel(10).0,
            });
        }

        let rooms_lock = rooms.read().await;
        let room_clients = rooms_lock.get("test-room").unwrap();
        assert_eq!(room_clients.len(), 1);
        assert!(room_clients.contains_key("client-1"));
    }

    #[test]
    fn test_signaling_message_serialize_subscribe() {
        let msg = SignalingMessage::Subscribe {
            rooms: vec!["room1".to_string(), "room2".to_string()],
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"subscribe\""));
        assert!(json.contains("room1"));
        assert!(json.contains("room2"));
    }

    #[test]
    fn test_signaling_message_serialize_offer() {
        let msg = SignalingMessage::Offer {
            to: "client-b".to_string(),
            from: "client-a".to_string(),
            sdp: "sdp-content".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"offer\""));
        assert!(json.contains("client-b"));
        assert!(json.contains("client-a"));
    }

    #[test]
    fn test_signaling_message_serialize_ice() {
        let msg = SignalingMessage::Ice {
            to: "client-b".to_string(),
            from: "client-a".to_string(),
            candidate: "candidate-content".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"ice\""));
        assert!(json.contains("candidate-content"));
    }

    #[test]
    fn test_signaling_message_deserialize_offer() {
        let json = r#"{"type":"offer","to":"client-b","from":"client-a","sdp":"sdp-data"}"#;
        let msg: SignalingMessage = serde_json::from_str(json).unwrap();
        match msg {
            SignalingMessage::Offer { to, from, sdp } => {
                assert_eq!(to, "client-b");
                assert_eq!(from, "client-a");
                assert_eq!(sdp, "sdp-data");
            }
            _ => panic!("Expected Offer message"),
        }
    }

    #[test]
    fn test_signaling_query_deserialize() {
        let json = r#"{"room":"my-room"}"#;
        let query: SignalingQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.room, Some("my-room".to_string()));
    }

    #[test]
    fn test_signaling_query_deserialize_none() {
        let json = r#"{}"#;
        let query: SignalingQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.room, None);
    }
}
