use sqlx::SqlitePool;

use crate::{
    domains::{
        files::{self, CreateFileObjectInput},
        projects::{Paginated, Pagination},
        storage,
    },
    platform::{
        config::Settings,
        error::{AppError, AppResult},
    },
};

pub const RELEASE_STATUS_DRAFT: &str = "draft";
pub const RELEASE_STATUS_PUBLISHED: &str = "published";

pub const RELEASE_PLATFORM_WINDOWS: &str = "windows";
pub const RELEASE_PLATFORM_MACOS: &str = "macos";
pub const RELEASE_PLATFORM_LINUX: &str = "linux";
pub const RELEASE_PLATFORM_ANDROID: &str = "android";
pub const RELEASE_PLATFORM_IOS: &str = "ios";

pub const DEFAULT_RETENTION_COUNT: i64 = 5;
pub const MIN_RETENTION_COUNT: i64 = 1;
pub const MAX_RETENTION_COUNT: i64 = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemReleaseSettings {
    pub retention_count: i64,
    pub updated_by_display_name: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemReleaseVersionSummary {
    pub id: i64,
    pub version_name: String,
    pub title: String,
    pub notes: String,
    pub status: String,
    pub published_at: String,
    pub created_by_display_name: String,
    pub updated_by_display_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub asset_count: i64,
    pub platform_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemReleaseAssetSummary {
    pub id: i64,
    pub release_id: i64,
    pub file_object_id: i64,
    pub platform: String,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SystemReleaseDetail {
    pub release: SystemReleaseVersionSummary,
    pub assets: Vec<SystemReleaseAssetSummary>,
}

#[derive(Debug, Clone)]
pub struct CreateSystemReleaseInput {
    pub version_name: String,
    pub title: String,
    pub notes: String,
}

#[derive(Debug, Clone)]
pub struct UpdateSystemReleaseInput {
    pub version_name: String,
    pub title: String,
    pub notes: String,
    pub publish: bool,
}

#[derive(Debug, Clone)]
pub struct CreateSystemReleaseAssetInput {
    pub platform: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub created_by_user_id: i64,
}

pub async fn get_settings(pool: &SqlitePool) -> AppResult<SystemReleaseSettings> {
    ensure_settings_row(pool).await?;
    let row = sqlx::query_as::<_, (i64, String, String)>(
        r#"
        SELECT
            s.retention_count,
            COALESCE(NULLIF(u.display_name, ''), u.username, '') AS updated_by_display_name,
            s.updated_at
        FROM system_release_settings s
        LEFT JOIN users u ON u.id = s.updated_by_user_id
        WHERE s.id = 1
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(SystemReleaseSettings {
        retention_count: row.0,
        updated_by_display_name: row.1,
        updated_at: row.2,
    })
}

pub async fn update_settings(
    pool: &SqlitePool,
    settings: &Settings,
    actor_user_id: i64,
    retention_count: i64,
) -> AppResult<SystemReleaseSettings> {
    let retention_count = validate_retention_count(retention_count)?;
    ensure_settings_row(pool).await?;
    sqlx::query(
        r#"
        UPDATE system_release_settings
        SET retention_count = ?1,
            updated_by_user_id = ?2,
            updated_at = datetime('now')
        WHERE id = 1
        "#,
    )
    .bind(retention_count)
    .bind(actor_user_id)
    .execute(pool)
    .await?;
    prune_published_releases(pool, settings, retention_count).await?;
    get_settings(pool).await
}

pub async fn count_releases(pool: &SqlitePool) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM system_release_versions")
        .fetch_one(pool)
        .await
        .map_err(Into::into)
}

pub async fn list_releases_page(
    pool: &SqlitePool,
    pagination: Pagination,
) -> AppResult<Paginated<SystemReleaseVersionSummary>> {
    let pagination = normalize_pagination(pagination)?;
    let total_items = count_releases(pool).await?;
    let rows = sqlx::query_as::<_, ReleaseSummaryRow>(
        r#"
        SELECT
            r.id,
            r.version_name,
            r.title,
            r.notes,
            r.status,
            COALESCE(r.published_at, '') AS published_at,
            COALESCE(NULLIF(created_user.display_name, ''), created_user.username, '') AS created_by_display_name,
            COALESCE(NULLIF(updated_user.display_name, ''), updated_user.username, '') AS updated_by_display_name,
            r.created_at,
            r.updated_at,
            COALESCE(stats.asset_count, 0) AS asset_count,
            COALESCE(stats.platform_count, 0) AS platform_count
        FROM system_release_versions r
        LEFT JOIN users created_user ON created_user.id = r.created_by_user_id
        LEFT JOIN users updated_user ON updated_user.id = r.updated_by_user_id
        LEFT JOIN (
            SELECT
                release_id,
                COUNT(*) AS asset_count,
                COUNT(DISTINCT platform) AS platform_count
            FROM system_release_assets
            GROUP BY release_id
        ) stats ON stats.release_id = r.id
        ORDER BY
            CASE WHEN r.status = 'published' THEN 0 ELSE 1 END ASC,
            COALESCE(r.published_at, '') DESC,
            r.updated_at DESC,
            r.id DESC
        LIMIT ?1 OFFSET ?2
        "#,
    )
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    Ok(Paginated {
        items: rows.into_iter().map(release_summary_from_row).collect(),
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
}

pub async fn get_release_detail(
    pool: &SqlitePool,
    release_id: i64,
) -> AppResult<Option<SystemReleaseDetail>> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let release = get_release_summary(pool, release_id).await?;
    let Some(release) = release else {
        return Ok(None);
    };
    let assets = list_release_assets(pool, release_id).await?;
    Ok(Some(SystemReleaseDetail { release, assets }))
}

pub async fn create_release(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateSystemReleaseInput,
) -> AppResult<SystemReleaseDetail> {
    let version_name = validate_version_name(&input.version_name)?;
    let title = validate_title(&input.title)?;
    let notes = validate_notes(&input.notes)?;
    ensure_version_name_available(pool, &version_name, None).await?;

    let release_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_release_versions (
            version_name,
            title,
            notes,
            status,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES (?1, ?2, ?3, 'draft', ?4, ?4)
        RETURNING id
        "#,
    )
    .bind(&version_name)
    .bind(&title)
    .bind(&notes)
    .bind(actor_user_id)
    .fetch_one(pool)
    .await?;

    get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本创建后未找到".to_string()))
}

pub async fn update_release(
    pool: &SqlitePool,
    settings: &Settings,
    actor_user_id: i64,
    release_id: i64,
    input: UpdateSystemReleaseInput,
) -> AppResult<SystemReleaseDetail> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let version_name = validate_version_name(&input.version_name)?;
    let title = validate_title(&input.title)?;
    let notes = validate_notes(&input.notes)?;
    ensure_version_name_available(pool, &version_name, Some(release_id)).await?;

    let current = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT status, COALESCE(published_at, '')
        FROM system_release_versions
        WHERE id = ?1
        "#,
    )
    .bind(release_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;

    let publish_now = current.0 == RELEASE_STATUS_DRAFT && input.publish;
    if publish_now {
        let uploaded_asset_count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM system_release_assets sa
            JOIN file_objects fo ON fo.id = sa.file_object_id
            WHERE sa.release_id = ?1
              AND fo.status = 'uploaded'
            "#,
        )
        .bind(release_id)
        .fetch_one(pool)
        .await?;
        if uploaded_asset_count <= 0 {
            return Err(AppError::BadRequest(
                "至少上传一个版本包后才能发布版本".to_string(),
            ));
        }
    }

    sqlx::query(
        r#"
        UPDATE system_release_versions
        SET version_name = ?2,
            title = ?3,
            notes = ?4,
            status = CASE
                WHEN status = 'draft' AND ?5 THEN 'published'
                ELSE status
            END,
            published_at = CASE
                WHEN status = 'draft' AND ?5 THEN datetime('now')
                ELSE published_at
            END,
            updated_by_user_id = ?6,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(release_id)
    .bind(&version_name)
    .bind(&title)
    .bind(&notes)
    .bind(publish_now)
    .bind(actor_user_id)
    .execute(pool)
    .await?;

    if publish_now {
        let retention = get_settings(pool).await?.retention_count;
        prune_published_releases(pool, settings, retention).await?;
    }

    get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))
}

pub async fn create_release_asset(
    pool: &SqlitePool,
    release_id: i64,
    input: CreateSystemReleaseAssetInput,
) -> AppResult<SystemReleaseAssetSummary> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let platform = validate_platform(&input.platform)?;
    let _release =
        sqlx::query_scalar::<_, i64>("SELECT id FROM system_release_versions WHERE id = ?1")
            .bind(release_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;
    let active_config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活，请先完成系统存储配置".to_string()))?;

    let file_object = files::create_file_object(
        pool,
        &active_config,
        CreateFileObjectInput {
            folder_id: None,
            original_filename: input.original_filename,
            content_type: input.content_type,
            byte_size: input.byte_size,
            created_by_user_id: input.created_by_user_id,
        },
    )
    .await?;

    let asset_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_release_assets (
            release_id,
            file_object_id,
            platform
        )
        VALUES (?1, ?2, ?3)
        RETURNING id
        "#,
    )
    .bind(release_id)
    .bind(file_object.id)
    .bind(platform)
    .fetch_one(pool)
    .await?;

    get_release_asset(pool, release_id, asset_id).await
}

pub async fn get_release_asset(
    pool: &SqlitePool,
    release_id: i64,
    asset_id: i64,
) -> AppResult<SystemReleaseAssetSummary> {
    if release_id <= 0 || asset_id <= 0 {
        return Err(AppError::BadRequest("版本资产 ID 无效".to_string()));
    }
    let row = sqlx::query_as::<_, ReleaseAssetRow>(
        r#"
        SELECT
            sa.id,
            sa.release_id,
            fo.id,
            sa.platform,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            sa.created_at
        FROM system_release_assets sa
        JOIN file_objects fo ON fo.id = sa.file_object_id
        WHERE sa.release_id = ?1
          AND sa.id = ?2
        "#,
    )
    .bind(release_id)
    .bind(asset_id)
    .fetch_optional(pool)
    .await?;

    row.map(release_asset_from_row)
        .ok_or_else(|| AppError::NotFound("版本资产不存在".to_string()))
}

pub async fn list_release_assets(
    pool: &SqlitePool,
    release_id: i64,
) -> AppResult<Vec<SystemReleaseAssetSummary>> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let rows = sqlx::query_as::<_, ReleaseAssetRow>(
        r#"
        SELECT
            sa.id,
            sa.release_id,
            fo.id,
            sa.platform,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            sa.created_at
        FROM system_release_assets sa
        JOIN file_objects fo ON fo.id = sa.file_object_id
        WHERE sa.release_id = ?1
        ORDER BY sa.created_at DESC, sa.id DESC
        "#,
    )
    .bind(release_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(release_asset_from_row).collect())
}

pub async fn mark_release_asset_uploaded(
    pool: &SqlitePool,
    release_id: i64,
    asset_id: i64,
) -> AppResult<SystemReleaseAssetSummary> {
    let asset = get_release_asset(pool, release_id, asset_id).await?;
    files::mark_file_uploaded(pool, asset.file_object_id).await?;
    get_release_asset(pool, release_id, asset_id).await
}

pub async fn delete_release_asset(
    pool: &SqlitePool,
    settings: &Settings,
    release_id: i64,
    asset_id: i64,
) -> AppResult<SystemReleaseAssetSummary> {
    let asset = get_release_asset(pool, release_id, asset_id).await?;
    storage::delete_object_if_exists(pool, settings, &asset.object_key).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM system_release_assets WHERE id = ?1 AND release_id = ?2")
        .bind(asset_id)
        .bind(release_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM file_objects WHERE id = ?1")
        .bind(asset.file_object_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(asset)
}

async fn get_release_summary(
    pool: &SqlitePool,
    release_id: i64,
) -> AppResult<Option<SystemReleaseVersionSummary>> {
    let row = sqlx::query_as::<_, ReleaseSummaryRow>(
        r#"
        SELECT
            r.id,
            r.version_name,
            r.title,
            r.notes,
            r.status,
            COALESCE(r.published_at, '') AS published_at,
            COALESCE(NULLIF(created_user.display_name, ''), created_user.username, '') AS created_by_display_name,
            COALESCE(NULLIF(updated_user.display_name, ''), updated_user.username, '') AS updated_by_display_name,
            r.created_at,
            r.updated_at,
            COALESCE(stats.asset_count, 0) AS asset_count,
            COALESCE(stats.platform_count, 0) AS platform_count
        FROM system_release_versions r
        LEFT JOIN users created_user ON created_user.id = r.created_by_user_id
        LEFT JOIN users updated_user ON updated_user.id = r.updated_by_user_id
        LEFT JOIN (
            SELECT
                release_id,
                COUNT(*) AS asset_count,
                COUNT(DISTINCT platform) AS platform_count
            FROM system_release_assets
            GROUP BY release_id
        ) stats ON stats.release_id = r.id
        WHERE r.id = ?1
        "#,
    )
    .bind(release_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(release_summary_from_row))
}

async fn prune_published_releases(
    pool: &SqlitePool,
    settings: &Settings,
    retention_count: i64,
) -> AppResult<()> {
    let retention_count = validate_retention_count(retention_count)?;
    let release_ids = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT id
        FROM system_release_versions
        WHERE status = 'published'
        ORDER BY published_at DESC, id DESC
        LIMIT -1 OFFSET ?1
        "#,
    )
    .bind(retention_count)
    .fetch_all(pool)
    .await?;

    if release_ids.is_empty() {
        return Ok(());
    }

    let assets = sqlx::query_as::<_, ReleaseAssetObjectRow>(
        r#"
        SELECT
            sa.id,
            sa.release_id,
            fo.id,
            fo.object_key
        FROM system_release_assets sa
        JOIN file_objects fo ON fo.id = sa.file_object_id
        WHERE sa.release_id IN (
            SELECT id
            FROM system_release_versions
            WHERE status = 'published'
            ORDER BY published_at DESC, id DESC
            LIMIT -1 OFFSET ?1
        )
        "#,
    )
    .bind(retention_count)
    .fetch_all(pool)
    .await?;

    for asset in &assets {
        storage::delete_object_if_exists(pool, settings, &asset.3).await?;
    }

    let mut tx = pool.begin().await?;
    for asset in &assets {
        sqlx::query("DELETE FROM file_objects WHERE id = ?1")
            .bind(asset.2)
            .execute(&mut *tx)
            .await?;
    }
    for release_id in &release_ids {
        sqlx::query("DELETE FROM system_release_versions WHERE id = ?1")
            .bind(release_id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn ensure_settings_row(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO system_release_settings (id, retention_count)
        VALUES (1, ?1)
        ON CONFLICT(id) DO NOTHING
        "#,
    )
    .bind(DEFAULT_RETENTION_COUNT)
    .execute(pool)
    .await?;
    Ok(())
}

async fn ensure_version_name_available(
    pool: &SqlitePool,
    version_name: &str,
    exclude_id: Option<i64>,
) -> AppResult<()> {
    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM system_release_versions
        WHERE version_name = ?1
          AND (?2 IS NULL OR id <> ?2)
        "#,
    )
    .bind(version_name)
    .bind(exclude_id)
    .fetch_one(pool)
    .await?;
    if existing_count > 0 {
        return Err(AppError::Conflict(format!(
            "版本号 {} 已存在",
            version_name
        )));
    }
    Ok(())
}

fn validate_version_name(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 64 {
        return Err(AppError::BadRequest(
            "版本号不能为空且不能超过 64 个字符".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn validate_title(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.len() > 160 {
        return Err(AppError::BadRequest(
            "版本标题不能超过 160 个字符".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn validate_notes(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.len() > 20_000 {
        return Err(AppError::BadRequest(
            "版本说明不能超过 20000 个字符".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn validate_platform(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        RELEASE_PLATFORM_WINDOWS => Ok(RELEASE_PLATFORM_WINDOWS),
        RELEASE_PLATFORM_MACOS => Ok(RELEASE_PLATFORM_MACOS),
        RELEASE_PLATFORM_LINUX => Ok(RELEASE_PLATFORM_LINUX),
        RELEASE_PLATFORM_ANDROID => Ok(RELEASE_PLATFORM_ANDROID),
        RELEASE_PLATFORM_IOS => Ok(RELEASE_PLATFORM_IOS),
        _ => Err(AppError::BadRequest(
            "平台只能是 windows / macos / linux / android / ios".to_string(),
        )),
    }
}

fn validate_retention_count(value: i64) -> AppResult<i64> {
    if !(MIN_RETENTION_COUNT..=MAX_RETENTION_COUNT).contains(&value) {
        return Err(AppError::BadRequest(format!(
            "版本保留数必须在 {} 到 {} 之间",
            MIN_RETENTION_COUNT, MAX_RETENTION_COUNT
        )));
    }
    Ok(value)
}

fn normalize_pagination(pagination: Pagination) -> AppResult<Pagination> {
    let page = pagination.page.max(1);
    let per_page = pagination.per_page.clamp(10, 100);
    Ok(Pagination { page, per_page })
}

fn release_summary_from_row(row: ReleaseSummaryRow) -> SystemReleaseVersionSummary {
    SystemReleaseVersionSummary {
        id: row.0,
        version_name: row.1,
        title: row.2,
        notes: row.3,
        status: row.4,
        published_at: row.5,
        created_by_display_name: row.6,
        updated_by_display_name: row.7,
        created_at: row.8,
        updated_at: row.9,
        asset_count: row.10,
        platform_count: row.11,
    }
}

fn release_asset_from_row(row: ReleaseAssetRow) -> SystemReleaseAssetSummary {
    SystemReleaseAssetSummary {
        id: row.0,
        release_id: row.1,
        file_object_id: row.2,
        platform: row.3,
        object_key: row.4,
        original_filename: row.5,
        content_type: row.6,
        byte_size: row.7,
        status: row.8,
        created_at: row.9,
    }
}

type ReleaseSummaryRow = (
    i64,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    i64,
    i64,
);

type ReleaseAssetRow = (
    i64,
    i64,
    i64,
    String,
    String,
    String,
    String,
    i64,
    String,
    String,
);
type ReleaseAssetObjectRow = (i64, i64, i64, String);
