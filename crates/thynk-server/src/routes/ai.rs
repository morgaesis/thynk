use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CompleteRequest {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct CompleteResponse {
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub message: ChatMessage,
}

#[derive(Debug, Serialize)]
pub struct AiError {
    pub message: String,
}

pub async fn complete(
    State(_state): State<AppState>,
    Json(req): Json<CompleteRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<AiError>)> {
    let client = Client::new();
    let max_tokens = req.max_tokens.unwrap_or(256);
    let temperature = req.temperature.unwrap_or(0.7);

    let response_text = match req.provider.as_str() {
        "openai" => {
            let body = serde_json::json!({
                "model": req.model,
                "prompt": req.prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
            });

            let res = client
                .post("https://api.openai.com/v1/completions")
                .header("Authorization", format!("Bearer {}", req.api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to call OpenAI: {}", e),
                        }),
                    )
                })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid OpenAI response: {}", e),
                    }),
                )
            })?;

            json["choices"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string()
        }
        "anthropic" => {
            let body = serde_json::json!({
                "model": req.model,
                "prompt": req.prompt,
                "max_tokens_to_sample": max_tokens,
                "temperature": temperature,
            });

            let res = client
                .post("https://api.anthropic.com/v1/complete")
                .header("x-api-key", &req.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to call Anthropic: {}", e),
                        }),
                    )
                })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid Anthropic response: {}", e),
                    }),
                )
            })?;

            json["completion"].as_str().unwrap_or("").to_string()
        }
        "ollama" => {
            let body = serde_json::json!({
                "model": req.model,
                "prompt": req.prompt,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
                "stream": false,
            });

            let ollama_url = if req.api_key.is_empty() {
                "http://localhost:11434/api/generate"
            } else {
                &req.api_key
            };

            let res = client
                .post(ollama_url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to call Ollama: {}", e),
                        }),
                    )
                })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid Ollama response: {}", e),
                    }),
                )
            })?;

            json["response"].as_str().unwrap_or("").to_string()
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(AiError {
                    message: format!("Unknown provider: {}", req.provider),
                }),
            ))
        }
    };

    Ok(Json(CompleteResponse {
        text: response_text,
    }))
}

pub async fn chat(
    State(_state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<AiError>)> {
    let client = Client::new();
    let max_tokens = req.max_tokens.unwrap_or(1024);
    let temperature = req.temperature.unwrap_or(0.7);

    let response_message = match req.provider.as_str() {
        "openai" => {
            let body = serde_json::json!({
                "model": req.model,
                "messages": req.messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            });

            let res = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", req.api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to call OpenAI: {}", e),
                        }),
                    )
                })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid OpenAI response: {}", e),
                    }),
                )
            })?;

            let content = json["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();

            ChatMessage {
                role: "assistant".to_string(),
                content,
            }
        }
        "anthropic" => {
            let system_msg = req
                .messages
                .iter()
                .find(|m| m.role == "system")
                .map(|m| m.content.clone());

            let messages: Vec<_> = req.messages.iter().filter(|m| m.role != "system").collect();

            let body = serde_json::json!({
                "model": req.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            });

            let mut req_builder = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &req.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json");

            if let Some(system) = system_msg {
                req_builder = req_builder.header("x-system-prompts", system);
            }

            let res = req_builder.json(&body).send().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Failed to call Anthropic: {}", e),
                    }),
                )
            })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid Anthropic response: {}", e),
                    }),
                )
            })?;

            let content = json["content"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string();

            ChatMessage {
                role: "assistant".to_string(),
                content,
            }
        }
        "ollama" => {
            let _last_user_msg = req
                .messages
                .iter()
                .rev()
                .find(|m| m.role == "user")
                .map(|m| m.content.clone())
                .unwrap_or_default();

            let body = serde_json::json!({
                "model": req.model,
                "messages": req.messages,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
                "stream": false,
            });

            let ollama_url = if req.api_key.is_empty() {
                "http://localhost:11434/api/chat"
            } else {
                &req.api_key
            };

            let res = client
                .post(ollama_url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to call Ollama: {}", e),
                        }),
                    )
                })?;

            let json: serde_json::Value = res.json().await.map_err(|e| {
                (
                    StatusCode::BAD_GATEWAY,
                    Json(AiError {
                        message: format!("Invalid Ollama response: {}", e),
                    }),
                )
            })?;

            let content = json["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();

            ChatMessage {
                role: "assistant".to_string(),
                content,
            }
        }
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(AiError {
                    message: format!("Unknown provider: {}", req.provider),
                }),
            ))
        }
    };

    Ok(Json(ChatResponse {
        message: response_message,
    }))
}
