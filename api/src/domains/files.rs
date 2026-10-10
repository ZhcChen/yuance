use quick_xml::{Reader, events::Event};
use sqlx::{Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::{
    domains::storage::{self, StorageConfig},
    platform::{
        config::Settings,
        error::{AppError, AppResult},
        file_crypto,
    },
};

pub const MAX_ATTACHMENT_BYTE_SIZE: i64 = 1024 * 1024 * 1024;
const MAX_SVG_XML_BYTE_SIZE: usize = 16 * 1024 * 1024;
const MAX_SVG_XML_DEPTH: usize = 64;
const ALLOWED_CONTENT_TYPE_PREFIXES: &[&str] = &["image/", "text/", "video/"];
const ALLOWED_CONTENT_TYPES: &[&str] = &[
    "application/gzip",
    "application/json",
    "application/msword",
    "application/octet-stream",
    "application/pdf",
    "application/vnd.android.package-archive",
    "application/vnd.debian.binary-package",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/x-apple-diskimage",
    "application/x-7z-compressed",
    "application/x-gzip",
    "application/x-itunes-ipa",
    "application/x-msdownload",
    "application/x-rpm",
    "application/x-tar",
    "application/zip",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileObject {
    pub id: i64,
    pub folder_id: Option<i64>,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileFolder {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub project_id: i64,
    pub name: String,
    pub description: String,
    pub status: String,
    pub created_by_display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderTreeItem {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub description: String,
    pub children: Vec<FolderTreeItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderContentSummary {
    pub folder_id: Option<i64>,
    pub folder_name: Option<String>,
    pub folders: Vec<FileFolder>,
    pub files: Vec<FileAttachmentSummary>,
}

#[derive(Debug, Clone)]
pub struct CreateFolderInput {
    pub parent_id: Option<i64>,
    pub project_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_by_user_id: i64,
    pub created_by_display_name_snapshot: String,
}

#[derive(Debug, Clone)]
pub struct UpdateFolderInput {
    pub name: Option<String>,
    pub description: Option<String>,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileObjectEncryption {
    pub file_object_id: i64,
    pub encryption_status: String,
    pub encryption_format: String,
    pub encrypted_byte_size: i64,
    pub encrypted_checksum_sha256: String,
    pub data_key_envelope: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectFileAttachment {
    pub project_id: i64,
    pub attachment: FileAttachmentSummary,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingFileCleanupSummary {
    pub matched_count: i64,
    pub deleted_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeletedFileCleanupSummary {
    pub due_count: i64,
    pub not_due_count: i64,
    pub processed_count: i64,
    pub completed_count: i64,
    pub failed_count: i64,
    pub lease_lost_count: i64,
    pub pending_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct FileObjectDeletionJobDiagnostic {
    pub id: i64,
    pub file_object_id: i64,
    pub status: String,
    pub attempt_count: i64,
    pub next_attempt_at: String,
    pub last_error: String,
}

#[derive(Debug, Clone)]
struct FileObjectDeletionJob {
    id: i64,
    storage_config_id: Option<i64>,
    provider: String,
    endpoint: String,
    region: String,
    bucket: String,
    object_key: String,
    lease_token: String,
    attempt_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileObjectAuditSummary {
    pub total_count: i64,
    pub attached_count: i64,
    pub orphan_count: i64,
    pub pending_orphan_count: i64,
    pub uploaded_orphan_count: i64,
    pub deleted_orphan_count: i64,
    pub include_deleted: bool,
}

pub async fn extend_file_object_upload_url_expiration(
    pool: &SqlitePool,
    file_object_id: i64,
    expires_at: &str,
) -> AppResult<()> {
    let rows_affected = sqlx::query(
        r#"
        UPDATE file_objects
        SET upload_url_expires_at = CASE
            WHEN upload_url_expires_at < ?1 THEN ?1
            ELSE upload_url_expires_at
        END
        WHERE id = ?2 AND status = 'pending'
        "#,
    )
    .bind(expires_at)
    .bind(file_object_id)
    .execute(pool)
    .await?
    .rows_affected();
    if rows_affected != 1 {
        return Err(AppError::Conflict(
            "附件状态已变化，不能生成上传签名".to_string(),
        ));
    }
    Ok(())
}

pub async fn file_object_has_protecting_references_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    file_object_id: i64,
    excluded_attachment_id: Option<i64>,
) -> AppResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM file_attachments fa
            WHERE fa.file_object_id = ?1
              AND (?2 IS NULL OR fa.id <> ?2)
              AND (
                  (fa.target_type = 'project' AND EXISTS (
                      SELECT 1 FROM projects p WHERE p.id = fa.target_id AND p.status <> 'archived'
                  ))
                  OR (fa.target_type = 'project_resource' AND EXISTS (
                      SELECT 1 FROM project_resources r WHERE r.id = fa.target_id AND r.status <> 'archived'
                  ))
                  OR (fa.target_type = 'work_item' AND EXISTS (
                      SELECT 1 FROM work_items w WHERE w.id = fa.target_id
                  ))
                  OR (fa.target_type = 'comment' AND EXISTS (
                      SELECT 1 FROM work_item_comments c WHERE c.id = fa.target_id AND c.deleted_at IS NULL
                  ))
              )
        ) OR EXISTS (
            SELECT 1 FROM system_release_assets sra WHERE sra.file_object_id = ?1
        )
        "#,
    )
    .bind(file_object_id)
    .bind(excluded_attachment_id)
    .fetch_one(&mut **tx)
    .await?)
}

pub async fn enqueue_deleted_file_object_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    file_object_id: i64,
) -> AppResult<()> {
    let object = sqlx::query_as::<_, (Option<i64>, String, String, String, String)>(
        r#"
        SELECT storage_config_id, provider, bucket, object_key, upload_url_expires_at
        FROM file_objects
        WHERE id = ?1
        "#,
    )
    .bind(file_object_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| AppError::NotFound("文件对象不存在".to_string()))?;

    let Some(storage_config_id) = object.0 else {
        return Err(AppError::Conflict(
            "文件对象未绑定原存储配置，不能安全删除".to_string(),
        ));
    };
    let storage_config = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT provider, endpoint, region, bucket FROM storage_configs WHERE id = ?1",
    )
    .bind(storage_config_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| AppError::Conflict("文件对象的原存储配置不存在，不能安全删除".to_string()))?;
    if storage_config.0 != object.1 || storage_config.3 != object.2 {
        return Err(AppError::Conflict(
            "文件对象与原存储配置不一致，不能安全删除".to_string(),
        ));
    }

    let existing_job = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM file_object_deletion_jobs WHERE file_object_id = ?1)",
    )
    .bind(file_object_id)
    .fetch_one(&mut **tx)
    .await?;
    if existing_job {
        sqlx::query(
            "UPDATE file_objects SET status = 'deleted', updated_at = datetime('now') WHERE id = ?1",
        )
        .bind(file_object_id)
        .execute(&mut **tx)
        .await?;
        return Ok(());
    }

    let minimum_safe_after = chrono::Utc::now().naive_utc() + chrono::Duration::minutes(65);
    let url_safe_after = if object.4.is_empty() {
        minimum_safe_after
    } else {
        let expiry = chrono::NaiveDateTime::parse_from_str(&object.4, "%Y-%m-%d %H:%M:%S")
            .map_err(|_| {
                AppError::Conflict("文件对象上传签名有效期记录无效，不能安全删除".to_string())
            })?;
        std::cmp::max(
            minimum_safe_after,
            expiry + chrono::Duration::hours(4) + chrono::Duration::minutes(5),
        )
    };
    let next_attempt_at = url_safe_after.format("%Y-%m-%d %H:%M:%S").to_string();

    sqlx::query(
        "UPDATE file_objects SET status = 'deleted', updated_at = datetime('now') WHERE id = ?1",
    )
    .bind(file_object_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO file_object_deletion_jobs (
            file_object_id, storage_config_id, provider, endpoint, region, bucket,
            object_key, next_attempt_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(file_object_id) DO NOTHING
        "#,
    )
    .bind(file_object_id)
    .bind(storage_config_id)
    .bind(&storage_config.0)
    .bind(&storage_config.1)
    .bind(&storage_config.2)
    .bind(&storage_config.3)
    .bind(&object.3)
    .bind(next_attempt_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn list_open_file_object_deletion_jobs(
    pool: &SqlitePool,
    limit: i64,
) -> AppResult<Vec<FileObjectDeletionJobDiagnostic>> {
    if !(1..=1000).contains(&limit) {
        return Err(AppError::BadRequest(
            "删除任务诊断 limit 必须在 1 到 1000 之间".to_string(),
        ));
    }
    sqlx::query_as::<_, FileObjectDeletionJobDiagnostic>(
        r#"
        SELECT id, file_object_id, status, attempt_count, next_attempt_at,
               substr(last_error, 1, 500) AS last_error
        FROM file_object_deletion_jobs
        WHERE status <> 'completed'
        ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
                 next_attempt_at, id
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

type AttachmentRow = (
    i64,
    i64,
    String,
    String,
    String,
    i64,
    String,
    String,
    String,
);

#[derive(Debug, Clone)]
pub struct CreateFileObjectInput {
    pub folder_id: Option<i64>,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub created_by_user_id: i64,
}

#[derive(Debug, Clone)]
pub struct CreateAttachmentInput {
    pub target_type: String,
    pub target_id: i64,
    pub project_id: Option<i64>,
    pub folder_id: Option<i64>,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub created_by_user_id: i64,
    pub created_by_display_name_snapshot: String,
    pub activity_summary: Option<String>,
}

pub async fn create_file_object(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateFileObjectInput,
) -> AppResult<FileObject> {
    create_file_object_with_checksum(pool, storage_config, input, "").await
}

pub async fn create_file_object_with_checksum(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateFileObjectInput,
    checksum_sha256: &str,
) -> AppResult<FileObject> {
    let original_filename = validate_filename(&input.original_filename)?;
    let content_type = validate_content_type(&input.content_type)?;
    validate_byte_size(input.byte_size)?;
    let checksum_sha256 = validate_checksum_sha256(checksum_sha256)?;

    let object_key = generate_object_key(&original_filename);
    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_objects (
            folder_id,
            storage_config_id,
            provider,
            bucket,
            object_key,
            original_filename,
            content_type,
            byte_size,
            checksum_sha256,
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10)
        RETURNING id
        "#,
    )
    .bind(input.folder_id)
    .bind(storage_config.id)
    .bind(&storage_config.provider)
    .bind(&storage_config.bucket)
    .bind(&object_key)
    .bind(&original_filename)
    .bind(&content_type)
    .bind(input.byte_size)
    .bind(checksum_sha256)
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
    create_attachment_with_checksum(pool, storage_config, input, "").await
}

pub async fn create_attachment_with_checksum(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateAttachmentInput,
    checksum_sha256: &str,
) -> AppResult<FileAttachmentSummary> {
    create_attachment_inner(pool, storage_config, input, checksum_sha256, None).await
}

pub async fn create_attachment_with_checksum_encrypted(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateAttachmentInput,
    checksum_sha256: &str,
    file_master_key: &str,
) -> AppResult<FileAttachmentSummary> {
    create_attachment_inner(
        pool,
        storage_config,
        input,
        checksum_sha256,
        Some(file_master_key),
    )
    .await
}

async fn create_attachment_inner(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateAttachmentInput,
    checksum_sha256: &str,
    encryption_master_key: Option<&str>,
) -> AppResult<FileAttachmentSummary> {
    let target_type = validate_target_type(&input.target_type)?;
    if input.target_id <= 0 {
        return Err(AppError::BadRequest("附件目标无效".to_string()));
    }
    if let Some(project_id) = input.project_id
        && project_id <= 0
    {
        return Err(AppError::BadRequest("项目动态目标无效".to_string()));
    }
    let original_filename = validate_filename(&input.original_filename)?;
    let content_type = validate_content_type(&input.content_type)?;
    let activity_summary = input
        .activity_summary
        .as_deref()
        .map(validate_activity_summary)
        .transpose()?;
    let created_by_display_name_snapshot =
        normalize_display_name_snapshot(&input.created_by_display_name_snapshot);
    validate_byte_size(input.byte_size)?;
    let checksum_sha256 = validate_checksum_sha256(checksum_sha256)?;
    if let Some(folder_id) = input.folder_id {
        let folder = get_folder(pool, folder_id).await?;
        let Some(project_id) = input.project_id else {
            return Err(AppError::BadRequest("文件夹附件必须关联项目".to_string()));
        };
        if folder.project_id != project_id {
            return Err(AppError::BadRequest("目标文件夹不属于当前项目".to_string()));
        }
    }
    let object_key = generate_object_key(&original_filename);

    let mut tx = pool.begin().await?;
    let (encryption_status, encryption_format) = if encryption_master_key.is_some() {
        ("encrypted", file_crypto::FILE_ENCRYPTION_FORMAT)
    } else {
        ("plain", "")
    };
    let file_object_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_objects (
            folder_id,
            storage_config_id,
            provider,
            bucket,
            object_key,
            original_filename,
            content_type,
            byte_size,
            checksum_sha256,
            encryption_status,
            encryption_format,
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', ?12)
        RETURNING id
        "#,
    )
    .bind(input.folder_id)
    .bind(storage_config.id)
    .bind(&storage_config.provider)
    .bind(&storage_config.bucket)
    .bind(&object_key)
    .bind(&original_filename)
    .bind(&content_type)
    .bind(input.byte_size)
    .bind(checksum_sha256)
    .bind(encryption_status)
    .bind(encryption_format)
    .bind(input.created_by_user_id)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(file_master_key) = encryption_master_key {
        let data_key = file_crypto::generate_data_key();
        let envelope =
            file_crypto::seal_data_key(file_master_key, &data_key, object_key.as_bytes())?;
        sqlx::query(
            r#"
            UPDATE file_objects
            SET data_key_envelope = ?1,
                updated_at = datetime('now')
            WHERE id = ?2
              AND encryption_status = 'encrypted'
            "#,
        )
        .bind(envelope)
        .bind(file_object_id)
        .execute(&mut *tx)
        .await?;
    }

    let attachment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_attachments (
            file_object_id,
            target_type,
            target_id,
            created_by_user_id,
            created_by_display_name_snapshot
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING id
        "#,
    )
    .bind(file_object_id)
    .bind(target_type)
    .bind(input.target_id)
    .bind(input.created_by_user_id)
    .bind(&created_by_display_name_snapshot)
    .fetch_one(&mut *tx)
    .await?;

    if let (Some(project_id), Some(summary)) = (input.project_id, activity_summary.as_deref()) {
        sqlx::query(
            r#"
            INSERT INTO project_activities (
                project_id,
                actor_user_id,
                actor_display_name_snapshot,
                action,
                target_type,
                target_id,
                summary,
                metadata
            )
            VALUES (?1, ?2, ?3, 'file.attached', ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(project_id)
        .bind(input.created_by_user_id)
        .bind(&created_by_display_name_snapshot)
        .bind(target_type)
        .bind(input.target_id.to_string())
        .bind(summary)
        .bind(format!(
            r#"{{"file_object_id":{file_object_id},"filename":"{}"}}"#,
            original_filename.replace('"', "\\\"")
        ))
        .execute(&mut *tx)
        .await?;
    }

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

    let rows = sqlx::query_as::<_, AttachmentRow>(
        r#"
        SELECT
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(NULLIF(fa.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
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
    let row = sqlx::query_as::<
        _,
        (
            i64,
            Option<i64>,
            String,
            String,
            String,
            i64,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            id,
            folder_id,
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

    let (id, folder_id, object_key, original_filename, content_type, byte_size, status, created_at) =
        row;
    Ok(FileObject {
        id,
        folder_id,
        object_key,
        original_filename,
        content_type,
        byte_size,
        status,
        created_at,
    })
}

pub async fn get_attachment(pool: &SqlitePool, id: i64) -> AppResult<FileAttachmentSummary> {
    get_attachment_optional(pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("附件不存在".to_string()))
}

pub async fn get_attachment_optional(
    pool: &SqlitePool,
    id: i64,
) -> AppResult<Option<FileAttachmentSummary>> {
    if id <= 0 {
        return Err(AppError::BadRequest("附件 ID 无效".to_string()));
    }

    let mut query = attachment_query();
    query.push(" WHERE fa.id = ").push_bind(id);
    let row = query
        .build_query_as::<AttachmentRow>()
        .fetch_optional(pool)
        .await?;

    Ok(row.map(attachment_from_row))
}

pub async fn get_attachment_for_target(
    pool: &SqlitePool,
    attachment_id: i64,
    target_type: &str,
    target_id: i64,
) -> AppResult<FileAttachmentSummary> {
    let target_type = validate_target_type(target_type)?;
    if attachment_id <= 0 || target_id <= 0 {
        return Err(AppError::BadRequest("附件目标无效".to_string()));
    }

    let mut query = attachment_query();
    query
        .push(" WHERE fa.id = ")
        .push_bind(attachment_id)
        .push(" AND fa.target_type = ")
        .push_bind(target_type)
        .push(" AND fa.target_id = ")
        .push_bind(target_id);
    let row = query
        .build_query_as::<AttachmentRow>()
        .fetch_optional(pool)
        .await?;

    row.map(attachment_from_row)
        .ok_or_else(|| AppError::NotFound("附件不存在".to_string()))
}

pub async fn get_project_attachment_for_file_object(
    pool: &SqlitePool,
    file_object_id: i64,
) -> AppResult<ProjectFileAttachment> {
    if file_object_id <= 0 {
        return Err(AppError::BadRequest("文件对象 ID 无效".to_string()));
    }

    let row = sqlx::query_as::<
        _,
        (
            i64,
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
            fa.target_id,
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(NULLIF(fa.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
            fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        LEFT JOIN users u ON u.id = fa.created_by_user_id
        WHERE fo.id = ?1
          AND fa.target_type = 'project'
          AND fo.status <> 'deleted'
        ORDER BY fa.id DESC
        LIMIT 1
        "#,
    )
    .bind(file_object_id)
    .fetch_optional(pool)
    .await?;

    let Some((
        project_id,
        id,
        file_object_id,
        object_key,
        original_filename,
        content_type,
        byte_size,
        status,
        created_by_display_name,
        created_at,
    )) = row
    else {
        return Err(AppError::NotFound("项目文件不存在".to_string()));
    };

    Ok(ProjectFileAttachment {
        project_id,
        attachment: FileAttachmentSummary {
            id,
            file_object_id,
            object_key,
            original_filename,
            content_type,
            byte_size,
            status,
            created_by_display_name,
            created_at,
        },
    })
}

pub async fn mark_file_uploaded(pool: &SqlitePool, file_object_id: i64) -> AppResult<FileObject> {
    if file_object_id <= 0 {
        return Err(AppError::BadRequest("文件对象 ID 无效".to_string()));
    }

    sqlx::query(
        r#"
        UPDATE file_objects
        SET status = 'uploaded',
            updated_at = datetime('now')
        WHERE id = ?1
          AND status = 'pending'
        "#,
    )
    .bind(file_object_id)
    .execute(pool)
    .await?;

    get_file_object(pool, file_object_id).await
}

pub async fn mark_file_uploaded_with_checksum(
    pool: &SqlitePool,
    file_object_id: i64,
    actual_checksum_sha256: &str,
) -> AppResult<FileObject> {
    if file_object_id <= 0 {
        return Err(AppError::BadRequest("文件对象 ID 无效".to_string()));
    }
    let actual_checksum_sha256 = validate_checksum_sha256(actual_checksum_sha256)?;
    if actual_checksum_sha256.is_empty() {
        return Err(AppError::BadRequest(
            "文件 SHA-256 校验值不能为空".to_string(),
        ));
    }

    let state = sqlx::query_as::<_, (String, String)>(
        "SELECT status, checksum_sha256 FROM file_objects WHERE id = ?1",
    )
    .bind(file_object_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("文件对象不存在".to_string()))?;

    if state.0 == "uploaded" {
        if state.1 == actual_checksum_sha256 {
            return get_file_object(pool, file_object_id).await;
        }
        return Err(AppError::Conflict(
            "附件已上传，但对象摘要与本次确认不一致".to_string(),
        ));
    }
    if state.0 == "deleted" {
        return Err(AppError::NotFound("附件已归档".to_string()));
    }
    if !state.1.is_empty() && state.1 != actual_checksum_sha256 {
        return Err(AppError::BadRequest(
            "上传对象 SHA-256 与登记摘要不一致".to_string(),
        ));
    }

    let result = sqlx::query(
        r#"
        UPDATE file_objects
        SET status = 'uploaded',
            checksum_sha256 = ?1,
            updated_at = datetime('now')
        WHERE id = ?2
          AND status = 'pending'
          AND (checksum_sha256 = '' OR checksum_sha256 = ?1)
        "#,
    )
    .bind(&actual_checksum_sha256)
    .bind(file_object_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 1 {
        return get_file_object(pool, file_object_id).await;
    }

    let current = sqlx::query_as::<_, (String, String)>(
        "SELECT status, checksum_sha256 FROM file_objects WHERE id = ?1",
    )
    .bind(file_object_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("文件对象不存在".to_string()))?;
    if current.0 == "uploaded" && current.1 == actual_checksum_sha256 {
        return get_file_object(pool, file_object_id).await;
    }
    Err(AppError::Conflict(
        "附件状态已变化，请重新读取附件后再确认".to_string(),
    ))
}

pub async fn mark_attachment_uploaded(
    pool: &SqlitePool,
    attachment_id: i64,
    target_type: &str,
    target_id: i64,
) -> AppResult<FileAttachmentSummary> {
    let attachment = get_attachment_for_target(pool, attachment_id, target_type, target_id).await?;
    mark_file_uploaded(pool, attachment.file_object_id).await?;
    get_attachment(pool, attachment.id).await
}

pub async fn mark_attachment_uploaded_with_checksum(
    pool: &SqlitePool,
    attachment_id: i64,
    target_type: &str,
    target_id: i64,
    actual_checksum_sha256: &str,
) -> AppResult<FileAttachmentSummary> {
    let attachment = get_attachment_for_target(pool, attachment_id, target_type, target_id).await?;
    mark_file_uploaded_with_checksum(pool, attachment.file_object_id, actual_checksum_sha256)
        .await?;
    get_attachment(pool, attachment.id).await
}

/// 验证 SVG 只包含可用于流程图的静态内容。
/// 这里拒绝未知元素和危险属性，而不是尝试对原始 XML 做不完整的修补。
pub fn validate_svg_content(content: &[u8]) -> AppResult<()> {
    if content.is_empty() || content.len() > MAX_SVG_XML_BYTE_SIZE {
        return Err(AppError::BadRequest(
            "SVG 文件为空或超过安全大小限制".to_string(),
        ));
    }

    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut depth = 0_usize;
    let mut style_depth = 0_usize;
    let mut root_seen = false;
    let mut root_closed = false;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Decl(_)) | Ok(Event::Comment(_)) => {}
            Ok(Event::Text(text)) => {
                if style_depth > 0 {
                    let value = std::str::from_utf8(text.as_ref())
                        .map_err(|_| AppError::BadRequest("SVG 样式内容无效".to_string()))?;
                    if !style_is_safe(value) {
                        return Err(AppError::BadRequest("SVG 样式内容不安全".to_string()));
                    }
                }
            }
            Ok(Event::CData(text)) => {
                if style_depth > 0 {
                    let value = std::str::from_utf8(text.as_ref())
                        .map_err(|_| AppError::BadRequest("SVG 样式内容无效".to_string()))?;
                    if !style_is_safe(value) {
                        return Err(AppError::BadRequest("SVG 样式内容不安全".to_string()));
                    }
                }
            }
            Ok(Event::DocType(_)) => {
                return Err(AppError::BadRequest("SVG 不允许包含 DOCTYPE".to_string()));
            }
            Ok(Event::Start(element)) => {
                let name = element.local_name();
                let name = std::str::from_utf8(name.as_ref())
                    .map_err(|_| AppError::BadRequest("SVG 元素名称无效".to_string()))?;
                if root_closed || (!root_seen && name != "svg") || !allowed_svg_element(name) {
                    return Err(AppError::BadRequest(format!("SVG 元素不受支持：{name}")));
                }
                validate_svg_attributes(name, element.attributes().with_checks(true))?;
                root_seen = true;
                depth += 1;
                if name == "style" {
                    style_depth += 1;
                }
                if depth > MAX_SVG_XML_DEPTH {
                    return Err(AppError::BadRequest("SVG 嵌套层级超过安全限制".to_string()));
                }
            }
            Ok(Event::Empty(element)) => {
                let name = element.local_name();
                let name = std::str::from_utf8(name.as_ref())
                    .map_err(|_| AppError::BadRequest("SVG 元素名称无效".to_string()))?;
                if root_closed || (!root_seen && name != "svg") || !allowed_svg_element(name) {
                    return Err(AppError::BadRequest(format!("SVG 元素不受支持：{name}")));
                }
                validate_svg_attributes(name, element.attributes().with_checks(true))?;
                root_seen = true;
            }
            Ok(Event::End(element)) => {
                let local_name = element.local_name();
                let name = std::str::from_utf8(local_name.as_ref())
                    .map_err(|_| AppError::BadRequest("SVG 元素名称无效".to_string()))?;
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| AppError::BadRequest("SVG XML 结构无效".to_string()))?;
                if name == "style" {
                    style_depth = style_depth
                        .checked_sub(1)
                        .ok_or_else(|| AppError::BadRequest("SVG XML 结构无效".to_string()))?;
                }
                if depth == 0 {
                    root_closed = true;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(AppError::BadRequest(format!("SVG XML 无效：{error}")));
            }
            _ => {}
        }
        buffer.clear();
    }

    if !root_seen || !root_closed || depth != 0 {
        return Err(AppError::BadRequest(
            "SVG XML 缺少完整 svg 根元素".to_string(),
        ));
    }
    Ok(())
}

fn allowed_svg_element(name: &str) -> bool {
    matches!(
        name,
        "svg"
            | "g"
            | "rect"
            | "path"
            | "line"
            | "polyline"
            | "polygon"
            | "circle"
            | "text"
            | "marker"
            | "defs"
            | "style"
    )
}

fn validate_svg_attributes<'a>(
    element: &str,
    attributes: impl Iterator<
        Item = Result<
            quick_xml::events::attributes::Attribute<'a>,
            quick_xml::events::attributes::AttrError,
        >,
    >,
) -> AppResult<()> {
    for attribute in attributes {
        let attribute = attribute.map_err(|_| AppError::BadRequest("SVG 属性无效".to_string()))?;
        let name = std::str::from_utf8(attribute.key.as_ref())
            .map_err(|_| AppError::BadRequest("SVG 属性名称无效".to_string()))?;
        let value = attribute
            .unescape_value()
            .map_err(|_| AppError::BadRequest("SVG 属性值无效".to_string()))?;
        if name.starts_with("on") || name.eq_ignore_ascii_case("style") && !style_is_safe(&value) {
            return Err(AppError::BadRequest("SVG 包含不安全属性".to_string()));
        }
        let lower_value = value.to_ascii_lowercase();
        if lower_value.contains("javascript:")
            || lower_value.contains("expression(")
            || (lower_value.contains("url(") && !lower_value.contains("url(#"))
        {
            return Err(AppError::BadRequest("SVG 属性值不安全".to_string()));
        }
        if (name.eq_ignore_ascii_case("href") || name.eq_ignore_ascii_case("xlink:href"))
            && !value.starts_with('#')
        {
            return Err(AppError::BadRequest("SVG 不允许外部资源引用".to_string()));
        }
        if name.eq_ignore_ascii_case("id") && value.contains(['<', '>', '"', '\'']) {
            return Err(AppError::BadRequest("SVG ID 无效".to_string()));
        }
        if name.starts_with("xmlns") && !value.starts_with("http://www.w3.org/") {
            return Err(AppError::BadRequest("SVG 命名空间无效".to_string()));
        }
        if !allowed_svg_attribute(element, name) {
            return Err(AppError::BadRequest(format!("SVG 属性不受支持：{name}")));
        }
    }
    Ok(())
}

fn allowed_svg_attribute(element: &str, name: &str) -> bool {
    matches!(
        name,
        "xmlns"
            | "xmlns:xlink"
            | "viewBox"
            | "version"
            | "width"
            | "height"
            | "x"
            | "y"
            | "x1"
            | "x2"
            | "y1"
            | "y2"
            | "cx"
            | "cy"
            | "r"
            | "rx"
            | "ry"
            | "d"
            | "points"
            | "fill"
            | "fill-opacity"
            | "stroke"
            | "stroke-width"
            | "stroke-linecap"
            | "stroke-linejoin"
            | "stroke-dasharray"
            | "stroke-opacity"
            | "opacity"
            | "transform"
            | "text-anchor"
            | "font-family"
            | "font-size"
            | "font-weight"
            | "dominant-baseline"
            | "marker-start"
            | "marker-mid"
            | "marker-end"
            | "refX"
            | "refY"
            | "orient"
            | "markerWidth"
            | "markerHeight"
            | "preserveAspectRatio"
            | "id"
            | "class"
            | "style"
    ) || (element == "style" && name == "type")
}

fn style_is_safe(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    if lower.contains("url(") && !lower.contains("url(#") {
        return false;
    }
    if lower.contains("expression(") || lower.contains("javascript:") || lower.contains("@import") {
        return false;
    }

    let declarations = if value.contains('{') || value.contains('}') {
        let mut blocks = value.split('{');
        let _selector = blocks.next().unwrap_or_default();
        let mut declarations = Vec::new();
        for block in blocks {
            let Some((body, _)) = block.split_once('}') else {
                return false;
            };
            declarations.push(body);
        }
        if declarations.is_empty() {
            return false;
        }
        declarations.join(";")
    } else {
        value.to_string()
    };

    declarations.split(';').all(|declaration| {
        declaration
            .split_once(':')
            .map(|(property, _)| {
                matches!(
                    property.trim().to_ascii_lowercase().as_str(),
                    "fill"
                        | "fill-opacity"
                        | "stroke"
                        | "stroke-width"
                        | "stroke-opacity"
                        | "opacity"
                        | "font-family"
                        | "font-size"
                        | "font-weight"
                        | "text-anchor"
                        | "color"
                        | "marker-start"
                        | "marker-mid"
                        | "marker-end"
                        | "rx"
                        | "ry"
                        | "stroke-dasharray"
                )
            })
            .unwrap_or_else(|| declaration.trim().is_empty())
    })
}

pub async fn mark_attachment_uploaded_encrypted(
    pool: &SqlitePool,
    attachment_id: i64,
    target_type: &str,
    target_id: i64,
    encrypted_byte_size: i64,
    encrypted_checksum_sha256: &str,
) -> AppResult<FileAttachmentSummary> {
    let attachment = get_attachment_for_target(pool, attachment_id, target_type, target_id).await?;
    let encryption = get_file_object_encryption(pool, attachment.file_object_id)
        .await?
        .ok_or_else(|| AppError::BadRequest("附件未启用加密，不能登记密文元数据".to_string()))?;
    if encryption.encryption_status != "encrypted" {
        return Err(AppError::BadRequest(
            "附件未启用加密，不能登记密文元数据".to_string(),
        ));
    }
    if encrypted_byte_size < 0 {
        return Err(AppError::BadRequest("密文大小不能小于 0".to_string()));
    }
    let encrypted_checksum_sha256 = validate_checksum_sha256(encrypted_checksum_sha256)?;
    if encrypted_checksum_sha256.is_empty() {
        return Err(AppError::BadRequest(
            "密文 SHA-256 校验值不能为空".to_string(),
        ));
    }

    let result = sqlx::query(
        r#"
        UPDATE file_objects
        SET status = 'uploaded',
            encrypted_byte_size = ?1,
            encrypted_checksum_sha256 = ?2,
            updated_at = datetime('now')
        WHERE id = ?3
          AND status = 'pending'
          AND encryption_status = 'encrypted'
        "#,
    )
    .bind(encrypted_byte_size)
    .bind(&encrypted_checksum_sha256)
    .bind(attachment.file_object_id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        let state = sqlx::query_as::<_, (String, i64, String)>(
            r#"
            SELECT status, encrypted_byte_size, encrypted_checksum_sha256
            FROM file_objects
            WHERE id = ?1
            "#,
        )
        .bind(attachment.file_object_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("文件对象不存在".to_string()))?;
        if state.0 != "uploaded"
            || state.1 != encrypted_byte_size
            || state.2 != encrypted_checksum_sha256
        {
            return Err(AppError::Conflict(
                "附件状态已变化或密文摘要与已登记内容不一致".to_string(),
            ));
        }
    }

    get_attachment(pool, attachment.id).await
}

pub async fn get_file_object_encryption(
    pool: &SqlitePool,
    file_object_id: i64,
) -> AppResult<Option<FileObjectEncryption>> {
    if file_object_id <= 0 {
        return Err(AppError::BadRequest("文件对象 ID 无效".to_string()));
    }
    let row = sqlx::query_as::<_, (String, String, i64, String, String)>(
        r#"
        SELECT
            encryption_status,
            encryption_format,
            encrypted_byte_size,
            encrypted_checksum_sha256,
            data_key_envelope
        FROM file_objects
        WHERE id = ?1
        "#,
    )
    .bind(file_object_id)
    .fetch_one(pool)
    .await?;
    let (
        encryption_status,
        encryption_format,
        encrypted_byte_size,
        encrypted_checksum_sha256,
        data_key_envelope,
    ) = row;
    if encryption_status != "encrypted" {
        return Ok(None);
    }
    Ok(Some(FileObjectEncryption {
        file_object_id,
        encryption_status,
        encryption_format,
        encrypted_byte_size,
        encrypted_checksum_sha256,
        data_key_envelope,
    }))
}

pub struct ArchiveAttachmentInput<'a> {
    pub attachment_id: i64,
    pub target_type: &'a str,
    pub target_id: i64,
    pub actor_user_id: i64,
    pub actor_display_name_snapshot: &'a str,
    pub project_id: Option<i64>,
    pub activity_summary: Option<&'a str>,
}

pub async fn archive_attachment(
    pool: &SqlitePool,
    input: ArchiveAttachmentInput<'_>,
) -> AppResult<FileAttachmentSummary> {
    let ArchiveAttachmentInput {
        attachment_id,
        target_type,
        target_id,
        actor_user_id,
        actor_display_name_snapshot,
        project_id,
        activity_summary,
    } = input;
    let attachment = get_attachment_for_target(pool, attachment_id, target_type, target_id).await?;
    if let Some(project_id) = project_id
        && project_id <= 0
    {
        return Err(AppError::BadRequest("项目动态目标无效".to_string()));
    }
    let activity_summary = activity_summary
        .map(validate_activity_summary)
        .transpose()?;
    let actor_display_name_snapshot = normalize_display_name_snapshot(actor_display_name_snapshot);

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE file_objects
        SET status = 'deleted',
            updated_at = datetime('now')
        WHERE id = ?1
          AND status <> 'deleted'
        "#,
    )
    .bind(attachment.file_object_id)
    .execute(&mut *tx)
    .await?;

    if let (Some(project_id), Some(summary)) = (project_id, activity_summary.as_deref()) {
        sqlx::query(
            r#"
            INSERT INTO project_activities (
                project_id,
                actor_user_id,
                actor_display_name_snapshot,
                action,
                target_type,
                target_id,
                summary,
                metadata
            )
            VALUES (?1, ?2, ?3, 'file.archived', ?4, ?5, ?6, ?7)
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
        .bind(&actor_display_name_snapshot)
        .bind(target_type)
        .bind(target_id.to_string())
        .bind(summary)
        .bind(format!(
            r#"{{"attachment_id":{},"file_object_id":{},"filename":"{}"}}"#,
            attachment.id,
            attachment.file_object_id,
            attachment.original_filename.replace('"', "\\\"")
        ))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_attachment(pool, attachment.id).await
}

pub async fn archive_resource_attachment_if_match(
    pool: &SqlitePool,
    attachment_id: i64,
    resource_id: i64,
    expected_updated_at: &str,
    actor_user_id: i64,
    actor_display_name_snapshot: &str,
) -> AppResult<FileAttachmentSummary> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let resource = sqlx::query_as::<_, (String, String, String)>(
        "SELECT body, body_format, updated_at FROM project_resources WHERE id = ?1 AND status <> 'archived'",
    )
    .bind(resource_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))?;

    if resource.2 != expected_updated_at {
        return Err(AppError::Conflict(
            "资料已更新，请重新读取后再删除附件".to_string(),
        ));
    }
    if crate::domains::project_resources::resource_body_references_attachment(
        resource_id,
        &resource.0,
        &resource.1,
        attachment_id,
    ) {
        return Err(AppError::Conflict(
            "资料正文仍引用该附件，不能删除".to_string(),
        ));
    }

    let attachment = sqlx::query_as::<_, AttachmentRow>(
        r#"
        SELECT fa.id, fa.file_object_id, fo.object_key, fo.original_filename,
               fo.content_type, fo.byte_size, fo.status,
               fa.created_by_display_name_snapshot, fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        WHERE fa.id = ?1 AND fa.target_type = 'project_resource'
          AND fa.target_id = ?2 AND fo.status <> 'deleted'
        "#,
    )
    .bind(attachment_id)
    .bind(resource_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("附件不存在".to_string()))?;

    let has_other_reference =
        file_object_has_protecting_references_in_tx(&mut tx, attachment.1, Some(attachment.0))
            .await?;
    if has_other_reference {
        return Err(AppError::Conflict(
            "文件对象仍被其他受保护的附件关系引用，不能删除".to_string(),
        ));
    }

    let actor_display_name_snapshot = normalize_display_name_snapshot(actor_display_name_snapshot);
    enqueue_deleted_file_object_in_tx(&mut tx, attachment.1).await?;
    tx.commit().await?;

    let _ = actor_user_id;
    let _ = actor_display_name_snapshot;
    let mut archived = attachment_from_row(attachment);
    archived.status = "deleted".to_string();
    Ok(archived)
}

pub async fn cleanup_deleted_file_objects(
    pool: &SqlitePool,
    settings: &Settings,
    dry_run: bool,
    limit: i64,
) -> AppResult<DeletedFileCleanupSummary> {
    if !(1..=1000).contains(&limit) {
        return Err(AppError::BadRequest(
            "删除对象清理 limit 必须在 1 到 1000 之间".to_string(),
        ));
    }

    let due_count = count_due_file_object_deletion_jobs(pool).await?;
    let pending_count = count_open_file_object_deletion_jobs(pool).await?;
    let mut summary = DeletedFileCleanupSummary {
        due_count,
        not_due_count: pending_count.saturating_sub(due_count),
        processed_count: 0,
        completed_count: 0,
        failed_count: 0,
        lease_lost_count: 0,
        pending_count,
    };
    if dry_run {
        return Ok(summary);
    }

    while summary.processed_count < limit {
        let Some(job) = claim_file_object_deletion_job(pool).await? else {
            break;
        };
        summary.processed_count += 1;

        let deleted = storage::delete_object_at_location(
            pool,
            settings,
            job.storage_config_id,
            &job.provider,
            &job.endpoint,
            &job.region,
            &job.bucket,
            &job.object_key,
        )
        .await;
        match deleted {
            Ok(()) => {
                if complete_file_object_deletion_job(pool, &job).await? {
                    summary.completed_count += 1;
                } else {
                    summary.lease_lost_count += 1;
                }
            }
            Err(error) => {
                if retry_file_object_deletion_job(pool, &job, &error.to_string()).await? {
                    summary.failed_count += 1;
                } else {
                    summary.lease_lost_count += 1;
                }
            }
        }
    }
    summary.pending_count = count_open_file_object_deletion_jobs(pool).await?;
    Ok(summary)
}

async fn count_due_file_object_deletion_jobs(pool: &SqlitePool) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM file_object_deletion_jobs
        WHERE (status = 'pending' AND next_attempt_at <= datetime('now'))
           OR (status = 'processing' AND lease_until <= datetime('now'))
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

async fn count_open_file_object_deletion_jobs(pool: &SqlitePool) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM file_object_deletion_jobs WHERE status <> 'completed'",
    )
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

async fn claim_file_object_deletion_job(
    pool: &SqlitePool,
) -> AppResult<Option<FileObjectDeletionJob>> {
    let lease_token = Uuid::new_v4().to_string();
    sqlx::query_as::<
        _,
        (
            i64,
            Option<i64>,
            String,
            String,
            String,
            String,
            String,
            String,
            i64,
        ),
    >(
        r#"
        UPDATE file_object_deletion_jobs
        SET status = 'processing',
            lease_until = datetime('now', '+5 minutes'),
            lease_token = ?1,
            attempt_count = attempt_count + 1,
            updated_at = datetime('now')
        WHERE id = (
            SELECT id
            FROM file_object_deletion_jobs
            WHERE (status = 'pending' AND next_attempt_at <= datetime('now'))
               OR (status = 'processing' AND lease_until <= datetime('now'))
            ORDER BY next_attempt_at, id
            LIMIT 1
        )
          AND ((status = 'pending' AND next_attempt_at <= datetime('now'))
               OR (status = 'processing' AND lease_until <= datetime('now')))
        RETURNING id, storage_config_id, provider, endpoint, region,
                  bucket, object_key, lease_token, attempt_count
        "#,
    )
    .bind(&lease_token)
    .fetch_optional(pool)
    .await
    .map(|row| {
        row.map(
            |(
                id,
                storage_config_id,
                provider,
                endpoint,
                region,
                bucket,
                object_key,
                lease_token,
                attempt_count,
            )| FileObjectDeletionJob {
                id,
                storage_config_id,
                provider,
                endpoint,
                region,
                bucket,
                object_key,
                lease_token,
                attempt_count,
            },
        )
    })
    .map_err(Into::into)
}

async fn complete_file_object_deletion_job(
    pool: &SqlitePool,
    job: &FileObjectDeletionJob,
) -> AppResult<bool> {
    let rows_affected = sqlx::query(
        r#"
        UPDATE file_object_deletion_jobs
        SET status = 'completed', storage_config_id = NULL,
            lease_until = NULL, lease_token = NULL,
            last_error = '', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?1 AND status = 'processing' AND lease_token = ?2
        "#,
    )
    .bind(job.id)
    .bind(&job.lease_token)
    .execute(pool)
    .await?
    .rows_affected();
    Ok(rows_affected == 1)
}

async fn retry_file_object_deletion_job(
    pool: &SqlitePool,
    job: &FileObjectDeletionJob,
    error: &str,
) -> AppResult<bool> {
    let retry_minutes = 1_i64
        .checked_shl(job.attempt_count.saturating_sub(1).clamp(0, 9) as u32)
        .unwrap_or(360)
        .min(360);
    let safe_error = sanitize_deletion_job_error(error, job);
    let rows_affected = sqlx::query(
        r#"
        UPDATE file_object_deletion_jobs
        SET status = 'pending', lease_until = NULL, lease_token = NULL,
            next_attempt_at = datetime('now', ?1), last_error = ?2,
            updated_at = datetime('now')
        WHERE id = ?3 AND status = 'processing' AND lease_token = ?4
        "#,
    )
    .bind(format!("+{retry_minutes} minutes"))
    .bind(safe_error)
    .bind(job.id)
    .bind(&job.lease_token)
    .execute(pool)
    .await?
    .rows_affected();
    Ok(rows_affected == 1)
}

fn sanitize_deletion_job_error(error: &str, job: &FileObjectDeletionJob) -> String {
    let mut message = error.to_string();
    for value in [&job.object_key, &job.bucket, &job.endpoint] {
        if !value.is_empty() {
            message = message.replace(value, "[redacted]");
        }
    }
    message
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(500)
        .collect()
}

pub async fn cleanup_pending_file_objects(
    pool: &SqlitePool,
    older_than_hours: i64,
    dry_run: bool,
) -> AppResult<PendingFileCleanupSummary> {
    validate_cleanup_age_hours(older_than_hours)?;

    let matched_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM file_objects
        WHERE status = 'pending'
          AND created_at <= datetime('now', ?1)
          AND (
              upload_url_expires_at = ''
              OR datetime(upload_url_expires_at, '+4 hours', '+5 minutes') <= datetime('now')
          )
        "#,
    )
    .bind(format!("-{older_than_hours} hours"))
    .fetch_one(pool)
    .await?;

    if dry_run || matched_count == 0 {
        return Ok(PendingFileCleanupSummary {
            matched_count,
            deleted_count: 0,
        });
    }

    let deleted_count = sqlx::query(
        r#"
        UPDATE file_objects
        SET status = 'deleted',
            updated_at = datetime('now')
        WHERE status = 'pending'
          AND created_at <= datetime('now', ?1)
          AND (
              upload_url_expires_at = ''
              OR datetime(upload_url_expires_at, '+4 hours', '+5 minutes') <= datetime('now')
          )
        "#,
    )
    .bind(format!("-{older_than_hours} hours"))
    .execute(pool)
    .await?
    .rows_affected() as i64;

    Ok(PendingFileCleanupSummary {
        matched_count,
        deleted_count,
    })
}

pub async fn audit_file_objects(
    pool: &SqlitePool,
    include_deleted: bool,
) -> AppResult<FileObjectAuditSummary> {
    let (
        total_count,
        attached_count,
        orphan_count,
        pending_orphan_count,
        uploaded_orphan_count,
        deleted_orphan_count,
    ) = sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64)>(
        r#"
        WITH owned_file_objects AS (
            SELECT
                fo.status,
                (
                    EXISTS (SELECT 1 FROM file_attachments fa WHERE fa.file_object_id = fo.id)
                    OR EXISTS (SELECT 1 FROM system_release_assets sra WHERE sra.file_object_id = fo.id)
                ) AS is_attached
            FROM file_objects fo
            WHERE (?1 OR fo.status <> 'deleted')
        )
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN is_attached THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_attached THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_attached AND status = 'pending' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_attached AND status = 'uploaded' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_attached AND status = 'deleted' THEN 1 ELSE 0 END), 0)
        FROM owned_file_objects
        "#,
    )
    .bind(include_deleted)
    .fetch_one(pool)
    .await?;

    Ok(FileObjectAuditSummary {
        total_count,
        attached_count,
        orphan_count,
        pending_orphan_count,
        uploaded_orphan_count,
        deleted_orphan_count,
        include_deleted,
    })
}

fn attachment_query() -> sqlx::QueryBuilder<sqlx::Sqlite> {
    sqlx::QueryBuilder::new(
        r#"
        SELECT
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(NULLIF(fa.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
            fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        LEFT JOIN users u ON u.id = fa.created_by_user_id
        "#,
    )
}

fn attachment_from_row(row: AttachmentRow) -> FileAttachmentSummary {
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

fn normalize_display_name_snapshot(display_name: &str) -> String {
    display_name.trim().to_string()
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
        "project_resource" => Ok("project_resource"),
        _ => Err(AppError::BadRequest(
            "附件目标类型只能是 project / work_item / comment / project_resource".to_string(),
        )),
    }
}

fn validate_activity_summary(summary: &str) -> AppResult<String> {
    let summary = summary.trim();
    if summary.is_empty() || summary.chars().count() > 240 {
        return Err(AppError::BadRequest(
            "附件动态摘要不能为空且不能超过 240 个字符".to_string(),
        ));
    }
    Ok(summary.to_string())
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
    let content_type = content_type.trim().to_ascii_lowercase();
    if content_type.is_empty()
        || content_type.len() > 128
        || content_type.contains('\n')
        || content_type.contains('\r')
        || content_type.contains(';')
    {
        return Err(AppError::BadRequest("Content-Type 无效".to_string()));
    }
    if !is_allowed_content_type(&content_type) {
        return Err(AppError::BadRequest(
            "暂不支持该附件类型，请上传图片、文本、PDF、Office 文档、JSON 或压缩包".to_string(),
        ));
    }
    Ok(content_type.to_string())
}

fn validate_byte_size(byte_size: i64) -> AppResult<()> {
    if byte_size < 0 {
        return Err(AppError::BadRequest("文件大小不能小于 0".to_string()));
    }
    if byte_size > MAX_ATTACHMENT_BYTE_SIZE {
        return Err(AppError::BadRequest(format!(
            "文件大小不能超过 {} GB",
            MAX_ATTACHMENT_BYTE_SIZE / 1024 / 1024 / 1024
        )));
    }
    Ok(())
}

fn validate_checksum_sha256(value: &str) -> AppResult<String> {
    let value = value.trim();
    if !value.is_empty()
        && (value.len() != 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
    {
        return Err(AppError::BadRequest("SHA-256 校验值无效".to_string()));
    }
    Ok(value.to_string())
}

fn validate_cleanup_age_hours(older_than_hours: i64) -> AppResult<()> {
    if older_than_hours < 1 {
        return Err(AppError::BadRequest(
            "pending 文件清理阈值不能小于 1 小时".to_string(),
        ));
    }
    if older_than_hours > 24 * 365 {
        return Err(AppError::BadRequest(
            "pending 文件清理阈值不能超过 365 天".to_string(),
        ));
    }
    Ok(())
}

fn is_allowed_content_type(content_type: &str) -> bool {
    ALLOWED_CONTENT_TYPE_PREFIXES
        .iter()
        .any(|prefix| content_type.starts_with(prefix))
        || ALLOWED_CONTENT_TYPES.contains(&content_type)
}

type FolderRow = (
    i64,
    Option<i64>,
    i64,
    String,
    String,
    String,
    String,
    String,
    String,
);

fn folder_from_row(row: FolderRow) -> FileFolder {
    let (
        id,
        parent_id,
        project_id,
        name,
        description,
        status,
        created_by_display_name,
        created_at,
        updated_at,
    ) = row;
    FileFolder {
        id,
        parent_id,
        project_id,
        name,
        description,
        status,
        created_by_display_name,
        created_at,
        updated_at,
    }
}

pub async fn create_folder(pool: &SqlitePool, input: CreateFolderInput) -> AppResult<FileFolder> {
    let name = validate_folder_name(&input.name)?;
    let description = input.description.unwrap_or_default().trim().to_string();
    let created_by_display_name_snapshot =
        normalize_display_name_snapshot(&input.created_by_display_name_snapshot);

    if let Some(parent_id) = input.parent_id {
        if parent_id <= 0 {
            return Err(AppError::BadRequest("父文件夹 ID 无效".to_string()));
        }
        let parent_folder = get_folder(pool, parent_id).await?;
        if parent_folder.project_id != input.project_id {
            return Err(AppError::BadRequest("父文件夹不属于当前项目".to_string()));
        }
    }
    ensure_folder_name_available(pool, input.project_id, input.parent_id, &name, None).await?;

    let id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO file_folders (
            parent_id,
            project_id,
            name,
            description,
            created_by_user_id,
            created_by_display_name_snapshot
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        RETURNING id
        "#,
    )
    .bind(input.parent_id)
    .bind(input.project_id)
    .bind(&name)
    .bind(&description)
    .bind(input.created_by_user_id)
    .bind(&created_by_display_name_snapshot)
    .fetch_one(pool)
    .await?;

    get_folder(pool, id).await
}

pub async fn get_folder(pool: &SqlitePool, id: i64) -> AppResult<FileFolder> {
    get_folder_optional(pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("文件夹不存在".to_string()))
}

pub async fn get_folder_optional(pool: &SqlitePool, id: i64) -> AppResult<Option<FileFolder>> {
    if id <= 0 {
        return Err(AppError::BadRequest("文件夹 ID 无效".to_string()));
    }

    let row = sqlx::query_as::<_, FolderRow>(
        r#"
        SELECT
            ff.id,
            ff.parent_id,
            ff.project_id,
            ff.name,
            ff.description,
            ff.status,
            COALESCE(NULLIF(ff.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
            ff.created_at,
            ff.updated_at
        FROM file_folders ff
        LEFT JOIN users u ON u.id = ff.created_by_user_id
        WHERE ff.id = ?1
          AND ff.status = 'active'
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(folder_from_row))
}

pub async fn update_folder(
    pool: &SqlitePool,
    id: i64,
    input: UpdateFolderInput,
) -> AppResult<FileFolder> {
    let folder = get_folder(pool, id).await?;

    if let Some(name) = input.name {
        let name = validate_folder_name(&name)?;
        ensure_folder_name_available(pool, folder.project_id, folder.parent_id, &name, Some(id))
            .await?;
        sqlx::query(
            r#"UPDATE file_folders SET name = ?, updated_at = datetime('now') WHERE id = ?"#,
        )
        .bind(name)
        .bind(id)
        .execute(pool)
        .await?;
    }

    if let Some(description) = input.description {
        let desc = description.trim().to_string();
        sqlx::query(
            r#"UPDATE file_folders SET description = ?, updated_at = datetime('now') WHERE id = ?"#,
        )
        .bind(desc)
        .bind(id)
        .execute(pool)
        .await?;
    }

    get_folder(pool, id).await
}

async fn ensure_folder_name_available(
    pool: &SqlitePool,
    project_id: i64,
    parent_id: Option<i64>,
    name: &str,
    exclude_id: Option<i64>,
) -> AppResult<()> {
    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM file_folders
        WHERE project_id = ?1
          AND COALESCE(parent_id, 0) = COALESCE(?2, 0)
          AND name = ?3
          AND status = 'active'
          AND (?4 IS NULL OR id <> ?4)
        "#,
    )
    .bind(project_id)
    .bind(parent_id)
    .bind(name)
    .bind(exclude_id)
    .fetch_one(pool)
    .await?;

    if existing_count > 0 {
        return Err(AppError::Conflict("同级文件夹名称已存在".to_string()));
    }
    Ok(())
}

pub async fn delete_folder(pool: &SqlitePool, id: i64) -> AppResult<FileFolder> {
    let folder = get_folder(pool, id).await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        WITH RECURSIVE folder_tree(id) AS (
            SELECT id
            FROM file_folders
            WHERE id = ?1
              AND status = 'active'
            UNION ALL
            SELECT child.id
            FROM file_folders child
            JOIN folder_tree parent ON child.parent_id = parent.id
            WHERE child.status = 'active'
        )
        UPDATE file_objects
        SET folder_id = NULL,
            updated_at = datetime('now')
        WHERE folder_id IN (SELECT id FROM folder_tree)
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        WITH RECURSIVE folder_tree(id) AS (
            SELECT id
            FROM file_folders
            WHERE id = ?1
              AND status = 'active'
            UNION ALL
            SELECT child.id
            FROM file_folders child
            JOIN folder_tree parent ON child.parent_id = parent.id
            WHERE child.status = 'active'
        )
        UPDATE file_folders
        SET status = 'deleted',
            updated_at = datetime('now')
        WHERE id IN (SELECT id FROM folder_tree)
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(folder)
}

pub async fn list_folders(
    pool: &SqlitePool,
    project_id: i64,
    parent_id: Option<i64>,
) -> AppResult<Vec<FileFolder>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let mut query = sqlx::QueryBuilder::new(
        r#"
        SELECT
            ff.id,
            ff.parent_id,
            ff.project_id,
            ff.name,
            ff.description,
            ff.status,
            COALESCE(NULLIF(ff.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
            ff.created_at,
            ff.updated_at
        FROM file_folders ff
        LEFT JOIN users u ON u.id = ff.created_by_user_id
        WHERE ff.project_id =
        "#,
    );
    query.push_bind(project_id).push(
        r#"
          AND ff.status = 'active'
        "#,
    );
    if let Some(parent_id) = parent_id {
        if parent_id <= 0 {
            return Err(AppError::BadRequest("父文件夹 ID 无效".to_string()));
        }
        query.push(" AND ff.parent_id = ").push_bind(parent_id);
    } else {
        query.push(" AND ff.parent_id IS NULL");
    }
    query.push(
        r#"
        ORDER BY ff.created_at DESC, ff.id DESC
        "#,
    );
    let rows = query.build_query_as::<FolderRow>().fetch_all(pool).await?;

    Ok(rows.into_iter().map(folder_from_row).collect())
}

pub async fn get_folder_tree(pool: &SqlitePool, project_id: i64) -> AppResult<Vec<FolderTreeItem>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let rows = sqlx::query_as::<_, (i64, Option<i64>, String, String)>(
        r#"
        SELECT
            ff.id,
            ff.parent_id,
            ff.name,
            ff.description
        FROM file_folders ff
        WHERE ff.project_id = ?1
          AND ff.status = 'active'
        ORDER BY ff.parent_id NULLS FIRST, ff.created_at ASC, ff.id ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    let items: Vec<FolderTreeItem> = rows
        .into_iter()
        .map(|(id, parent_id, name, description)| FolderTreeItem {
            id,
            parent_id,
            name,
            description,
            children: Vec::new(),
        })
        .collect();

    Ok(build_folder_tree(None, &items))
}

pub async fn get_folder_content(
    pool: &SqlitePool,
    project_id: i64,
    folder_id: Option<i64>,
) -> AppResult<FolderContentSummary> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let folder_name = if let Some(fid) = folder_id {
        let folder = get_folder(pool, fid).await?;
        if folder.project_id != project_id {
            return Err(AppError::BadRequest("文件夹不属于当前项目".to_string()));
        }
        Some(folder.name)
    } else {
        None
    };

    let folders = list_folders(pool, project_id, folder_id).await?;

    let files = sqlx::query_as::<_, AttachmentRow>(
        r#"
        SELECT
            fa.id,
            fo.id,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            COALESCE(NULLIF(fa.created_by_display_name_snapshot, ''), u.display_name, '') AS created_by_display_name,
            fa.created_at
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        LEFT JOIN users u ON u.id = fa.created_by_user_id
        WHERE fa.target_type = 'project'
          AND fa.target_id = ?1
          AND fo.status <> 'deleted'
          AND (?2 IS NULL OR fo.folder_id = ?2)
        ORDER BY fa.created_at DESC, fa.id DESC
        "#,
    )
    .bind(project_id)
    .bind(folder_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(attachment_from_row)
    .collect();

    Ok(FolderContentSummary {
        folder_id,
        folder_name,
        folders,
        files,
    })
}

pub async fn move_file_to_folder(
    pool: &SqlitePool,
    file_object_id: i64,
    folder_id: Option<i64>,
) -> AppResult<FileObject> {
    if file_object_id <= 0 {
        return Err(AppError::BadRequest("文件对象 ID 无效".to_string()));
    }

    if let Some(fid) = folder_id {
        if fid <= 0 {
            return Err(AppError::BadRequest("文件夹 ID 无效".to_string()));
        }
        let _ = get_folder(pool, fid).await?;
    }

    sqlx::query(
        r#"
        UPDATE file_objects
        SET folder_id = ?1,
            updated_at = datetime('now')
        WHERE id = ?2
        "#,
    )
    .bind(folder_id)
    .bind(file_object_id)
    .execute(pool)
    .await?;

    get_file_object(pool, file_object_id).await
}

fn validate_folder_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 255 {
        return Err(AppError::BadRequest(
            "文件夹名称不能为空且不能超过 255 个字符".to_string(),
        ));
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(AppError::BadRequest(
            "文件夹名称不能包含斜杠或空字符".to_string(),
        ));
    }
    Ok(name.to_string())
}

fn build_folder_tree(parent_id: Option<i64>, items: &[FolderTreeItem]) -> Vec<FolderTreeItem> {
    items
        .iter()
        .filter(|item| item.parent_id == parent_id)
        .map(|item| FolderTreeItem {
            id: item.id,
            parent_id: item.parent_id,
            name: item.name.clone(),
            description: item.description.clone(),
            children: build_folder_tree(Some(item.id), items),
        })
        .collect()
}

#[cfg(test)]
mod deletion_job_error_tests {
    use super::{FileObjectDeletionJob, sanitize_deletion_job_error};

    #[test]
    fn cleanup_error_diagnostics_redact_location_and_control_characters() {
        let job = FileObjectDeletionJob {
            id: 1,
            storage_config_id: Some(2),
            provider: "aliyun_oss".to_string(),
            endpoint: "https://oss.example.test".to_string(),
            region: "test".to_string(),
            bucket: "private-bucket".to_string(),
            object_key: "uploads/private/object".to_string(),
            lease_token: "lease".to_string(),
            attempt_count: 1,
        };
        let message = sanitize_deletion_job_error(
            "failed at https://oss.example.test/private-bucket/uploads/private/object\nretry",
            &job,
        );
        assert!(!message.contains(&job.endpoint));
        assert!(!message.contains(&job.bucket));
        assert!(!message.contains(&job.object_key));
        assert!(!message.contains('\n'));
        assert!(message.contains("[redacted]"));
    }
}

#[cfg(test)]
mod svg_tests {
    use super::validate_svg_content;

    const VALID_SVG: &[u8] = br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#333"/></marker></defs>
      <style>rect { fill: #fff; stroke: #333; rx: 3; } line { marker-end: url(#arrow); }</style>
      <rect x="5" y="5" width="45" height="25" rx="3" style="fill:#fff;stroke:#333"/>
      <line x1="50" y1="18" x2="90" y2="18" stroke="#333" marker-end="url(#arrow)"/>
      <text x="12" y="22" font-family="sans-serif">&#x4E2D;&#x6587;&#x6D41;&#x7A0B;</text>
    </svg>"##;

    #[test]
    fn accepts_static_flowchart_svg_with_chinese_text() {
        let result = validate_svg_content(VALID_SVG);
        assert!(result.is_ok(), "{result:?}");
    }

    #[test]
    fn rejects_script_and_event_attributes() {
        for svg in [
            br#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#
                .as_slice(),
            br#"<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>"#.as_slice(),
            br#"<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>"#
                .as_slice(),
        ] {
            assert!(validate_svg_content(svg).is_err());
        }
    }

    #[test]
    fn rejects_external_resources_and_embedded_content() {
        for svg in [
            br#"<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x"/></svg>"#.as_slice(),
            br#"<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>"#.as_slice(),
            br#"<svg xmlns="http://www.w3.org/2000/svg"><style>rect { fill: url(https://evil.test); }</style></svg>"#.as_slice(),
        ] {
            assert!(validate_svg_content(svg).is_err());
        }
    }
}
