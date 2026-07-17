use chrono::Utc;
use serde::Serialize;
use sqlx::{AssertSqlSafe, Row, SqlitePool};

use crate::platform::error::AppResult;

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseStatsSnapshot {
    pub refreshed_at: String,
    pub tables: Vec<DatabaseTableStat>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseTableStat {
    pub table_name: String,
    pub remark: String,
    pub row_count: i64,
    pub column_count: usize,
    pub columns: Vec<DatabaseColumnStat>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseColumnStat {
    pub name: String,
    pub data_type: String,
    pub required: bool,
    pub primary_key: bool,
    pub default_value: String,
}

pub async fn build_snapshot(pool: &SqlitePool) -> AppResult<DatabaseStatsSnapshot> {
    let table_names = sqlx::query_scalar::<_, String>(
        r#"
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_sqlx_%'
        ORDER BY name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::with_capacity(table_names.len());
    for table_name in table_names {
        let quoted_table = quote_sqlite_identifier(&table_name);
        let row_count = sqlx::query_scalar::<_, i64>(AssertSqlSafe(format!(
            "SELECT COUNT(*) FROM {quoted_table}"
        )))
        .fetch_one(pool)
        .await?;
        let pragma = format!("PRAGMA table_info({quoted_table})");
        let columns = sqlx::query(AssertSqlSafe(pragma))
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|row| {
                let primary_key = row.get::<i64, _>("pk") != 0;
                DatabaseColumnStat {
                    name: row.get::<String, _>("name"),
                    data_type: row.get::<String, _>("type"),
                    required: row.get::<i64, _>("notnull") != 0 || primary_key,
                    primary_key,
                    default_value: row
                        .try_get::<Option<String>, _>("dflt_value")
                        .ok()
                        .flatten()
                        .unwrap_or_default(),
                }
            })
            .collect::<Vec<_>>();
        tables.push(DatabaseTableStat {
            table_name: table_name.clone(),
            remark: table_remark(&table_name).to_string(),
            row_count,
            column_count: columns.len(),
            columns,
        });
    }

    Ok(DatabaseStatsSnapshot {
        refreshed_at: Utc::now().to_rfc3339(),
        tables,
    })
}

fn quote_sqlite_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn table_remark(table_name: &str) -> &'static str {
    match table_name {
        "users" => "用户账号",
        "app_bootstrap" => "系统初始化状态",
        "roles" => "角色定义",
        "permissions" => "权限点定义",
        "user_roles" => "用户与角色关系",
        "role_permissions" => "角色与权限关系",
        "sessions" => "网页访问会话",
        "audit_logs" => "系统审计日志",
        "storage_configs" => "当前对象存储配置",
        "storage_config_versions" => "对象存储配置版本",
        "projects" => "项目主表",
        "project_members" => "项目成员关系",
        "work_items" => "需求 / 任务 / Bug 主表",
        "work_item_comments" => "工作项评论与流转记录",
        "project_activities" => "项目活动流水",
        "user_project_preferences" => "用户项目偏好",
        "file_objects" => "文件对象元数据",
        "file_attachments" => "文件关联关系",
        "notifications" => "站内消息通知",
        "file_folders" => "项目文件夹",
        "project_resources" => "项目资料库",
        "api_tokens" => "OpenAPI 访问令牌",
        "refresh_sessions" => "登录刷新会话",
        _ => "业务表（备注待补充）",
    }
}
