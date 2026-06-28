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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileAttachmentSummary {
    pub id: i64,
    pub file_object_id: i64,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub created_by_display_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateFileObjectInput {
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub created_by_user_id: i64,
}

#[derive(Debug, Clone)]
pub struct CreateAttachmentInput {
    pub target_type: String,
    pub target_id: i64,
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

pub async fn create_attachment(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateAttachmentInput,
) -> AppResult<FileAttachmentSummary> {
    let target_type = validate_target_type(&input.target_type)?;
    if input.target_id <= 0 {
        return Err(AppError::BadRequest("附件目标无效".to_string()));
    }
    let original_filename = validate_filename(&input.original_filename)?;
    let content_type = validate_content_type(&input.content_type)?;
    if input.byte_size < 0 {
        return Err(AppError::BadRequest("文件大小不能小于 0".to_string()));
    }
    let object_key = generate_object_key(&original_filename);

    let mut tx = pool.begin().await?;
    let file_object_id = sqlx::query_scalar::<_, i64>(
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
    .fetch_one(&mut *tx)
    .await?;

    let attachment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_attachments (
            file_object_id,
            target_type,
            target_id,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4)
        RETURNING id
        "#,
    )
    .bind(file_object_id)
    .bind(target_type)
    .bind(input.target_id)
    .bind(input.created_by_user_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    get_attachment(pool, attachment_id).await
}

pub async fn list_attachments(
    pool: &SqlitePool,
    target_type: &str,
    target_id: i64,
) -> AppResult<Vec<FileAttachmentSummary>> {
    let target_type = validate_target_type(target_type)?;
    if target_id <= 0 {
        return Err(AppError::BadRequest("附件目标无效".to_string()));
    }

    let rows = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(u.display_name, '') AS created_by_display_name,
            fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        LEFT JOIN users u ON u.id = fa.created_by_user_id
        WHERE fa.target_type = ?1
          AND fa.target_id = ?2
        ORDER BY fa.created_at DESC, fa.id DESC
        "#,
    )
    .bind(target_type)
    .bind(target_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(attachment_from_row).collect())
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

async fn get_attachment(pool: &SqlitePool, id: i64) -> AppResult<FileAttachmentSummary> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(u.display_name, '') AS created_by_display_name,
            fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        LEFT JOIN users u ON u.id = fa.created_by_user_id
        WHERE fa.id = ?1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(attachment_from_row(row))
}

fn attachment_from_row(
    row: (
        i64,
        i64,
        String,
        String,
        String,
        i64,
        String,
        String,
        String,
    ),
) -> FileAttachmentSummary {
    let (
        id,
        file_object_id,
        object_key,
        original_filename,
        content_type,
        byte_size,
        status,
        created_by_display_name,
        created_at,
    ) = row;

    FileAttachmentSummary {
        id,
        file_object_id,
        object_key,
        original_filename,
        content_type,
        byte_size,
        status,
        created_by_display_name,
        created_at,
    }
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

fn validate_target_type(target_type: &str) -> AppResult<&'static str> {
    match target_type.trim() {
        "project" => Ok("project"),
        "work_item" => Ok("work_item"),
        "comment" => Ok("comment"),
        _ => Err(AppError::BadRequest(
            "附件目标类型只能是 project / work_item / comment".to_string(),
        )),
    }
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
