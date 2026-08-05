use std::collections::HashSet;

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
pub const RELEASE_STATUS_WITHDRAWN: &str = "withdrawn";

pub const RELEASE_CHANNEL_LEGACY: &str = "legacy";
pub const RELEASE_CHANNEL_INTERNAL: &str = "internal";

pub const RELEASE_VERIFICATION_UNVERIFIED: &str = "unverified";
pub const RELEASE_VERIFICATION_PENDING: &str = "pending";
pub const RELEASE_VERIFICATION_VERIFIED: &str = "verified";

pub const RELEASE_PLATFORM_WINDOWS: &str = "windows";
pub const RELEASE_PLATFORM_MACOS: &str = "macos";
pub const RELEASE_PLATFORM_LINUX: &str = "linux";
pub const RELEASE_PLATFORM_ANDROID: &str = "android";
pub const RELEASE_PLATFORM_IOS: &str = "ios";

pub const RELEASE_ARCHITECTURE_X64: &str = "x64";
pub const RELEASE_ARCHITECTURE_ARM64: &str = "arm64";
pub const RELEASE_ARCHITECTURE_UNIVERSAL: &str = "universal";

pub const RELEASE_ARTIFACT_INSTALLER: &str = "installer";
pub const RELEASE_ARTIFACT_SIGNATURE: &str = "signature";
pub const RELEASE_ARTIFACT_SBOM: &str = "sbom";
pub const RELEASE_ARTIFACT_MANIFEST: &str = "manifest";
pub const RELEASE_ARTIFACT_CHECKSUMS: &str = "checksums";

const DESKTOP_RELEASE_PLATFORMS: [&str; 3] = [
    RELEASE_PLATFORM_WINDOWS,
    RELEASE_PLATFORM_MACOS,
    RELEASE_PLATFORM_LINUX,
];

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
    pub channel: String,
    pub verification_status: String,
    pub manifest_sha256: String,
    pub signing_key_id: String,
    pub source_commit: String,
    pub source_tag: String,
    pub published_at: String,
    pub verified_at: String,
    pub withdrawn_at: String,
    pub withdrawal_reason: String,
    pub github_withdrawal_status: String,
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
    pub architecture: String,
    pub artifact_kind: String,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
    pub checksum_sha256: String,
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
    pub channel: String,
    pub manifest_sha256: String,
    pub signing_key_id: String,
    pub source_commit: String,
    pub source_tag: String,
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
    pub architecture: String,
    pub artifact_kind: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub checksum_sha256: String,
    pub created_by_user_id: i64,
}

#[derive(Debug, Clone)]
pub struct WithdrawSystemReleaseInput {
    pub reason: String,
    pub github_withdrawal_status: String,
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
            CASE WHEN r.withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE r.status END AS effective_status,
            r.channel,
            r.verification_status,
            r.manifest_sha256,
            r.signing_key_id,
            r.source_commit,
            r.source_tag,
            COALESCE(r.published_at, '') AS published_at,
            COALESCE(r.verified_at, '') AS verified_at,
            COALESCE(r.withdrawn_at, '') AS withdrawn_at,
            r.withdrawal_reason,
            r.github_withdrawal_status,
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

pub async fn get_latest_published_release_detail(
    pool: &SqlitePool,
) -> AppResult<Option<SystemReleaseDetail>> {
    let release_ids = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT id
        FROM system_release_versions
        WHERE status = 'published'
          AND withdrawn_at IS NULL
          AND (channel = 'legacy' OR verification_status = 'verified')
        ORDER BY published_at DESC, id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    for release_id in release_ids {
        let Some(detail) = get_release_detail(pool, release_id).await? else {
            continue;
        };
        if has_complete_desktop_downloads(&detail.assets) {
            return Ok(Some(detail));
        }
    }

    Ok(None)
}

pub async fn get_published_release_asset(
    pool: &SqlitePool,
    release_id: i64,
    asset_id: i64,
) -> AppResult<SystemReleaseAssetSummary> {
    let asset = get_release_asset(pool, release_id, asset_id).await?;
    let published = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM system_release_versions WHERE id = ?1 AND status = 'published' AND withdrawn_at IS NULL",
    )
    .bind(release_id)
    .fetch_one(pool)
    .await?;
    if published <= 0 || asset.status != "uploaded" {
        return Err(AppError::NotFound("版本安装包不存在".to_string()));
    }
    Ok(asset)
}

pub async fn create_release(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateSystemReleaseInput,
) -> AppResult<SystemReleaseDetail> {
    let version_name = validate_version_name(&input.version_name)?;
    let title = validate_title(&input.title)?;
    let notes = validate_notes(&input.notes)?;
    let channel = validate_channel(&input.channel)?;
    let verification = validate_release_verification_input(
        channel,
        &input.manifest_sha256,
        &input.signing_key_id,
        &input.source_commit,
        &input.source_tag,
    )?;
    ensure_version_name_available(pool, &version_name, None).await?;

    let release_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_release_versions (
            version_name,
            title,
            notes,
            status,
            channel,
            verification_status,
            manifest_sha256,
            signing_key_id,
            source_commit,
            source_tag,
            created_by_user_id,
            updated_by_user_id
        )
        VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
        RETURNING id
        "#,
    )
    .bind(&version_name)
    .bind(&title)
    .bind(&notes)
    .bind(channel)
    .bind(verification.0)
    .bind(verification.1)
    .bind(verification.2)
    .bind(verification.3)
    .bind(verification.4)
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

    let current = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT status, channel, verification_status, withdrawn_at, version_name, title, notes
        FROM system_release_versions
        WHERE id = ?1
        "#,
    )
    .bind(release_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;

    if current.3.is_some() {
        return Err(AppError::Conflict(
            "已撤回版本不能修改或重新发布".to_string(),
        ));
    }
    if current.0 == RELEASE_STATUS_PUBLISHED
        && (current.4 != version_name || current.5 != title || current.6 != notes)
    {
        return Err(AppError::Conflict(
            "已发布版本不可修改；请创建新版本或显式撤回".to_string(),
        ));
    }
    let publish_now = current.0 == RELEASE_STATUS_DRAFT && input.publish;
    if publish_now {
        if current.1 == RELEASE_CHANNEL_INTERNAL && current.2 != RELEASE_VERIFICATION_VERIFIED {
            return Err(AppError::Conflict(
                "内部版本必须完成发行证据验证后才能发布".to_string(),
            ));
        }
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
        if current.1 == RELEASE_CHANNEL_INTERNAL {
            let assets = list_release_assets(pool, release_id).await?;
            if !has_complete_desktop_downloads(&assets) {
                return Err(AppError::BadRequest(
                    "内部桌面版本必须上传完整六平台架构安装包后才能发布".to_string(),
                ));
            }
        }
    }

    let result = sqlx::query(
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
          AND withdrawn_at IS NULL
          AND status = ?7
        "#,
    )
    .bind(release_id)
    .bind(&version_name)
    .bind(&title)
    .bind(&notes)
    .bind(publish_now)
    .bind(actor_user_id)
    .bind(&current.0)
    .execute(pool)
    .await?;

    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "版本状态已变化，请刷新后重试".to_string(),
        ));
    }

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
    let architecture = validate_architecture(&input.architecture)?;
    let artifact_kind = validate_artifact_kind(&input.artifact_kind)?;
    let release_status = sqlx::query_as::<_, (String, Option<String>, String, String)>(
        "SELECT status, withdrawn_at, channel, verification_status FROM system_release_versions WHERE id = ?1",
    )
    .bind(release_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;
    if release_status.0 != RELEASE_STATUS_DRAFT
        || release_status.1.is_some()
        || (release_status.2 == RELEASE_CHANNEL_INTERNAL
            && release_status.3 == RELEASE_VERIFICATION_VERIFIED)
    {
        return Err(AppError::Conflict(
            "只有未撤回的草稿版本可以新增资产".to_string(),
        ));
    }
    if release_status.2 == RELEASE_CHANNEL_INTERNAL
        && (input.checksum_sha256.len() != 64
            || !input
                .checksum_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
    {
        return Err(AppError::BadRequest(
            "内部发行资产必须提供 64 位小写 SHA-256".to_string(),
        ));
    }
    let active_config = storage::active_config(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("对象存储未激活，请先完成系统存储配置".to_string()))?;

    let file_object = files::create_file_object_with_checksum(
        pool,
        &active_config,
        CreateFileObjectInput {
            folder_id: None,
            original_filename: input.original_filename,
            content_type: input.content_type,
            byte_size: input.byte_size,
            created_by_user_id: input.created_by_user_id,
        },
        &input.checksum_sha256,
    )
    .await?;

    let asset_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO system_release_assets (
            release_id,
            file_object_id,
            platform,
            architecture,
            artifact_kind
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING id
        "#,
    )
    .bind(release_id)
    .bind(file_object.id)
    .bind(platform)
    .bind(architecture)
    .bind(artifact_kind)
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
            fo.id AS file_object_id,
            sa.platform,
            sa.architecture,
            sa.artifact_kind,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            fo.checksum_sha256,
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
            fo.id AS file_object_id,
            sa.platform,
            sa.architecture,
            sa.artifact_kind,
            fo.object_key,
            fo.original_filename,
            fo.content_type,
            fo.byte_size,
            fo.status,
            fo.checksum_sha256,
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
    ensure_release_is_mutable(pool, release_id).await?;
    let asset = get_release_asset(pool, release_id, asset_id).await?;
    files::mark_file_uploaded(pool, asset.file_object_id).await?;
    get_release_asset(pool, release_id, asset_id).await
}

pub async fn mark_release_verified(
    pool: &SqlitePool,
    actor_user_id: i64,
    release_id: i64,
) -> AppResult<SystemReleaseDetail> {
    let detail = get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))?;
    if detail.release.status != RELEASE_STATUS_DRAFT
        || detail.release.channel != RELEASE_CHANNEL_INTERNAL
        || detail.release.verification_status != RELEASE_VERIFICATION_PENDING
    {
        return Err(AppError::Conflict(
            "只有待验证的内部草稿版本可以标记为已验证".to_string(),
        ));
    }
    if !has_complete_internal_evidence(&detail) {
        return Err(AppError::BadRequest(
            "完整 22 文件内部发行证据集上传后才能完成验证".to_string(),
        ));
    }
    let result = sqlx::query(
        r#"
        UPDATE system_release_versions
        SET verification_status = 'verified',
            verified_at = datetime('now'),
            updated_by_user_id = ?2,
            updated_at = datetime('now')
        WHERE id = ?1
          AND status = 'draft'
          AND channel = 'internal'
          AND verification_status = 'pending'
          AND withdrawn_at IS NULL
        "#,
    )
    .bind(release_id)
    .bind(actor_user_id)
    .execute(pool)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "版本验证状态已变化，请刷新后重试".to_string(),
        ));
    }
    get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))
}

pub async fn ensure_release_is_mutable(pool: &SqlitePool, release_id: i64) -> AppResult<()> {
    let mutable = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM system_release_versions WHERE id = ?1 AND status = 'draft' AND withdrawn_at IS NULL AND (channel = 'legacy' OR verification_status != 'verified')",
    )
    .bind(release_id)
    .fetch_one(pool)
    .await?;
    if mutable != 1 {
        return Err(AppError::Conflict(
            "只有未撤回的草稿版本可以修改资产".to_string(),
        ));
    }
    Ok(())
}

pub async fn withdraw_release(
    pool: &SqlitePool,
    actor_user_id: i64,
    release_id: i64,
    input: WithdrawSystemReleaseInput,
) -> AppResult<SystemReleaseDetail> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let reason = validate_withdrawal_reason(&input.reason)?;
    let github_status = validate_github_withdrawal_status(&input.github_withdrawal_status)?;
    let result = sqlx::query(
        r#"
        UPDATE system_release_versions
        SET withdrawn_at = datetime('now'),
            withdrawal_reason = ?2,
            withdrawn_by_user_id = ?3,
            github_withdrawal_status = ?4,
            updated_by_user_id = ?3,
            updated_at = datetime('now')
        WHERE id = ?1
          AND status = 'published'
          AND withdrawn_at IS NULL
        "#,
    )
    .bind(release_id)
    .bind(reason)
    .bind(actor_user_id)
    .bind(github_status)
    .execute(pool)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "只有尚未撤回的已发布版本可以撤回".to_string(),
        ));
    }
    get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))
}

pub async fn update_withdrawal_status(
    pool: &SqlitePool,
    actor_user_id: i64,
    release_id: i64,
    github_withdrawal_status: &str,
) -> AppResult<SystemReleaseDetail> {
    if release_id <= 0 {
        return Err(AppError::BadRequest("版本 ID 无效".to_string()));
    }
    let github_status = match github_withdrawal_status.trim() {
        "succeeded" => "succeeded",
        "failed" => "failed",
        "not_required" => "not_required",
        _ => {
            return Err(AppError::BadRequest(
                "GitHub 撤回结果只能是 succeeded / failed / not_required".to_string(),
            ));
        }
    };
    let result = sqlx::query(
        r#"
        UPDATE system_release_versions
        SET github_withdrawal_status = ?2,
            updated_by_user_id = ?3,
            updated_at = datetime('now')
        WHERE id = ?1
          AND withdrawn_at IS NOT NULL
          AND github_withdrawal_status = 'pending'
        "#,
    )
    .bind(release_id)
    .bind(github_status)
    .bind(actor_user_id)
    .execute(pool)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "版本未处于等待 GitHub 撤回结果状态".to_string(),
        ));
    }
    get_release_detail(pool, release_id)
        .await?
        .ok_or_else(|| AppError::NotFound("版本不存在".to_string()))
}

pub async fn delete_release_asset(
    pool: &SqlitePool,
    settings: &Settings,
    release_id: i64,
    asset_id: i64,
) -> AppResult<SystemReleaseAssetSummary> {
    let asset = get_release_asset(pool, release_id, asset_id).await?;
    ensure_release_is_mutable(pool, release_id).await?;
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
            CASE WHEN r.withdrawn_at IS NOT NULL THEN 'withdrawn' ELSE r.status END AS effective_status,
            r.channel,
            r.verification_status,
            r.manifest_sha256,
            r.signing_key_id,
            r.source_commit,
            r.source_tag,
            COALESCE(r.published_at, '') AS published_at,
            COALESCE(r.verified_at, '') AS verified_at,
            COALESCE(r.withdrawn_at, '') AS withdrawn_at,
            r.withdrawal_reason,
            r.github_withdrawal_status,
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
          AND withdrawn_at IS NULL
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
              AND withdrawn_at IS NULL
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

fn has_complete_desktop_downloads(assets: &[SystemReleaseAssetSummary]) -> bool {
    DESKTOP_RELEASE_PLATFORMS.iter().all(|platform| {
        let has_universal = assets.iter().any(|asset| {
            asset.status == "uploaded"
                && asset.artifact_kind == RELEASE_ARTIFACT_INSTALLER
                && asset.platform == *platform
                && asset.architecture == RELEASE_ARCHITECTURE_UNIVERSAL
        });
        has_universal
            || (assets.iter().any(|asset| {
                asset.status == "uploaded"
                    && asset.artifact_kind == RELEASE_ARTIFACT_INSTALLER
                    && asset.platform == *platform
                    && asset.architecture == RELEASE_ARCHITECTURE_X64
            }) && assets.iter().any(|asset| {
                asset.status == "uploaded"
                    && asset.artifact_kind == RELEASE_ARTIFACT_INSTALLER
                    && asset.platform == *platform
                    && asset.architecture == RELEASE_ARCHITECTURE_ARM64
            }))
    })
}

fn has_complete_internal_evidence(detail: &SystemReleaseDetail) -> bool {
    let assets = &detail.assets;
    if assets.len() != 22 || assets.iter().any(|asset| asset.status != "uploaded") {
        return false;
    }
    let installers = assets
        .iter()
        .filter(|asset| asset.artifact_kind == RELEASE_ARTIFACT_INSTALLER)
        .collect::<Vec<_>>();
    if installers.len() != 6 || !has_complete_desktop_downloads(assets) {
        return false;
    }
    let mut expected = HashSet::new();
    for installer in installers {
        expected.insert((
            installer.original_filename.clone(),
            RELEASE_ARTIFACT_INSTALLER,
        ));
        expected.insert((
            format!("{}.minisig", installer.original_filename),
            RELEASE_ARTIFACT_SIGNATURE,
        ));
        expected.insert((
            format!("{}.cdx.json", installer.original_filename),
            RELEASE_ARTIFACT_SBOM,
        ));
    }
    expected.extend([
        (
            "release-manifest.json".to_string(),
            RELEASE_ARTIFACT_MANIFEST,
        ),
        (
            "release-manifest.json.minisig".to_string(),
            RELEASE_ARTIFACT_SIGNATURE,
        ),
        ("SHA256SUMS".to_string(), RELEASE_ARTIFACT_CHECKSUMS),
        ("SHA256SUMS.minisig".to_string(), RELEASE_ARTIFACT_SIGNATURE),
    ]);
    let actual = assets
        .iter()
        .map(|asset| {
            (
                asset.original_filename.clone(),
                asset.artifact_kind.as_str(),
            )
        })
        .collect::<HashSet<_>>();
    if expected.len() != 22 || actual != expected {
        return false;
    }
    assets.iter().any(|asset| {
        asset.original_filename == "release-manifest.json"
            && asset.checksum_sha256 == detail.release.manifest_sha256
    })
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

fn validate_channel(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        "" | RELEASE_CHANNEL_LEGACY => Ok(RELEASE_CHANNEL_LEGACY),
        RELEASE_CHANNEL_INTERNAL => Ok(RELEASE_CHANNEL_INTERNAL),
        _ => Err(AppError::BadRequest(
            "发行渠道只能是 legacy / internal".to_string(),
        )),
    }
}

fn validate_release_verification_input<'a>(
    channel: &str,
    manifest_sha256: &'a str,
    signing_key_id: &'a str,
    source_commit: &'a str,
    source_tag: &'a str,
) -> AppResult<(&'static str, String, String, String, String)> {
    if channel == RELEASE_CHANNEL_LEGACY {
        if [manifest_sha256, signing_key_id, source_commit, source_tag]
            .iter()
            .any(|value| !value.trim().is_empty())
        {
            return Err(AppError::BadRequest(
                "legacy 版本不能声明内部发行验证元数据".to_string(),
            ));
        }
        return Ok((
            RELEASE_VERIFICATION_UNVERIFIED,
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        ));
    }
    let manifest_sha256 = manifest_sha256.trim().to_ascii_lowercase();
    let signing_key_id = signing_key_id.trim().to_ascii_uppercase();
    let source_commit = source_commit.trim().to_ascii_lowercase();
    let source_tag = source_tag.trim();
    if manifest_sha256.len() != 64
        || !manifest_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        || signing_key_id.len() != 16
        || !signing_key_id.bytes().all(|byte| byte.is_ascii_hexdigit())
        || source_commit.len() != 40
        || !source_commit.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !source_tag.starts_with("desktop-v")
        || source_tag.len() > 96
    {
        return Err(AppError::BadRequest(
            "internal 版本的 manifest、签名 key、commit 或 tag 元数据无效".to_string(),
        ));
    }
    Ok((
        RELEASE_VERIFICATION_PENDING,
        manifest_sha256,
        signing_key_id,
        source_commit,
        source_tag.to_string(),
    ))
}

fn validate_withdrawal_reason(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 500 {
        return Err(AppError::BadRequest(
            "撤回原因不能为空且不能超过 500 个字符".to_string(),
        ));
    }
    Ok(value.to_string())
}

fn validate_github_withdrawal_status(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        "pending" => Ok("pending"),
        "succeeded" => Ok("succeeded"),
        "failed" => Ok("failed"),
        "not_required" => Ok("not_required"),
        _ => Err(AppError::BadRequest("GitHub 撤回状态无效".to_string())),
    }
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

fn validate_architecture(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        RELEASE_ARCHITECTURE_X64 => Ok(RELEASE_ARCHITECTURE_X64),
        RELEASE_ARCHITECTURE_ARM64 => Ok(RELEASE_ARCHITECTURE_ARM64),
        RELEASE_ARCHITECTURE_UNIVERSAL => Ok(RELEASE_ARCHITECTURE_UNIVERSAL),
        _ => Err(AppError::BadRequest(
            "架构只能是 x64 / arm64 / universal".to_string(),
        )),
    }
}

fn validate_artifact_kind(value: &str) -> AppResult<&'static str> {
    match value.trim() {
        "" | RELEASE_ARTIFACT_INSTALLER => Ok(RELEASE_ARTIFACT_INSTALLER),
        RELEASE_ARTIFACT_SIGNATURE => Ok(RELEASE_ARTIFACT_SIGNATURE),
        RELEASE_ARTIFACT_SBOM => Ok(RELEASE_ARTIFACT_SBOM),
        RELEASE_ARTIFACT_MANIFEST => Ok(RELEASE_ARTIFACT_MANIFEST),
        RELEASE_ARTIFACT_CHECKSUMS => Ok(RELEASE_ARTIFACT_CHECKSUMS),
        _ => Err(AppError::BadRequest("版本资产类型无效".to_string())),
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
        id: row.id,
        version_name: row.version_name,
        title: row.title,
        notes: row.notes,
        status: row.effective_status,
        channel: row.channel,
        verification_status: row.verification_status,
        manifest_sha256: row.manifest_sha256,
        signing_key_id: row.signing_key_id,
        source_commit: row.source_commit,
        source_tag: row.source_tag,
        published_at: row.published_at,
        verified_at: row.verified_at,
        withdrawn_at: row.withdrawn_at,
        withdrawal_reason: row.withdrawal_reason,
        github_withdrawal_status: row.github_withdrawal_status,
        created_by_display_name: row.created_by_display_name,
        updated_by_display_name: row.updated_by_display_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        asset_count: row.asset_count,
        platform_count: row.platform_count,
    }
}

fn release_asset_from_row(row: ReleaseAssetRow) -> SystemReleaseAssetSummary {
    SystemReleaseAssetSummary {
        id: row.id,
        release_id: row.release_id,
        file_object_id: row.file_object_id,
        platform: row.platform,
        architecture: row.architecture,
        artifact_kind: row.artifact_kind,
        object_key: row.object_key,
        original_filename: row.original_filename,
        content_type: row.content_type,
        byte_size: row.byte_size,
        status: row.status,
        checksum_sha256: row.checksum_sha256,
        created_at: row.created_at,
    }
}

#[derive(sqlx::FromRow)]
struct ReleaseSummaryRow {
    id: i64,
    version_name: String,
    title: String,
    notes: String,
    effective_status: String,
    channel: String,
    verification_status: String,
    manifest_sha256: String,
    signing_key_id: String,
    source_commit: String,
    source_tag: String,
    published_at: String,
    verified_at: String,
    withdrawn_at: String,
    withdrawal_reason: String,
    github_withdrawal_status: String,
    created_by_display_name: String,
    updated_by_display_name: String,
    created_at: String,
    updated_at: String,
    asset_count: i64,
    platform_count: i64,
}

#[derive(sqlx::FromRow)]
struct ReleaseAssetRow {
    id: i64,
    release_id: i64,
    file_object_id: i64,
    platform: String,
    architecture: String,
    artifact_kind: String,
    object_key: String,
    original_filename: String,
    content_type: String,
    byte_size: i64,
    status: String,
    checksum_sha256: String,
    created_at: String,
}
type ReleaseAssetObjectRow = (i64, i64, i64, String);
