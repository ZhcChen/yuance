use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::platform::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationSummary {
    pub id: i64,
    pub kind: String,
    pub work_item_key: String,
    pub comment_id: Option<i64>,
    pub title: String,
    pub body: String,
    pub actor_display_name: String,
    pub read_at: String,
    pub created_at: String,
}

pub struct CreateNotification<'a> {
    pub recipient_user_id: i64,
    pub actor_user_id: i64,
    pub actor_display_name_snapshot: &'a str,
    pub kind: &'a str,
    pub work_item_id: i64,
    pub comment_id: Option<i64>,
    pub title: &'a str,
    pub body: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationFilter {
    All,
    Unread,
    Read,
}

impl NotificationFilter {
    fn as_query_value(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Unread => "unread",
            Self::Read => "read",
        }
    }
}

pub async fn create_in_transaction(
    tx: &mut Transaction<'_, Sqlite>,
    input: CreateNotification<'_>,
) -> AppResult<()> {
    if input.recipient_user_id == input.actor_user_id
        && input.actor_display_name_snapshot.trim().is_empty()
    {
        return Ok(());
    }
    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id, actor_user_id, actor_display_name_snapshot, kind, work_item_id, comment_id, title, body
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
    )
    .bind(input.recipient_user_id)
    .bind(input.actor_user_id)
    .bind(input.actor_display_name_snapshot.trim())
    .bind(input.kind)
    .bind(input.work_item_id)
    .bind(input.comment_id)
    .bind(input.title)
    .bind(input.body)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn list_for_user(
    pool: &SqlitePool,
    user_id: i64,
    unread_only: bool,
    limit: i64,
) -> AppResult<Vec<NotificationSummary>> {
    let limit = limit.clamp(1, 100);
    let filter = if unread_only {
        NotificationFilter::Unread
    } else {
        NotificationFilter::All
    };
    list_for_user_window(pool, user_id, filter, limit, 0).await
}

pub async fn list_for_user_page(
    pool: &SqlitePool,
    user_id: i64,
    unread_only: bool,
    page: i64,
    per_page: i64,
) -> AppResult<Vec<NotificationSummary>> {
    let filter = if unread_only {
        NotificationFilter::Unread
    } else {
        NotificationFilter::All
    };
    list_for_user_page_filtered(pool, user_id, filter, page, per_page).await
}

pub async fn list_for_user_page_filtered(
    pool: &SqlitePool,
    user_id: i64,
    filter: NotificationFilter,
    page: i64,
    per_page: i64,
) -> AppResult<Vec<NotificationSummary>> {
    let page = page.max(1);
    let per_page = per_page.clamp(1, 100);
    let offset = (page - 1).saturating_mul(per_page);
    list_for_user_window(pool, user_id, filter, per_page, offset).await
}

async fn list_for_user_window(
    pool: &SqlitePool,
    user_id: i64,
    filter: NotificationFilter,
    limit: i64,
    offset: i64,
) -> AppResult<Vec<NotificationSummary>> {
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            Option<i64>,
            String,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            n.id,
            n.kind,
            wi.item_key,
            CASE
                WHEN n.comment_id IS NULL THEN NULL
                WHEN c.id IS NULL THEN NULL
                ELSE n.comment_id
            END,
            n.title,
            n.body,
            COALESCE(NULLIF(n.actor_display_name_snapshot, ''), actor.display_name, ''),
            COALESCE(n.read_at, ''),
            n.created_at
        FROM notifications n
        JOIN work_items wi ON wi.id = n.work_item_id
        LEFT JOIN work_item_comments c
            ON c.id = n.comment_id
           AND c.work_item_id = n.work_item_id
           AND c.deleted_at IS NULL
        LEFT JOIN users actor ON actor.id = n.actor_user_id
        WHERE n.recipient_user_id = ?1
          AND (
              ?2 = 'all'
              OR (?2 = 'unread' AND n.read_at IS NULL)
              OR (?2 = 'read' AND n.read_at IS NOT NULL)
          )
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?3
        OFFSET ?4
        "#,
    )
    .bind(user_id)
    .bind(filter.as_query_value())
    .bind(limit)
    .bind(offset.max(0))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| NotificationSummary {
            id: row.0,
            kind: row.1,
            work_item_key: row.2,
            comment_id: row.3,
            title: row.4,
            body: row.5,
            actor_display_name: row.6,
            read_at: row.7,
            created_at: row.8,
        })
        .collect())
}

pub async fn count_for_user(pool: &SqlitePool, user_id: i64, unread_only: bool) -> AppResult<i64> {
    let filter = if unread_only {
        NotificationFilter::Unread
    } else {
        NotificationFilter::All
    };
    count_for_user_filtered(pool, user_id, filter).await
}

pub async fn count_for_user_filtered(
    pool: &SqlitePool,
    user_id: i64,
    filter: NotificationFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM notifications
        WHERE recipient_user_id = ?1
          AND (
              ?2 = 'all'
              OR (?2 = 'unread' AND read_at IS NULL)
              OR (?2 = 'read' AND read_at IS NOT NULL)
          )
        "#,
    )
    .bind(user_id)
    .bind(filter.as_query_value())
    .fetch_one(pool)
    .await?)
}

pub async fn unread_count(pool: &SqlitePool, user_id: i64) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM notifications WHERE recipient_user_id = ?1 AND read_at IS NULL",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?)
}

pub async fn mark_read(
    pool: &SqlitePool,
    user_id: i64,
    notification_id: i64,
) -> AppResult<NotificationSummary> {
    let result = sqlx::query(
        "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?1 AND recipient_user_id = ?2",
    )
    .bind(notification_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("消息不存在".to_string()));
    }
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            Option<i64>,
            String,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            n.id,
            n.kind,
            wi.item_key,
            CASE
                WHEN n.comment_id IS NULL THEN NULL
                WHEN c.id IS NULL THEN NULL
                ELSE n.comment_id
            END,
            n.title,
            n.body,
            COALESCE(actor.display_name, ''), COALESCE(n.read_at, ''), n.created_at
        FROM notifications n
        JOIN work_items wi ON wi.id = n.work_item_id
        LEFT JOIN work_item_comments c
            ON c.id = n.comment_id
           AND c.work_item_id = n.work_item_id
           AND c.deleted_at IS NULL
        LEFT JOIN users actor ON actor.id = n.actor_user_id
        WHERE n.id = ?1 AND n.recipient_user_id = ?2
        "#,
    )
    .bind(notification_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(NotificationSummary {
        id: row.0,
        kind: row.1,
        work_item_key: row.2,
        comment_id: row.3,
        title: row.4,
        body: row.5,
        actor_display_name: row.6,
        read_at: row.7,
        created_at: row.8,
    })
}

pub async fn mark_all_read(pool: &SqlitePool, user_id: i64) -> AppResult<u64> {
    Ok(sqlx::query(
        "UPDATE notifications SET read_at = datetime('now') WHERE recipient_user_id = ?1 AND read_at IS NULL",
    )
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected())
}
