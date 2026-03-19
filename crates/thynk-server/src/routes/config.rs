use axum::extract::State;
use axum::response::Json;
use serde::Serialize;
use std::env;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct IceServer {
    #[serde(rename = "urls")]
    pub urls: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerConfig {
    pub ice_servers: Vec<IceServer>,
}

pub async fn get_config(State(_state): State<AppState>) -> Json<ServerConfig> {
    let stun_url = env::var("THYNK_STUN_URL").ok().filter(|s| !s.is_empty());
    let turn_url = env::var("THYNK_TURN_URL").ok().filter(|s| !s.is_empty());
    let turn_username = env::var("THYNK_TURN_USERNAME")
        .ok()
        .filter(|s| !s.is_empty());
    let turn_credential = env::var("THYNK_TURN_CREDENTIAL")
        .ok()
        .filter(|s| !s.is_empty());

    let mut ice_servers = Vec::new();

    if let Some(url) = stun_url {
        ice_servers.push(IceServer {
            urls: url,
            username: None,
            credential: None,
        });
    }

    if let Some(url) = turn_url {
        ice_servers.push(IceServer {
            urls: url,
            username: turn_username,
            credential: turn_credential,
        });
    }

    if ice_servers.is_empty() {
        ice_servers.push(IceServer {
            urls: "stun:stun.l.google.com:19302".to_string(),
            username: None,
            credential: None,
        });
    }

    Json(ServerConfig { ice_servers })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ice_server_serialize() {
        let server = IceServer {
            urls: "stun:stun.example.com:3478".to_string(),
            username: Some("user".to_string()),
            credential: Some("pass".to_string()),
        };
        let json = serde_json::to_string(&server).unwrap();
        assert!(json.contains("\"urls\":\"stun:stun.example.com:3478\""));
        assert!(json.contains("\"username\":\"user\""));
        assert!(json.contains("\"credential\":\"pass\""));
    }

    #[test]
    fn test_ice_server_no_auth() {
        let server = IceServer {
            urls: "stun:stun.example.com:3478".to_string(),
            username: None,
            credential: None,
        };
        let json = serde_json::to_string(&server).unwrap();
        assert!(!json.contains("username"));
        assert!(!json.contains("credential"));
    }

    #[test]
    fn test_server_config_serialize() {
        let config = ServerConfig {
            ice_servers: vec![
                IceServer {
                    urls: "stun:stun.example.com:3478".to_string(),
                    username: None,
                    credential: None,
                },
                IceServer {
                    urls: "turn:turn.example.com:3478".to_string(),
                    username: Some("thynk".to_string()),
                    credential: Some("secret".to_string()),
                },
            ],
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("stun:stun.example.com:3478"));
        assert!(json.contains("turn:turn.example.com:3478"));
    }
}
