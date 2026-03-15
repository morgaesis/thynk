use axum::body::Body;
use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::Utc;
use serde::Serialize;
use std::path::PathBuf;
use uuid::Uuid;

use crate::state::AppState;

const MAX_FILE_SIZE: i64 = 10 * 1024 * 1024; // 10 MB
const MAX_STORAGE_PER_USER: i64 = 100 * 1024 * 1024; // 100 MB

// ── Error helpers ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

fn err(status: StatusCode, error: &str, message: &str) -> impl IntoResponse {
    (
        status,
        Json(ErrorResponse {
            error: error.to_string(),
            message: message.to_string(),
        }),
    )
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct UploadResponse {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub size: i64,
    pub content_type: String,
}

// ── Sanitize filename ─────────────────────────────────────────────────────────

/// Strip path components and control characters from a filename.
fn sanitize_filename(filename: &str) -> String {
    // Take only the last component (strip any directory traversal)
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != '\0')
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "upload".to_string()
    } else {
        cleaned
    }
}

// ── POST /api/uploads ────────────────────────────────────────────────────────

pub async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // Read the `file` field from multipart.
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name = "upload".to_string();
    let mut content_type = "application/octet-stream".to_string();

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            // Capture filename and content type from the field headers.
            if let Some(fname) = field.file_name() {
                file_name = sanitize_filename(fname);
            }
            if let Some(ct) = field.content_type() {
                content_type = ct.to_string();
            }
            match field.bytes().await {
                Ok(bytes) => {
                    file_bytes = Some(bytes.to_vec());
                }
                Err(e) => {
                    return err(
                        StatusCode::BAD_REQUEST,
                        "read_error",
                        &format!("Failed to read file field: {e}"),
                    )
                    .into_response();
                }
            }
            break;
        }
    }

    let bytes = match file_bytes {
        Some(b) => b,
        None => {
            return err(
                StatusCode::BAD_REQUEST,
                "missing_field",
                "Multipart field 'file' is required",
            )
            .into_response();
        }
    };

    let file_size = bytes.len() as i64;

    // Validate file size.
    if file_size > MAX_FILE_SIZE {
        return err(
            StatusCode::PAYLOAD_TOO_LARGE,
            "file_too_large",
            "File exceeds the 10 MB limit",
        )
        .into_response();
    }

    // Check user storage quota.
    let user_id = "anonymous";
    let storage_used = {
        let db = state.db.lock().await;
        match db.get_user_storage_used(user_id) {
            Ok(used) => used,
            Err(e) => {
                return err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "db_error",
                    &e.to_string(),
                )
                .into_response();
            }
        }
    };

    if storage_used + file_size > MAX_STORAGE_PER_USER {
        return err(
            StatusCode::PAYLOAD_TOO_LARGE,
            "storage_limit_exceeded",
            "Storage limit of 100 MB exceeded",
        )
        .into_response();
    }

    // Generate upload ID.
    let upload_id = Uuid::new_v4().to_string();
    // s3_key stores the relative path (works for both S3 and local).
    let s3_key = format!("{user_id}/{upload_id}-{file_name}");

    if let Some(bucket) = &state.s3_bucket {
        // S3 mode: upload to S3.
        let bucket = bucket.clone();
        match bucket.put_object(&s3_key, &bytes).await {
            Ok(response) => {
                let code = response.status_code();
                if !(200..300).contains(&code) {
                    return err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "s3_error",
                        &format!("S3 returned status {code}"),
                    )
                    .into_response();
                }
            }
            Err(e) => {
                return err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "s3_error",
                    &format!("Failed to upload to S3: {e}"),
                )
                .into_response();
            }
        }
    } else {
        // Local mode: store file on disk.
        let uploads_dir = state.config.data_dir.join(".uploads").join(user_id);
        if let Err(e) = tokio::fs::create_dir_all(&uploads_dir).await {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                &format!("Failed to create uploads directory: {e}"),
            )
            .into_response();
        }
        let file_path = uploads_dir.join(format!("{upload_id}-{file_name}"));
        if let Err(e) = tokio::fs::write(&file_path, &bytes).await {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                &format!("Failed to write file: {e}"),
            )
            .into_response();
        }
    }

    // Save to DB.
    let created_at = Utc::now().to_rfc3339();
    {
        let db = state.db.lock().await;
        if let Err(e) = db.create_upload(
            &upload_id,
            user_id,
            &s3_key,
            &file_name,
            &content_type,
            file_size,
            &created_at,
        ) {
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "db_error",
                &e.to_string(),
            )
            .into_response();
        }
    }

    (
        StatusCode::CREATED,
        Json(UploadResponse {
            id: upload_id.clone(),
            url: format!("/api/uploads/{upload_id}"),
            filename: file_name,
            size: file_size,
            content_type,
        }),
    )
        .into_response()
}

// ── GET /api/uploads/:id ─────────────────────────────────────────────────────

pub async fn get_upload(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    // Look up in DB.
    let record = {
        let db = state.db.lock().await;
        match db.get_upload(&id) {
            Ok(Some(r)) => r,
            Ok(None) => {
                return err(StatusCode::NOT_FOUND, "not_found", "upload not found").into_response();
            }
            Err(e) => {
                return err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "db_error",
                    &e.to_string(),
                )
                .into_response();
            }
        }
    };

    if let Some(bucket) = &state.s3_bucket {
        // S3 mode: generate presigned URL and redirect.
        let bucket = bucket.clone();
        let expiry = 3600u32;
        let presigned_url = match bucket.presign_get(&record.s3_key, expiry, None).await {
            Ok(url) => url,
            Err(e) => {
                return err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "s3_error",
                    &format!("Failed to generate presigned URL: {e}"),
                )
                .into_response();
            }
        };
        (StatusCode::FOUND, [("Location", presigned_url.as_str())]).into_response()
    } else {
        // Local mode: read file from disk and return bytes.
        let file_path: PathBuf = state.config.data_dir.join(".uploads").join(&record.s3_key);
        match tokio::fs::read(&file_path).await {
            Ok(data) => Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", &record.content_type)
                .header(
                    "Content-Disposition",
                    format!("inline; filename=\"{}\"", record.filename),
                )
                .body(Body::from(data))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()),
            Err(e) => err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "storage_error",
                &format!("Failed to read file: {e}"),
            )
            .into_response(),
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename_basic() {
        assert_eq!(sanitize_filename("photo.jpg"), "photo.jpg");
    }

    #[test]
    fn test_sanitize_filename_strips_path() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
    }

    #[test]
    fn test_sanitize_filename_strips_backslash_path() {
        assert_eq!(sanitize_filename("C:\\Users\\file.txt"), "file.txt");
    }

    #[test]
    fn test_sanitize_filename_strips_control_chars() {
        assert_eq!(sanitize_filename("bad\x00name.jpg"), "badname.jpg");
    }

    #[test]
    fn test_sanitize_filename_empty_becomes_upload() {
        assert_eq!(sanitize_filename(""), "upload");
    }

    #[test]
    fn test_sanitize_filename_unicode_preserved() {
        assert_eq!(sanitize_filename("résumé.pdf"), "résumé.pdf");
    }
}
