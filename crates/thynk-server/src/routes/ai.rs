use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Debug, Deserialize)]
pub struct ModelsRequest {
    pub provider: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelsResponse {
    pub models: Vec<ModelInfo>,
}

pub async fn models(
    State(_state): State<AppState>,
    Json(req): Json<ModelsRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<AiError>)> {
    let client = Client::new();

    let models = match req.provider.as_str() {
        "openai" => {
            if req.api_key.is_empty() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(AiError {
                        message: "API key required for OpenAI".to_string(),
                    }),
                ));
            }
            let res = client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", req.api_key))
                .header("Content-Type", "application/json")
                .send()
                .await
                .map_err(|e| {
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(AiError {
                            message: format!("Failed to fetch OpenAI models: {}", e),
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

            let chat_models = [
                "gpt-4o",
                "gpt-4o-mini",
                "gpt-4-turbo",
                "gpt-4",
                "gpt-3.5-turbo",
            ];
            let data = json["data"].as_array();
            let mut models: Vec<ModelInfo> = data
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| {
                            let id = m["id"].as_str()?.to_string();
                            let owned_by = m["owned_by"].as_str().unwrap_or("");
                            if !chat_models.contains(&id.as_str())
                                && !id.starts_with("gpt-")
                                && !id.starts_with("o1-")
                                && !id.starts_with("o3-")
                                && owned_by != "system"
                            {
                                return None;
                            }
                            let name = id
                                .replace("o1-", "o1 ")
                                .replace("o3-", "o3 ")
                                .replace("gpt-4o", "GPT-4o")
                                .replace("gpt-4o-mini", "GPT-4o Mini")
                                .replace("gpt-4-turbo", "GPT-4 Turbo")
                                .replace("gpt-4", "GPT-4")
                                .replace("gpt-3.5-turbo", "GPT-3.5 Turbo")
                                .replace("-", " ");
                            Some(ModelInfo { id, name })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if models.is_empty() {
                models = default_models().get("openai").cloned().unwrap_or_default();
            }
            models
        }
        "anthropic" => default_models()
            .get("anthropic")
            .cloned()
            .unwrap_or_default(),
        "ollama" => {
            let url = if req.api_key.is_empty() {
                "http://localhost:11434/api/tags"
            } else {
                &req.api_key
            };
            let url = if url.ends_with("/api/chat") || url.ends_with("/api/generate") {
                url.trim_end_matches("/api/chat")
                    .trim_end_matches("/api/generate")
            } else {
                url
            };
            let list_url = format!("{}/api/tags", url);

            let res = client
                .get(&list_url)
                .header("Content-Type", "application/json")
                .send()
                .await;

            match res {
                Ok(resp) => {
                    let json: serde_json::Value = resp.json().await.unwrap_or_default();
                    let models: Vec<ModelInfo> = json["models"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|m| {
                                    let name = m["name"].as_str()?.to_string();
                                    Some(ModelInfo {
                                        id: name.clone(),
                                        name: name
                                            .replace(":", " ")
                                            .replace("/", " ")
                                            .split_whitespace()
                                            .collect::<Vec<_>>()
                                            .join(" "),
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if models.is_empty() {
                        default_models().get("ollama").cloned().unwrap_or_default()
                    } else {
                        models
                    }
                }
                Err(_) => default_models().get("ollama").cloned().unwrap_or_default(),
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

    Ok(Json(ModelsResponse { models }))
}

fn default_models() -> HashMap<String, Vec<ModelInfo>> {
    let mut m = HashMap::new();
    m.insert(
        "openai".to_string(),
        vec![
            ModelInfo {
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
            },
            ModelInfo {
                id: "gpt-4o-mini".to_string(),
                name: "GPT-4o Mini".to_string(),
            },
            ModelInfo {
                id: "gpt-4-turbo".to_string(),
                name: "GPT-4 Turbo".to_string(),
            },
            ModelInfo {
                id: "o1-preview".to_string(),
                name: "o1 Preview".to_string(),
            },
            ModelInfo {
                id: "o1-mini".to_string(),
                name: "o1 Mini".to_string(),
            },
        ],
    );
    m.insert(
        "anthropic".to_string(),
        vec![
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
            },
            ModelInfo {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
            },
            ModelInfo {
                id: "claude-3-haiku-20240307".to_string(),
                name: "Claude 3 Haiku".to_string(),
            },
        ],
    );
    m.insert(
        "ollama".to_string(),
        vec![
            ModelInfo {
                id: "llama3.2".to_string(),
                name: "Llama 3.2".to_string(),
            },
            ModelInfo {
                id: "mistral".to_string(),
                name: "Mistral".to_string(),
            },
            ModelInfo {
                id: "codellama".to_string(),
                name: "CodeLlama".to_string(),
            },
            ModelInfo {
                id: "qwen2.5".to_string(),
                name: "Qwen 2.5".to_string(),
            },
        ],
    );
    m
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_models_request_openai_deserialize() {
        let json = r#"{"provider":"openai","api_key":"sk-test"}"#;
        let req: ModelsRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.provider, "openai");
        assert_eq!(req.api_key, "sk-test");
    }

    #[test]
    fn test_models_request_anthropic_deserialize() {
        let json = r#"{"provider":"anthropic","api_key":"sk-ant-test"}"#;
        let req: ModelsRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.provider, "anthropic");
    }

    #[test]
    fn test_models_request_ollama_deserialize() {
        let json = r#"{"provider":"ollama","api_key":""}"#;
        let req: ModelsRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.provider, "ollama");
        assert!(req.api_key.is_empty());
    }

    #[test]
    fn test_models_response_serialize() {
        let resp = ModelsResponse {
            models: vec![
                ModelInfo {
                    id: "gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                },
                ModelInfo {
                    id: "gpt-4o-mini".to_string(),
                    name: "GPT-4o Mini".to_string(),
                },
            ],
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("gpt-4o"));
        assert!(json.contains("GPT-4o"));
    }

    #[test]
    fn test_models_response_empty() {
        let resp = ModelsResponse { models: vec![] };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"models\":[]"));
    }

    #[test]
    fn test_default_models_contains_all_providers() {
        let defaults = default_models();
        assert!(defaults.contains_key("openai"));
        assert!(defaults.contains_key("anthropic"));
        assert!(defaults.contains_key("ollama"));
    }

    #[test]
    fn test_default_models_openai_has_gpt4o() {
        let defaults = default_models();
        let openai = defaults.get("openai").unwrap();
        assert!(openai.iter().any(|m| m.id == "gpt-4o"));
        assert!(openai.iter().any(|m| m.id == "gpt-4o-mini"));
    }

    #[test]
    fn test_default_models_anthropic_has_claude() {
        let defaults = default_models();
        let anthropic = defaults.get("anthropic").unwrap();
        assert!(anthropic.iter().any(|m| m.id.contains("claude")));
    }

    #[test]
    fn test_default_models_ollama_has_common_models() {
        let defaults = default_models();
        let ollama = defaults.get("ollama").unwrap();
        assert!(ollama.iter().any(|m| m.id == "llama3.2"));
        assert!(ollama.iter().any(|m| m.id == "mistral"));
    }
}
