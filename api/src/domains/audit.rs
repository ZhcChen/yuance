use sqlx::SqlitePool;

use crate::platform::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditLogSummary {
    pub id: i64,
    pub actor_display_name: String,
    pub actor_username: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub metadata: String,
    pub ip: String,
    pub user_agent: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuditLogFilter {
    pub actor: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AuditContext {
    pub ip: String,
    pub user_agent: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedAuditLogFilter {
    actor_like: String,
    action: String,
    target_type: String,
    target_id_like: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaginatedAuditLogs {
    pub items: Vec<AuditLogSummary>,
    pub page: i64,
    pub per_page: i64,
    pub total_items: i64,
}

impl PaginatedAuditLogs {
    pub fn total_pages(&self) -> i64 {
        if self.total_items == 0 {
            1
        } else {
            (self.total_items + self.per_page - 1) / self.per_page
        }
    }
}

pub async fn record(
    pool: &SqlitePool,
    actor_user_id: Option<i64>,
    action: &str,
    target_type: &str,
    target_id: &str,
    metadata: &str,
) -> AppResult<()> {
    let context = AuditContext::default();
    record_with_context(
        pool,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata,
        &context,
    )
    .await
}

pub async fn record_with_context(
    pool: &SqlitePool,
    actor_user_id: Option<i64>,
    action: &str,
    target_type: &str,
    target_id: &str,
    metadata: &str,
    context: &AuditContext,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO audit_logs (
            actor_user_id,
            action,
            target_type,
            target_id,
            metadata,
            ip,
            user_agent
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
    )
    .bind(actor_user_id)
    .bind(action.trim())
    .bind(target_type.trim())
    .bind(target_id.trim())
    .bind(metadata.trim())
    .bind(context.ip.trim())
    .bind(context.user_agent.trim())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_recent(pool: &SqlitePool, limit: i64) -> AppResult<Vec<AuditLogSummary>> {
    let limit = limit.clamp(1, 100);
    let page = list_filtered(pool, AuditLogFilter::default(), 1, limit).await?;
    Ok(page.items)
}

pub async fn list_filtered(
    pool: &SqlitePool,
    filter: AuditLogFilter,
    page: i64,
    per_page: i64,
) -> AppResult<PaginatedAuditLogs> {
    let page = normalize_page(page)?;
    let per_page = normalize_per_page(per_page)?;
    let normalized = normalize_filter(filter)?;
    let total_items = count_filtered(pool, &normalized).await?;
    let rows = sqlx::query_as::<
        _,
        (
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
        ),
    >(
        r#"
        SELECT
            al.id,
            COALESCE(u.display_name, '系统') AS actor_display_name,
            COALESCE(u.username, '') AS actor_username,
            al.action,
            al.target_type,
            al.target_id,
            al.metadata,
            al.ip,
            al.user_agent,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE (?1 = '' OR u.username LIKE ?1 OR u.display_name LIKE ?1)
          AND (?2 = '' OR al.action = ?2)
          AND (?3 = '' OR al.target_type = ?3)
          AND (?4 = '' OR al.target_id LIKE ?4)
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ?5 OFFSET ?6
        "#,
    )
    .bind(&normalized.actor_like)
    .bind(&normalized.action)
    .bind(&normalized.target_type)
    .bind(&normalized.target_id_like)
    .bind(per_page)
    .bind((page - 1).saturating_mul(per_page))
    .fetch_all(pool)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                actor_display_name,
                actor_username,
                action,
                target_type,
                target_id,
                metadata,
                ip,
                user_agent,
                created_at,
            )| AuditLogSummary {
                id,
                actor_display_name,
                actor_username,
                action,
                target_type,
                target_id,
                metadata,
                ip,
                user_agent,
                created_at,
            },
        )
        .collect();

    Ok(PaginatedAuditLogs {
        items,
        page,
        per_page,
        total_items,
    })
}

async fn count_filtered(
    pool: &SqlitePool,
    normalized: &NormalizedAuditLogFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE (?1 = '' OR u.username LIKE ?1 OR u.display_name LIKE ?1)
          AND (?2 = '' OR al.action = ?2)
          AND (?3 = '' OR al.target_type = ?3)
          AND (?4 = '' OR al.target_id LIKE ?4)
        "#,
    )
    .bind(&normalized.actor_like)
    .bind(&normalized.action)
    .bind(&normalized.target_type)
    .bind(&normalized.target_id_like)
    .fetch_one(pool)
    .await?)
}

fn normalize_filter(filter: AuditLogFilter) -> AppResult<NormalizedAuditLogFilter> {
    let actor = validate_filter_text("操作人", &filter.actor, 80)?;
    let target_id = validate_filter_text("对象 ID", &filter.target_id, 120)?;
    Ok(NormalizedAuditLogFilter {
        actor_like: like_value(&actor),
        action: validate_filter_text("动作", &filter.action, 120)?,
        target_type: validate_filter_text("对象类型", &filter.target_type, 80)?,
        target_id_like: like_value(&target_id),
    })
}

fn normalize_page(page: i64) -> AppResult<i64> {
    if page < 1 {
        return Err(AppError::BadRequest("页码不能小于 1".to_string()));
    }
    Ok(page)
}

fn normalize_per_page(per_page: i64) -> AppResult<i64> {
    if !(1..=100).contains(&per_page) {
        return Err(AppError::BadRequest(
            "每页数量必须在 1-100 之间".to_string(),
        ));
    }
    Ok(per_page)
}

fn validate_filter_text(label: &str, value: &str, max_chars: usize) -> AppResult<String> {
    let value = value.trim();
    if value.chars().count() > max_chars {
        return Err(AppError::BadRequest(format!(
            "{label}不能超过 {max_chars} 个字符"
        )));
    }
    Ok(value.to_string())
}

fn like_value(value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        format!("%{value}%")
    }
}
