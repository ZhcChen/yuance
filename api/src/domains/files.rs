use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    domains::storage::StorageConfig,
    platform::error::{AppError, AppResult},
};

pub const MAX_ATTACHMENT_BYTE_SIZE: i64 = 100 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE_PREFIXES: &[&str] = &["image/", "text/", "video/"];
const ALLOWED_CONTENT_TYPES: &[&str] = &[
    "application/json",
    "application/msword",
    "application/octet-stream",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/x-7z-compressed",
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
pub struct FileObjectAuditSummary {
    pub total_count: i64,
    pub attached_count: i64,
    pub orphan_count: i64,
    pub pending_orphan_count: i64,
    pub uploaded_orphan_count: i64,
    pub deleted_orphan_count: i64,
    pub include_deleted: bool,
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
    pub activity_summary: Option<String>,
}

pub async fn create_file_object(
    pool: &SqlitePool,
    storage_config: &StorageConfig,
    input: CreateFileObjectInput,
) -> AppResult<FileObject> {
    let original_filename = validate_filename(&input.original_filename)?;
    let content_type = validate_content_type(&input.content_type)?;
    validate_byte_size(input.byte_size)?;

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
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)
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
    validate_byte_size(input.byte_size)?;
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
            status,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)
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

    if let (Some(project_id), Some(summary)) = (input.project_id, activity_summary.as_deref()) {
        sqlx::query(
            r#"
            INSERT INTO project_activities (
                project_id,
                actor_user_id,
                action,
                target_type,
                target_id,
                summary,
                metadata
            )
            VALUES (?1, ?2, 'file.attached', ?3, ?4, ?5, ?6)
            "#,
        )
        .bind(project_id)
        .bind(input.created_by_user_id)
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
            COALESCE(u.display_name, '') AS created_by_display_name,
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

pub async fn archive_attachment(
    pool: &SqlitePool,
    attachment_id: i64,
    target_type: &str,
    target_id: i64,
    actor_user_id: i64,
    project_id: Option<i64>,
    activity_summary: Option<&str>,
) -> AppResult<FileAttachmentSummary> {
    let attachment = get_attachment_for_target(pool, attachment_id, target_type, target_id).await?;
    if let Some(project_id) = project_id
        && project_id <= 0
    {
        return Err(AppError::BadRequest("项目动态目标无效".to_string()));
    }
    let activity_summary = activity_summary
        .map(validate_activity_summary)
        .transpose()?;

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
                action,
                target_type,
                target_id,
                summary,
                metadata
            )
            VALUES (?1, ?2, 'file.archived', ?3, ?4, ?5, ?6)
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
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
    let total_count = count_file_objects(pool, include_deleted).await?;
    let attached_count = count_attached_file_objects(pool, include_deleted).await?;
    let orphan_count = count_orphan_file_objects(pool, include_deleted, None).await?;
    let pending_orphan_count =
        count_orphan_file_objects(pool, include_deleted, Some("pending")).await?;
    let uploaded_orphan_count =
        count_orphan_file_objects(pool, include_deleted, Some("uploaded")).await?;
    let deleted_orphan_count =
        count_orphan_file_objects(pool, include_deleted, Some("deleted")).await?;

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

async fn count_file_objects(pool: &SqlitePool, include_deleted: bool) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM file_objects
        WHERE (?1 OR status <> 'deleted')
        "#,
    )
    .bind(include_deleted)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

async fn count_attached_file_objects(pool: &SqlitePool, include_deleted: bool) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(DISTINCT fo.id)
        FROM file_objects fo
        JOIN file_attachments fa ON fa.file_object_id = fo.id
        WHERE (?1 OR fo.status <> 'deleted')
        "#,
    )
    .bind(include_deleted)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

async fn count_orphan_file_objects(
    pool: &SqlitePool,
    include_deleted: bool,
    status: Option<&str>,
) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM file_objects fo
        LEFT JOIN file_attachments fa ON fa.file_object_id = fo.id
        WHERE fa.id IS NULL
          AND (?1 OR fo.status <> 'deleted')
          AND (?2 IS NULL OR fo.status = ?2)
        "#,
    )
    .bind(include_deleted)
    .bind(status)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
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
            COALESCE(u.display_name, '') AS created_by_display_name,
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
            "文件大小不能超过 {} MB",
            MAX_ATTACHMENT_BYTE_SIZE / 1024 / 1024
        )));
    }
    Ok(())
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
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING id
        "#,
    )
    .bind(input.parent_id)
    .bind(input.project_id)
    .bind(&name)
    .bind(&description)
    .bind(input.created_by_user_id)
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
            COALESCE(u.display_name, '') AS created_by_display_name,
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
            COALESCE(u.display_name, '') AS created_by_display_name,
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
            COALESCE(u.display_name, '') AS created_by_display_name,
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
