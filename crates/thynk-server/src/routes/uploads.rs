use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use serde::Serialize;
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
    // Check S3 is configured.
    let bucket = match &state.s3_bucket {
        Some(b) => b.clone(),
        None => {
            return err(
                StatusCode::SERVICE_UNAVAILABLE,
                "storage_not_configured",
                "S3 storage is not configured",
            )
            .into_response();
        }
    };

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

    // Generate upload ID and S3 key.
    let upload_id = Uuid::new_v4().to_string();
    let s3_key = format!("{user_id}/{upload_id}-{file_name}");

    // Upload to S3.
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

pub async fn get_upload(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // Check S3 is configured.
    let bucket = match &state.s3_bucket {
        Some(b) => b.clone(),
        None => {
            return err(
                StatusCode::SERVICE_UNAVAILABLE,
                "storage_not_configured",
                "S3 storage is not configured",
            )
            .into_response();
        }
    };

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

    // Generate presigned URL.
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

    // Redirect to presigned URL.
    (StatusCode::FOUND, [("Location", presigned_url.as_str())]).into_response()
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
