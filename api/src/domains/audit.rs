use sqlx::SqlitePool;

use crate::platform::error::AppResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditLogSummary {
    pub id: i64,
    pub actor_display_name: String,
    pub actor_username: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub metadata: String,
    pub created_at: String,
}

pub async fn record(
    pool: &SqlitePool,
    actor_user_id: Option<i64>,
    action: &str,
    target_type: &str,
    target_id: &str,
    metadata: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO audit_logs (
            actor_user_id,
            action,
            target_type,
            target_id,
            metadata
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
    )
    .bind(actor_user_id)
    .bind(action.trim())
    .bind(target_type.trim())
    .bind(target_id.trim())
    .bind(metadata.trim())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_recent(pool: &SqlitePool, limit: i64) -> AppResult<Vec<AuditLogSummary>> {
    let limit = limit.clamp(1, 100);
    let rows = sqlx::query_as::<_, (i64, String, String, String, String, String, String, String)>(
        r#"
        SELECT
            al.id,
            COALESCE(u.display_name, '系统') AS actor_display_name,
            COALESCE(u.username, '') AS actor_username,
            al.action,
            al.target_type,
            al.target_id,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
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
                created_at,
            )| AuditLogSummary {
                id,
                actor_display_name,
                actor_username,
                action,
                target_type,
                target_id,
                metadata,
                created_at,
            },
        )
        .collect())
}
