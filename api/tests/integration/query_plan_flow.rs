//! 高频查询走索引的回归保护（体检 P1-4）。

use crate::support::test_pool;

async fn plan(pool: &sqlx::SqlitePool, sql: &str) -> String {
    let rows: Vec<(i64, i64, i64, String)> =
        sqlx::query_as(sqlx::AssertSqlSafe(format!("EXPLAIN QUERY PLAN {sql}")))
            .fetch_all(pool)
            .await
            .expect("query plan");
    rows.into_iter()
        .map(|row| row.3)
        .collect::<Vec<_>>()
        .join(" | ")
}

#[tokio::test]
async fn work_item_activity_lookup_uses_target_index() {
    let pool = test_pool().await;
    let detail = plan(
        &pool,
        "SELECT COUNT(*) FROM project_activities pa WHERE pa.target_type = 'work_item' AND pa.target_id = 'YCE-TASK-2' AND pa.action = 'work_item.updated'",
    )
    .await;
    assert!(detail.contains("idx_project_activities_target"), "{detail}");
    assert!(!detail.contains("SCAN pa"), "{detail}");
}

#[tokio::test]
async fn audit_log_page_uses_created_index() {
    let pool = test_pool().await;
    let detail = plan(
        &pool,
        "SELECT al.id FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ORDER BY al.created_at DESC, al.id DESC LIMIT 20 OFFSET 0",
    )
    .await;
    assert!(detail.contains("idx_audit_logs_created"), "{detail}");
    assert!(!detail.contains("USE TEMP B-TREE FOR ORDER BY"), "{detail}");
}
