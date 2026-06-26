use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    domains::storage::StorageConfig,
    platform::error::{AppError, AppResult},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileObject {
    pub id: i64,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateFileObjectInput {
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub created_by_user_id: i64,
}

pub async fn create_file_object(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateFileObjectInput,
) -> AppResult<FileObject> {
    let original_filename = validate_filename(&input.original_filename)?;
    let content_type = validate_content_type(&input.content_type)?;
    if input.byte_size < 0 {
        return Err(AppError::BadRequest("文件大小不能小于 0".to_string()));
    }

    let object_key = generate_object_key(&original_filename);
    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_objects (
            storage_config_id,
            provider,
            bucket,
            object_key,
            original_filename,
            content_type,
            byte_size,
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)
        RETURNING id
        "#,
    )
    .bind(storage_config.id)
    .bind(&storage_config.provider)
    .bind(&storage_config.bucket)
    .bind(&object_key)
    .bind(&original_filename)
    .bind(&content_type)
    .bind(input.byte_size)
    .bind(input.created_by_user_id)
    .fetch_one(pool)
    .await?;

    get_file_object(pool, id).await
}

pub async fn get_file_object(pool: &SqlitePool, id: i64) -> AppResult<FileObject> {
    let row = sqlx::query_as::<_, (i64, String, String, String, i64, String, String)>(
        r#"
        SELECT
            id,
            object_key,
            original_filename,
            content_type,
            byte_size,
            status,
            created_at
        FROM file_objects
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    let (id, object_key, original_filename, content_type, byte_size, status, created_at) = row;
    Ok(FileObject {
        id,
        object_key,
        original_filename,
        content_type,
        byte_size,
        status,
        created_at,
    })
}

pub fn generate_object_key(original_filename: &str) -> String {
    let extension = original_filename
        .rsplit_once('.')
        .and_then(|(_, ext)| {
            let ext = ext.trim();
            (!ext.is_empty()
                && ext.len() <= 16
                && ext.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
            .then(|| format!(".{}", ext.to_ascii_lowercase()))
        })
        .unwrap_or_default();

    format!("uploads/{}/{}{}", "pending", Uuid::new_v4(), extension)
}

fn validate_filename(filename: &str) -> AppResult<String> {
    let filename = filename.trim();
    if filename.is_empty()
        || filename.len() > 255
        || filename.contains('/')
        || filename.contains('\\')
    {
        return Err(AppError::BadRequest("文件名无效".to_string()));
    }
    Ok(filename.to_string())
}

fn validate_content_type(content_type: &str) -> AppResult<String> {
    let content_type = content_type.trim();
    if content_type.is_empty()
        || content_type.len() > 128
        || content_type.contains('\n')
        || content_type.contains('\r')
    {
        return Err(AppError::BadRequest("Content-Type 无效".to_string()));
    }
    Ok(content_type.to_string())
}
