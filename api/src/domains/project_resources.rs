use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite, SqlitePool, Transaction};

use crate::{
    domains::auth,
    platform::{
        crypto,
        error::{AppError, AppResult},
    },
};

pub const RESOURCE_BODY_FORMAT_PLAIN: &str = "plain";
pub const RESOURCE_BODY_FORMAT_HTML: &str = "html";
pub const RESOURCE_ACCESS_PASSWORD_ACTION_KEEP: &str = "keep";
pub const RESOURCE_ACCESS_PASSWORD_ACTION_SET: &str = "set";
pub const RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR: &str = "clear";
const RESOURCE_ACCESS_AAD: &[u8] = b"yuance:project-resource-access:v1";
const RESOURCE_ACCESS_TTL_SECONDS: i64 = 15 * 60;

#[derive(Debug, Deserialize, Serialize)]
struct ResourceAccessGrant {
    resource_id: i64,
    user_id: i64,
    password_hash: String,
    expires_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProjectResourceFilter {
    pub keyword: String,
    pub category: String,
    pub status: String,
    pub tag: String,
    pub related_work_item_key: String,
    pub related_cycle_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectResourceTagSummary {
    pub name: String,
    pub usage_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectResourceWorkItemRelation {
    pub item_key: String,
    pub item_type: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectResourceCycleRelation {
    pub id: i64,
    pub name: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectResourceSummary {
    pub id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
    pub summary: String,
    pub status: String,
    pub is_protected: bool,
    pub tags: Vec<String>,
    pub related_work_item: Option<ProjectResourceWorkItemRelation>,
    pub related_cycle: Option<ProjectResourceCycleRelation>,
    pub created_by_display_name: String,
    pub updated_by_display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectResourceDetail {
    pub id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
    pub body_html: String,
    pub summary: String,
    pub status: String,
    pub is_protected: bool,
    pub tags: Vec<String>,
    pub related_work_item: Option<ProjectResourceWorkItemRelation>,
    pub related_cycle: Option<ProjectResourceCycleRelation>,
    pub created_by_display_name: String,
    pub updated_by_display_name: String,
    pub archived_by_display_name: String,
    pub archived_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateProjectResourceInput {
    pub project_id: i64,
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
    pub access_password: String,
    pub tags: Vec<String>,
    pub related_work_item_key: String,
    pub related_cycle_id: Option<i64>,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateProjectResourceInput {
    pub title: String,
    pub category: String,
    pub body: String,
    pub body_format: String,
    pub access_password_action: String,
    pub access_password: String,
    pub tags: Vec<String>,
    pub related_work_item_key: String,
    pub related_cycle_id: Option<i64>,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResetProjectResourceAccessPasswordInput {
    pub access_password_action: String,
    pub access_password: String,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PreparedResourceBody {
    body: String,
    body_format: String,
    plain_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedResourceTag {
    name: String,
    normalized_name: String,
}

type ResourceRow = (
    i64,
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
    String,
    String,
    String,
    String,
    String,
);

pub async fn list_resources(
    pool: &SqlitePool,
    project_id: i64,
    filter: ProjectResourceFilter,
) -> AppResult<Vec<ProjectResourceSummary>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }
    let keyword = validate_optional_text(&filter.keyword, "关键词", 120)?;
    let keyword_like = if keyword.is_empty() {
        String::new()
    } else {
        format!("%{keyword}%")
    };
    let category = normalize_category_filter(&filter.category)?;
    let status = normalize_status_filter(&filter.status)?;
    let tag = normalize_tag_filter(&filter.tag)?;
    let related_work_item_key =
        validate_optional_text(&filter.related_work_item_key, "关联工作项", 40)?;
    let related_cycle_id = normalize_related_cycle_id(filter.related_cycle_id)?;

    let rows = sqlx::query_as::<_, ResourceRow>(
        r#"
        SELECT
            pr.id,
            pr.project_id,
            p.project_key,
            pr.title,
            pr.category,
            pr.body,
            pr.body_format,
            pr.status,
            CASE WHEN pr.access_password_hash <> '' THEN '1' ELSE '0' END AS is_protected,
            COALESCE(NULLIF(pr.created_by_display_name_snapshot, ''), created_user.display_name, '') AS created_by_display_name,
            COALESCE(NULLIF(pr.updated_by_display_name_snapshot, ''), updated_user.display_name, '') AS updated_by_display_name,
            COALESCE(NULLIF(pr.archived_by_display_name_snapshot, ''), archived_user.display_name, '') AS archived_by_display_name,
            COALESCE(pr.archived_at, '') AS archived_at,
            pr.created_at,
            pr.updated_at,
            pr.access_password_hash
        FROM project_resources pr
        JOIN projects p ON p.id = pr.project_id
        LEFT JOIN users created_user ON created_user.id = pr.created_by_user_id
        LEFT JOIN users updated_user ON updated_user.id = pr.updated_by_user_id
        LEFT JOIN users archived_user ON archived_user.id = pr.archived_by_user_id
        WHERE pr.project_id = ?1
          AND (?2 = '' OR pr.status = ?2)
          AND (?3 = '' OR pr.category = ?3)
          AND (
            ?4 = ''
            OR pr.title LIKE ?4
            OR pr.category LIKE ?4
            OR (pr.access_password_hash = '' AND pr.body LIKE ?4)
          )
          AND (
            ?5 = ''
            OR EXISTS (
                SELECT 1
                FROM project_resource_tag_relations prtr
                JOIN project_resource_tags prt ON prt.id = prtr.tag_id
                WHERE prtr.resource_id = pr.id
                  AND prt.normalized_name = ?5
            )
          )
          AND (
            ?6 = ''
            OR EXISTS (
                SELECT 1
                FROM project_resource_relations prr
                JOIN work_items wi ON wi.id = prr.related_id
                WHERE prr.resource_id = pr.id
                  AND prr.relation_type = 'work_item'
                  AND wi.deleted_at IS NULL
                  AND wi.item_key = ?6
            )
          )
          AND (
            ?7 IS NULL
            OR EXISTS (
                SELECT 1
                FROM project_resource_relations prr
                JOIN project_cycles pc ON pc.id = prr.related_id
                WHERE prr.resource_id = pr.id
                  AND prr.relation_type = 'cycle'
                  AND pc.id = ?7
            )
          )
        ORDER BY
          CASE pr.status WHEN 'active' THEN 0 ELSE 1 END,
          pr.updated_at DESC,
          pr.id DESC
        "#,
    )
    .bind(project_id)
    .bind(status)
    .bind(category)
    .bind(keyword_like)
    .bind(tag)
    .bind(related_work_item_key)
    .bind(related_cycle_id)
    .fetch_all(pool)
    .await?;

    let mut resources = rows
        .into_iter()
        .map(resource_summary_from_row)
        .collect::<Vec<_>>();
    populate_resource_summary_metadata(pool, &mut resources).await?;
    Ok(resources)
}

pub async fn list_project_resource_tags(
    pool: &SqlitePool,
    project_id: i64,
) -> AppResult<Vec<ProjectResourceTagSummary>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT
            prt.name,
            COUNT(prtr.resource_id) AS usage_count
        FROM project_resource_tags prt
        LEFT JOIN project_resource_tag_relations prtr ON prtr.tag_id = prt.id
        WHERE prt.project_id = ?1
        GROUP BY prt.id
        ORDER BY LOWER(prt.name) ASC, prt.id ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(name, usage_count)| ProjectResourceTagSummary { name, usage_count })
        .collect())
}

pub async fn get_resource(
    pool: &SqlitePool,
    resource_id: i64,
) -> AppResult<Option<ProjectResourceDetail>> {
    if resource_id <= 0 {
        return Err(AppError::BadRequest("资料 ID 无效".to_string()));
    }

    let row = sqlx::query_as::<_, ResourceRow>(
        r#"
        SELECT
            pr.id,
            pr.project_id,
            p.project_key,
            pr.title,
            pr.category,
            pr.body,
            pr.body_format,
            pr.status,
            CASE WHEN pr.access_password_hash <> '' THEN '1' ELSE '0' END AS is_protected,
            COALESCE(NULLIF(pr.created_by_display_name_snapshot, ''), created_user.display_name, '') AS created_by_display_name,
            COALESCE(NULLIF(pr.updated_by_display_name_snapshot, ''), updated_user.display_name, '') AS updated_by_display_name,
            COALESCE(NULLIF(pr.archived_by_display_name_snapshot, ''), archived_user.display_name, '') AS archived_by_display_name,
            COALESCE(pr.archived_at, '') AS archived_at,
            pr.created_at,
            pr.updated_at,
            pr.access_password_hash
        FROM project_resources pr
        JOIN projects p ON p.id = pr.project_id
        LEFT JOIN users created_user ON created_user.id = pr.created_by_user_id
        LEFT JOIN users updated_user ON updated_user.id = pr.updated_by_user_id
        LEFT JOIN users archived_user ON archived_user.id = pr.archived_by_user_id
        WHERE pr.id = ?1
        "#,
    )
    .bind(resource_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };
    let mut resource = resource_detail_from_row(row);
    populate_resource_detail_metadata(pool, &mut resource).await?;
    Ok(Some(resource))
}

pub async fn get_project_resource(
    pool: &SqlitePool,
    project_id: i64,
    resource_id: i64,
) -> AppResult<ProjectResourceDetail> {
    let resource = get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))?;
    if resource.project_id != project_id {
        return Err(AppError::NotFound("资料不存在".to_string()));
    }
    Ok(resource)
}

pub async fn create_resource(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateProjectResourceInput,
) -> AppResult<ProjectResourceDetail> {
    if input.project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }
    let project_key = project_key_by_id(pool, input.project_id).await?;
    let title = validate_name(&input.title, "资料标题", 120)?;
    let category = validate_category(&input.category)?;
    let access_password_hash = if input.access_password.trim().is_empty() {
        String::new()
    } else {
        validate_access_password(&input.access_password)?;
        auth::hash_password(&input.access_password)?
    };
    let tags = normalize_resource_tags(&input.tags)?;
    let related_work_item_key =
        validate_optional_text(&input.related_work_item_key, "关联工作项", 40)?;
    let related_cycle_id = normalize_related_cycle_id(input.related_cycle_id)?;
    let actor_display_name_snapshot =
        normalize_display_name_snapshot(&input.actor_display_name_snapshot);
    let mut tx = pool.begin().await?;
    let resource_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO project_resources (
            project_id,
            title,
            category,
            body,
            body_format,
            access_password_hash,
            created_by_user_id,
            created_by_display_name_snapshot,
            updated_by_user_id,
            updated_by_display_name_snapshot
        )
        VALUES (?1, ?2, ?3, '', 'html', ?4, ?5, ?6, ?5, ?6)
        RETURNING id
        "#,
    )
    .bind(input.project_id)
    .bind(&title)
    .bind(category)
    .bind(access_password_hash)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .fetch_one(&mut *tx)
    .await?;

    let prepared_body = if input.body.trim().is_empty() {
        None
    } else {
        Some(
            prepare_resource_body(
                pool,
                &project_key,
                resource_id,
                &input.body,
                &input.body_format,
                true,
            )
            .await?,
        )
    };

    if let Some(prepared) = prepared_body.as_ref() {
        sqlx::query(
            r#"
            UPDATE project_resources
            SET body = ?2,
                body_format = ?3,
                updated_by_user_id = ?4,
                updated_by_display_name_snapshot = ?5,
                updated_at = datetime('now')
            WHERE id = ?1
            "#,
        )
        .bind(resource_id)
        .bind(&prepared.body)
        .bind(&prepared.body_format)
        .bind(actor_user_id)
        .bind(&actor_display_name_snapshot)
        .execute(&mut *tx)
        .await?;
    }

    sync_resource_tags(&mut tx, input.project_id, actor_user_id, resource_id, &tags).await?;
    sync_resource_relations(
        &mut tx,
        input.project_id,
        resource_id,
        &related_work_item_key,
        related_cycle_id,
    )
    .await?;
    record_project_activity_in_transaction(
        &mut tx,
        input.project_id,
        actor_user_id,
        &actor_display_name_snapshot,
        "project_resource.create",
        "project_resource",
        &resource_id.to_string(),
        &format!("创建资料 {title}"),
    )
    .await?;
    tx.commit().await?;

    get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))
}

pub async fn update_resource(
    pool: &SqlitePool,
    actor_user_id: i64,
    resource_id: i64,
    input: UpdateProjectResourceInput,
) -> AppResult<ProjectResourceDetail> {
    let existing = get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))?;
    ensure_resource_accepts_writes(&existing)?;
    let title = validate_name(&input.title, "资料标题", 120)?;
    let category = validate_category(&input.category)?;
    let access_password_action = normalize_access_password_action(&input.access_password_action)?;
    let existing_password_hash = resource_access_password_hash(pool, resource_id).await?;
    let access_password_hash = match access_password_action {
        RESOURCE_ACCESS_PASSWORD_ACTION_KEEP => existing_password_hash,
        RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR => String::new(),
        RESOURCE_ACCESS_PASSWORD_ACTION_SET => {
            let password = input.access_password.trim();
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "设置访问密码时必须填写 4-128 位密码".to_string(),
                ));
            } else {
                validate_access_password(password)?;
                auth::hash_password(password)?
            }
        }
        _ => unreachable!("unsupported access password action"),
    };
    let tags = normalize_resource_tags(&input.tags)?;
    let related_work_item_key =
        validate_optional_text(&input.related_work_item_key, "关联工作项", 40)?;
    let related_cycle_id = normalize_related_cycle_id(input.related_cycle_id)?;
    let prepared = prepare_resource_body(
        pool,
        &existing.project_key,
        existing.id,
        &input.body,
        &input.body_format,
        false,
    )
    .await?;
    let actor_display_name_snapshot =
        normalize_display_name_snapshot(&input.actor_display_name_snapshot);
    let prepared_body = prepared.body.clone();
    let prepared_body_format = prepared.body_format.clone();
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE project_resources
        SET title = ?2,
            category = ?3,
            body = ?4,
            body_format = ?5,
            access_password_hash = ?6,
            updated_by_user_id = ?7,
            updated_by_display_name_snapshot = ?8,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(resource_id)
    .bind(&title)
    .bind(category)
    .bind(&prepared_body)
    .bind(&prepared_body_format)
    .bind(access_password_hash)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .execute(&mut *tx)
    .await?;

    sync_resource_tags(
        &mut tx,
        existing.project_id,
        actor_user_id,
        resource_id,
        &tags,
    )
    .await?;
    sync_resource_relations(
        &mut tx,
        existing.project_id,
        resource_id,
        &related_work_item_key,
        related_cycle_id,
    )
    .await?;
    record_project_activity_in_transaction(
        &mut tx,
        existing.project_id,
        actor_user_id,
        &actor_display_name_snapshot,
        "project_resource.update",
        "project_resource",
        &resource_id.to_string(),
        &format!("更新资料 {title}"),
    )
    .await?;
    tx.commit().await?;

    get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))
}

pub async fn archive_resource(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_id: i64,
    resource_id: i64,
    actor_display_name_snapshot: &str,
) -> AppResult<ProjectResourceDetail> {
    let existing = get_project_resource(pool, project_id, resource_id).await?;
    ensure_resource_accepts_writes(&existing)?;
    let actor_display_name_snapshot = normalize_display_name_snapshot(actor_display_name_snapshot);
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE project_resources
        SET status = 'archived',
            archived_by_user_id = ?2,
            archived_by_display_name_snapshot = ?3,
            archived_at = datetime('now'),
            updated_by_user_id = ?2,
            updated_by_display_name_snapshot = ?3,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(resource_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .execute(&mut *tx)
    .await?;

    record_project_activity_in_transaction(
        &mut tx,
        project_id,
        actor_user_id,
        &actor_display_name_snapshot,
        "project_resource.archive",
        "project_resource",
        &resource_id.to_string(),
        &format!("归档资料 {}", existing.title),
    )
    .await?;
    tx.commit().await?;

    get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))
}

pub async fn reset_resource_access_password(
    pool: &SqlitePool,
    actor_user_id: i64,
    resource_id: i64,
    input: ResetProjectResourceAccessPasswordInput,
) -> AppResult<ProjectResourceDetail> {
    let existing = get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))?;
    ensure_resource_accepts_writes(&existing)?;
    let access_password_action =
        normalize_access_password_reset_action(&input.access_password_action)?;
    let access_password_hash = match access_password_action {
        RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR => String::new(),
        RESOURCE_ACCESS_PASSWORD_ACTION_SET => {
            let password = input.access_password.trim();
            if password.is_empty() {
                return Err(AppError::BadRequest(
                    "设置访问密码时必须填写 4-128 位密码".to_string(),
                ));
            }
            validate_access_password(password)?;
            auth::hash_password(password)?
        }
        _ => unreachable!("unsupported access password reset action"),
    };
    let actor_display_name_snapshot =
        normalize_display_name_snapshot(&input.actor_display_name_snapshot);
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE project_resources
        SET access_password_hash = ?2,
            updated_by_user_id = ?3,
            updated_by_display_name_snapshot = ?4,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(resource_id)
    .bind(access_password_hash)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .execute(&mut *tx)
    .await?;

    let summary = match access_password_action {
        RESOURCE_ACCESS_PASSWORD_ACTION_SET => {
            format!("重置资料 {} 的保险箱密码", existing.title)
        }
        RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR => {
            format!("清除资料 {} 的保险箱密码", existing.title)
        }
        _ => unreachable!("unsupported access password reset action"),
    };
    record_project_activity_in_transaction(
        &mut tx,
        existing.project_id,
        actor_user_id,
        &actor_display_name_snapshot,
        "project_resource.password.reset",
        "project_resource",
        &resource_id.to_string(),
        &summary,
    )
    .await?;
    tx.commit().await?;

    get_resource(pool, resource_id)
        .await?
        .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))
}

pub async fn verify_resource_password(
    pool: &SqlitePool,
    resource_id: i64,
    password: &str,
) -> AppResult<bool> {
    let password_hash = resource_access_password_hash(pool, resource_id).await?;

    if password_hash.trim().is_empty() {
        return Ok(true);
    }
    if password.trim().is_empty() {
        return Ok(false);
    }

    auth::verify_password(password, &password_hash)
}

pub async fn verify_resource_password_and_issue_access_token(
    pool: &SqlitePool,
    security_master_key: &str,
    user_id: i64,
    resource_id: i64,
    password: &str,
) -> AppResult<(bool, Option<String>)> {
    let password_hash = resource_access_password_hash(pool, resource_id).await?;
    if password_hash.trim().is_empty() {
        return Ok((true, None));
    }
    if password.trim().is_empty() || !auth::verify_password(password, &password_hash)? {
        return Ok((false, None));
    }
    let grant = ResourceAccessGrant {
        resource_id,
        user_id,
        password_hash,
        expires_at: Utc::now().timestamp() + RESOURCE_ACCESS_TTL_SECONDS,
    };
    let plaintext = serde_json::to_string(&grant)
        .map_err(|error| AppError::Crypto(format!("资料访问凭证序列化失败：{error}")))?;
    Ok((
        true,
        Some(crypto::encrypt_secret(
            security_master_key,
            &plaintext,
            RESOURCE_ACCESS_AAD,
        )?),
    ))
}

pub async fn verify_resource_access_token(
    pool: &SqlitePool,
    security_master_key: &str,
    token: &str,
    user_id: i64,
    resource_id: i64,
) -> AppResult<bool> {
    if token.trim().is_empty() {
        return Ok(false);
    }
    let plaintext = match crypto::decrypt_secret(security_master_key, token, RESOURCE_ACCESS_AAD) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    let grant = match serde_json::from_str::<ResourceAccessGrant>(&plaintext) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    if grant.user_id != user_id
        || grant.resource_id != resource_id
        || grant.expires_at <= Utc::now().timestamp()
    {
        return Ok(false);
    }
    Ok(grant.password_hash == resource_access_password_hash(pool, resource_id).await?)
}

pub async fn ensure_resource_attachment_references(
    pool: &SqlitePool,
    project_key: &str,
    resource_id: i64,
    body: &str,
    body_format: &str,
) -> AppResult<()> {
    if body_format != RESOURCE_BODY_FORMAT_HTML {
        return Ok(());
    }

    let prepared =
        prepare_resource_body(pool, project_key, resource_id, body, body_format, true).await?;
    if prepared.body.is_empty() && !prepared.plain_text.is_empty() {
        return Err(AppError::BadRequest("资料正文无效".to_string()));
    }
    Ok(())
}

pub fn resource_body_html_for_display(body: &str, body_format: &str) -> String {
    if body_format != RESOURCE_BODY_FORMAT_HTML {
        return plain_text_to_html(body);
    }

    sanitize_resource_html(body, "", 0)
}

pub fn resource_plain_text(body: &str, body_format: &str) -> String {
    if body_format == RESOURCE_BODY_FORMAT_HTML {
        html_to_plain_text(&sanitize_resource_html(body, "", 0))
    } else {
        body.trim().to_string()
    }
}

pub fn resource_inline_attachment_ids(resource_id: i64, body: &str, body_format: &str) -> Vec<i64> {
    if body_format != RESOURCE_BODY_FORMAT_HTML {
        return Vec::new();
    }

    extract_resource_attachment_references(body)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(referenced_resource_id, attachment_id)| {
            (referenced_resource_id == resource_id).then_some(attachment_id)
        })
        .collect()
}

pub fn category_label(category: &str) -> &'static str {
    match category {
        "integration" => "开发资料",
        "customer" => "客户资料",
        "meeting" => "会议纪要",
        "implementation" => "实施文档",
        "other" => "其他",
        _ => "其他",
    }
}

fn resource_summary_from_row(row: ResourceRow) -> ProjectResourceSummary {
    let (
        id,
        project_id,
        project_key,
        title,
        category,
        body,
        body_format,
        status,
        is_protected,
        created_by_display_name,
        updated_by_display_name,
        _archived_by_display_name,
        _archived_at,
        created_at,
        updated_at,
        _access_password_hash,
    ) = row;
    let plain = resource_plain_text(&body, &body_format);
    ProjectResourceSummary {
        id,
        project_id,
        project_key,
        title,
        category,
        body,
        body_format,
        summary: compact_summary(&plain),
        status,
        is_protected: is_protected == "1",
        tags: Vec::new(),
        related_work_item: None,
        related_cycle: None,
        created_by_display_name,
        updated_by_display_name,
        created_at,
        updated_at,
    }
}

fn resource_detail_from_row(row: ResourceRow) -> ProjectResourceDetail {
    let (
        id,
        project_id,
        project_key,
        title,
        category,
        body,
        body_format,
        status,
        is_protected,
        created_by_display_name,
        updated_by_display_name,
        archived_by_display_name,
        archived_at,
        created_at,
        updated_at,
        _access_password_hash,
    ) = row;
    let body_html = resource_body_html_for_display(&body, &body_format);
    let plain = resource_plain_text(&body, &body_format);
    ProjectResourceDetail {
        id,
        project_id,
        project_key,
        title,
        category,
        body,
        body_format,
        body_html,
        summary: compact_summary(&plain),
        status,
        is_protected: is_protected == "1",
        tags: Vec::new(),
        related_work_item: None,
        related_cycle: None,
        created_by_display_name,
        updated_by_display_name,
        archived_by_display_name,
        archived_at,
        created_at,
        updated_at,
    }
}

async fn populate_resource_summary_metadata(
    pool: &SqlitePool,
    resources: &mut [ProjectResourceSummary],
) -> AppResult<()> {
    let resource_ids = resources
        .iter()
        .map(|resource| resource.id)
        .collect::<Vec<_>>();
    let tags_map = load_resource_tags_map(pool, &resource_ids).await?;
    let work_item_map = load_resource_work_item_relations_map(pool, &resource_ids).await?;
    let cycle_map = load_resource_cycle_relations_map(pool, &resource_ids).await?;

    for resource in resources {
        resource.tags = tags_map.get(&resource.id).cloned().unwrap_or_default();
        resource.related_work_item = work_item_map.get(&resource.id).cloned();
        resource.related_cycle = cycle_map.get(&resource.id).cloned();
    }
    Ok(())
}

async fn populate_resource_detail_metadata(
    pool: &SqlitePool,
    resource: &mut ProjectResourceDetail,
) -> AppResult<()> {
    let resource_ids = [resource.id];
    let tags_map = load_resource_tags_map(pool, &resource_ids).await?;
    let work_item_map = load_resource_work_item_relations_map(pool, &resource_ids).await?;
    let cycle_map = load_resource_cycle_relations_map(pool, &resource_ids).await?;

    resource.tags = tags_map.get(&resource.id).cloned().unwrap_or_default();
    resource.related_work_item = work_item_map.get(&resource.id).cloned();
    resource.related_cycle = cycle_map.get(&resource.id).cloned();
    Ok(())
}

async fn load_resource_tags_map(
    pool: &SqlitePool,
    resource_ids: &[i64],
) -> AppResult<HashMap<i64, Vec<String>>> {
    if resource_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query = QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
            prtr.resource_id,
            prt.name
        FROM project_resource_tag_relations prtr
        JOIN project_resource_tags prt ON prt.id = prtr.tag_id
        WHERE prtr.resource_id IN (
        "#,
    );
    {
        let mut separated = query.separated(", ");
        for resource_id in resource_ids {
            separated.push_bind(resource_id);
        }
        separated.push_unseparated(")");
    }
    query.push(" ORDER BY LOWER(prt.name) ASC, prt.id ASC");

    let rows = query
        .build_query_as::<(i64, String)>()
        .fetch_all(pool)
        .await?;

    let mut map = HashMap::<i64, Vec<String>>::new();
    for (resource_id, tag_name) in rows {
        map.entry(resource_id).or_default().push(tag_name);
    }
    Ok(map)
}

async fn load_resource_work_item_relations_map(
    pool: &SqlitePool,
    resource_ids: &[i64],
) -> AppResult<HashMap<i64, ProjectResourceWorkItemRelation>> {
    if resource_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query = QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
            prr.resource_id,
            wi.item_key,
            wi.item_type,
            wi.title
        FROM project_resource_relations prr
        JOIN work_items wi ON wi.id = prr.related_id
        WHERE prr.relation_type = 'work_item'
          AND wi.deleted_at IS NULL
          AND prr.resource_id IN (
        "#,
    );
    {
        let mut separated = query.separated(", ");
        for resource_id in resource_ids {
            separated.push_bind(resource_id);
        }
        separated.push_unseparated(")");
    }

    let rows = query
        .build_query_as::<(i64, String, String, String)>()
        .fetch_all(pool)
        .await?;

    let mut map = HashMap::new();
    for (resource_id, item_key, item_type, title) in rows {
        map.insert(
            resource_id,
            ProjectResourceWorkItemRelation {
                item_key,
                item_type,
                title,
            },
        );
    }
    Ok(map)
}

async fn load_resource_cycle_relations_map(
    pool: &SqlitePool,
    resource_ids: &[i64],
) -> AppResult<HashMap<i64, ProjectResourceCycleRelation>> {
    if resource_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query = QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
            prr.resource_id,
            pc.id,
            pc.name,
            pc.start_date,
            pc.end_date
        FROM project_resource_relations prr
        JOIN project_cycles pc ON pc.id = prr.related_id
        WHERE prr.relation_type = 'cycle'
          AND prr.resource_id IN (
        "#,
    );
    {
        let mut separated = query.separated(", ");
        for resource_id in resource_ids {
            separated.push_bind(resource_id);
        }
        separated.push_unseparated(")");
    }

    let rows = query
        .build_query_as::<(i64, i64, String, String, String)>()
        .fetch_all(pool)
        .await?;

    let mut map = HashMap::new();
    for (resource_id, cycle_id, name, start_date, end_date) in rows {
        map.insert(
            resource_id,
            ProjectResourceCycleRelation {
                id: cycle_id,
                name,
                start_date,
                end_date,
            },
        );
    }
    Ok(map)
}

async fn sync_resource_tags(
    tx: &mut Transaction<'_, Sqlite>,
    project_id: i64,
    actor_user_id: i64,
    resource_id: i64,
    tags: &[NormalizedResourceTag],
) -> AppResult<()> {
    sqlx::query("DELETE FROM project_resource_tag_relations WHERE resource_id = ?1")
        .bind(resource_id)
        .execute(&mut **tx)
        .await?;

    for tag in tags {
        sqlx::query(
            r#"
            INSERT INTO project_resource_tags (
                project_id,
                name,
                normalized_name,
                created_by_user_id
            )
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, normalized_name)
            DO UPDATE SET name = excluded.name
            "#,
        )
        .bind(project_id)
        .bind(&tag.name)
        .bind(&tag.normalized_name)
        .bind(actor_user_id)
        .execute(&mut **tx)
        .await?;

        let tag_id = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT id
            FROM project_resource_tags
            WHERE project_id = ?1
              AND normalized_name = ?2
            "#,
        )
        .bind(project_id)
        .bind(&tag.normalized_name)
        .fetch_one(&mut **tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO project_resource_tag_relations (resource_id, tag_id)
            VALUES (?1, ?2)
            "#,
        )
        .bind(resource_id)
        .bind(tag_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn sync_resource_relations(
    tx: &mut Transaction<'_, Sqlite>,
    project_id: i64,
    resource_id: i64,
    related_work_item_key: &str,
    related_cycle_id: Option<i64>,
) -> AppResult<(
    Option<ProjectResourceWorkItemRelation>,
    Option<ProjectResourceCycleRelation>,
)> {
    sqlx::query("DELETE FROM project_resource_relations WHERE resource_id = ?1")
        .bind(resource_id)
        .execute(&mut **tx)
        .await?;

    let mut related_work_item = None;
    let related_work_item_key = related_work_item_key.trim();
    if !related_work_item_key.is_empty() {
        let work_item = sqlx::query_as::<_, (i64, String, String, String)>(
            r#"
            SELECT id, item_key, item_type, title
            FROM work_items
            WHERE project_id = ?1
              AND item_key = ?2
              AND deleted_at IS NULL
            "#,
        )
        .bind(project_id)
        .bind(related_work_item_key)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| AppError::BadRequest("关联工作项不存在，或不属于当前项目".to_string()))?;
        let relation = ProjectResourceWorkItemRelation {
            item_key: work_item.1,
            item_type: work_item.2,
            title: work_item.3,
        };

        sqlx::query(
            r#"
            INSERT INTO project_resource_relations (resource_id, relation_type, related_id)
            VALUES (?1, 'work_item', ?2)
            "#,
        )
        .bind(resource_id)
        .bind(work_item.0)
        .execute(&mut **tx)
        .await?;
        related_work_item = Some(relation);
    }

    let mut related_cycle = None;
    if let Some(cycle_id) = related_cycle_id {
        let cycle = sqlx::query_as::<_, (i64, String, String, String)>(
            r#"
            SELECT id, name, start_date, end_date
            FROM project_cycles
            WHERE id = ?1
              AND project_id = ?2
            "#,
        )
        .bind(cycle_id)
        .bind(project_id)
        .fetch_optional(&mut **tx)
        .await?;
        let Some(cycle) = cycle else {
            return Err(AppError::BadRequest(
                "关联周期不存在，或不属于当前项目".to_string(),
            ));
        };

        sqlx::query(
            r#"
            INSERT INTO project_resource_relations (resource_id, relation_type, related_id)
            VALUES (?1, 'cycle', ?2)
            "#,
        )
        .bind(resource_id)
        .bind(cycle_id)
        .execute(&mut **tx)
        .await?;
        related_cycle = Some(ProjectResourceCycleRelation {
            id: cycle.0,
            name: cycle.1,
            start_date: cycle.2,
            end_date: cycle.3,
        });
    }

    Ok((related_work_item, related_cycle))
}

async fn project_key_by_id(pool: &SqlitePool, project_id: i64) -> AppResult<String> {
    sqlx::query_scalar::<_, String>("SELECT project_key FROM projects WHERE id = ?1")
        .bind(project_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))
}

async fn prepare_resource_body(
    pool: &SqlitePool,
    project_key: &str,
    resource_id: i64,
    body: &str,
    body_format: &str,
    allow_empty: bool,
) -> AppResult<PreparedResourceBody> {
    let body_format = normalize_body_format(body_format)?;
    match body_format.as_str() {
        RESOURCE_BODY_FORMAT_HTML => {
            let raw_body = validate_optional_text(body, "资料正文", 50000)?;
            ensure_resource_html_media_sources_are_controlled(&raw_body, project_key, resource_id)?;
            ensure_resource_html_attachment_links_are_controlled(
                &raw_body,
                project_key,
                resource_id,
            )?;
            ensure_body_attachment_references(pool, resource_id, &raw_body).await?;
            let body = sanitize_resource_html(&raw_body, project_key, resource_id);
            let plain_text = html_to_plain_text(&body);
            if !allow_empty && plain_text.is_empty() && !resource_html_has_media_reference(&body) {
                return Err(AppError::BadRequest("资料正文不能为空".to_string()));
            }
            Ok(PreparedResourceBody {
                body,
                body_format,
                plain_text,
            })
        }
        _ => {
            let body = validate_optional_text(body, "资料正文", 20000)?;
            if !allow_empty && body.is_empty() {
                return Err(AppError::BadRequest("资料正文不能为空".to_string()));
            }
            Ok(PreparedResourceBody {
                plain_text: body.clone(),
                body,
                body_format,
            })
        }
    }
}

async fn ensure_body_attachment_references(
    pool: &SqlitePool,
    resource_id: i64,
    body: &str,
) -> AppResult<()> {
    for (referenced_resource_id, attachment_id) in extract_resource_attachment_references(body)? {
        if referenced_resource_id != resource_id {
            return Err(AppError::BadRequest("不能引用其他资料的附件".to_string()));
        }
        let status = sqlx::query_scalar::<_, String>(
            r#"
            SELECT fo.status
            FROM file_attachments fa
            JOIN file_objects fo ON fo.id = fa.file_object_id
            WHERE fa.id = ?1
              AND fa.target_type = 'project_resource'
              AND fa.target_id = ?2
            "#,
        )
        .bind(attachment_id)
        .bind(resource_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("资料附件引用不存在".to_string()))?;
        if status != "uploaded" {
            return Err(AppError::BadRequest(
                "只能引用已上传完成的资料附件".to_string(),
            ));
        }
    }
    Ok(())
}

fn validate_name(value: &str, field_name: &str, max_chars: usize) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max_chars {
        return Err(AppError::BadRequest(format!(
            "{field_name}不能为空且不能超过 {max_chars} 个字符"
        )));
    }
    Ok(value.to_string())
}

fn validate_optional_text(value: &str, field_name: &str, max_chars: usize) -> AppResult<String> {
    let value = value.trim();
    if value.chars().count() > max_chars {
        return Err(AppError::BadRequest(format!(
            "{field_name}不能超过 {max_chars} 个字符"
        )));
    }
    Ok(value.to_string())
}

fn validate_access_password(password: &str) -> AppResult<()> {
    let password = password.trim();
    if password.chars().count() < 4 || password.chars().count() > 128 {
        return Err(AppError::BadRequest(
            "资料访问密码长度必须为 4-128 个字符".to_string(),
        ));
    }
    Ok(())
}

async fn resource_access_password_hash(pool: &SqlitePool, resource_id: i64) -> AppResult<String> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT access_password_hash
        FROM project_resources
        WHERE id = ?1
        "#,
    )
    .bind(resource_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("资料不存在".to_string()))
}

fn normalize_access_password_action(action: &str) -> AppResult<&'static str> {
    match action.trim() {
        "" | RESOURCE_ACCESS_PASSWORD_ACTION_KEEP => Ok(RESOURCE_ACCESS_PASSWORD_ACTION_KEEP),
        RESOURCE_ACCESS_PASSWORD_ACTION_SET => Ok(RESOURCE_ACCESS_PASSWORD_ACTION_SET),
        RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR => Ok(RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR),
        _ => Err(AppError::BadRequest(
            "访问密码操作只能是 keep / set / clear".to_string(),
        )),
    }
}

fn normalize_access_password_reset_action(action: &str) -> AppResult<&'static str> {
    match action.trim() {
        RESOURCE_ACCESS_PASSWORD_ACTION_SET => Ok(RESOURCE_ACCESS_PASSWORD_ACTION_SET),
        RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR => Ok(RESOURCE_ACCESS_PASSWORD_ACTION_CLEAR),
        _ => Err(AppError::BadRequest(
            "访问密码重置操作只能是 set / clear".to_string(),
        )),
    }
}

fn validate_category(category: &str) -> AppResult<&'static str> {
    match category.trim() {
        "" | "other" => Ok("other"),
        "integration" => Ok("integration"),
        "customer" => Ok("customer"),
        "meeting" => Ok("meeting"),
        "implementation" => Ok("implementation"),
        _ => Err(AppError::BadRequest(
            "资料分类只能是 integration / customer / meeting / implementation / other".to_string(),
        )),
    }
}

fn normalize_category_filter(category: &str) -> AppResult<String> {
    match category.trim() {
        "" | "all" => Ok(String::new()),
        value => Ok(validate_category(value)?.to_string()),
    }
}

fn normalize_status_filter(status: &str) -> AppResult<String> {
    match status.trim() {
        "" | "active" => Ok("active".to_string()),
        "archived" => Ok("archived".to_string()),
        "all" => Ok(String::new()),
        _ => Err(AppError::BadRequest(
            "资料状态筛选只能是 active / archived / all".to_string(),
        )),
    }
}

fn normalize_tag_filter(tag: &str) -> AppResult<String> {
    match normalize_resource_tags(&[tag.to_string()])?
        .into_iter()
        .next()
    {
        Some(tag) => Ok(tag.normalized_name),
        None => Ok(String::new()),
    }
}

fn normalize_related_cycle_id(value: Option<i64>) -> AppResult<Option<i64>> {
    match value {
        None => Ok(None),
        Some(id) if id > 0 => Ok(Some(id)),
        Some(_) => Err(AppError::BadRequest("关联周期 ID 无效".to_string())),
    }
}

fn normalize_resource_tags(tags: &[String]) -> AppResult<Vec<NormalizedResourceTag>> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for raw_tag in tags {
        for candidate in split_resource_tag_candidates(raw_tag) {
            let name = collapse_whitespace(&candidate);
            if name.is_empty() {
                continue;
            }
            if name.chars().count() > 32 {
                return Err(AppError::BadRequest(
                    "资料标签单个不能超过 32 个字符".to_string(),
                ));
            }
            let normalized_name = name.to_lowercase();
            if seen.insert(normalized_name.clone()) {
                normalized.push(NormalizedResourceTag {
                    name,
                    normalized_name,
                });
            }
        }
    }

    if normalized.len() > 20 {
        return Err(AppError::BadRequest(
            "单条资料最多设置 20 个标签".to_string(),
        ));
    }

    Ok(normalized)
}

fn split_resource_tag_candidates(raw_tag: &str) -> Vec<String> {
    raw_tag
        .split([',', '，', ';', '；', '\n', '\r'])
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_body_format(body_format: &str) -> AppResult<String> {
    match body_format.trim() {
        "" | RESOURCE_BODY_FORMAT_HTML => Ok(RESOURCE_BODY_FORMAT_HTML.to_string()),
        RESOURCE_BODY_FORMAT_PLAIN => Ok(RESOURCE_BODY_FORMAT_PLAIN.to_string()),
        _ => Err(AppError::BadRequest(
            "资料正文格式只能是 plain / html".to_string(),
        )),
    }
}

fn ensure_resource_accepts_writes(resource: &ProjectResourceDetail) -> AppResult<()> {
    if resource.status == "archived" {
        return Err(AppError::BadRequest("已归档资料不能继续修改".to_string()));
    }
    Ok(())
}

async fn record_project_activity_in_transaction(
    tx: &mut Transaction<'_, Sqlite>,
    project_id: i64,
    actor_user_id: i64,
    actor_display_name_snapshot: &str,
    action: &str,
    target_type: &str,
    target_id: &str,
    summary: &str,
) -> AppResult<()> {
    let actor_display_name_snapshot = normalize_display_name_snapshot(actor_display_name_snapshot);
    sqlx::query(
        r#"
        INSERT INTO project_activities (
            project_id,
            actor_user_id,
            actor_display_name_snapshot,
            action,
            target_type,
            target_id,
            summary
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(summary)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

fn normalize_display_name_snapshot(display_name: &str) -> String {
    display_name.trim().to_string()
}

fn sanitize_resource_html(body: &str, project_key: &str, resource_id: i64) -> String {
    let project_key = project_key.to_string();
    ammonia::Builder::default()
        .add_tags(&[
            "blockquote",
            "code",
            "del",
            "figure",
            "figcaption",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "hr",
            "img",
            "pre",
            "video",
        ])
        .add_tag_attributes("img", &["src", "alt", "title", "loading"])
        .add_tag_attributes("video", &["src", "controls", "preload", "playsinline"])
        .add_tag_attributes("a", &["href", "title"])
        .add_generic_attributes(&[
            "data-yuance-attachment-id",
            "data-yuance-attachment-kind",
            "data-yuance-align",
            "data-yuance-file-kind",
            "data-yuance-file-ext",
        ])
        .attribute_filter(
            move |element, attribute, value| match (element, attribute) {
                ("img", "src") | ("source", "src") | ("video", "src")
                    if !resource_attachment_url_like(value, &project_key, resource_id) =>
                {
                    None
                }
                _ => Some(Cow::Borrowed(value)),
            },
        )
        .clean(body)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::resource_body_html_for_display;

    #[test]
    fn resource_body_preserves_file_card_dataset_attributes() {
        let html = concat!(
            "<a data-yuance-attachment-id=\"5\" ",
            "data-yuance-attachment-kind=\"file\" ",
            "data-yuance-align=\"left\" ",
            "data-yuance-file-kind=\"pdf\" ",
            "data-yuance-file-ext=\"PDF\" ",
            "href=\"/web/projects/YCE/resources/5/attachments/5/download\" ",
            "title=\"demo.pdf\">demo.pdf</a>"
        );

        let rendered = resource_body_html_for_display(html, "html");

        assert!(rendered.contains("data-yuance-attachment-kind=\"file\""));
        assert!(rendered.contains("data-yuance-file-kind=\"pdf\""));
        assert!(rendered.contains("data-yuance-file-ext=\"PDF\""));
    }

    #[test]
    fn resource_body_preserves_markdown_html_blocks_and_strips_unsafe_links() {
        let html = concat!(
            "<h2>联调说明</h2>",
            "<blockquote>请先核对环境变量</blockquote>",
            "<pre><code>YUANCE_BASE_URL=https://demo.test</code></pre>",
            "<hr>",
            "<p><a href=\"javascript:alert(1)\">bad</a></p>"
        );

        let rendered = resource_body_html_for_display(html, "html");

        assert!(rendered.contains("<h2>联调说明</h2>"));
        assert!(rendered.contains("<blockquote>请先核对环境变量</blockquote>"));
        assert!(rendered.contains("<pre><code>YUANCE_BASE_URL=https://demo.test</code></pre>"));
        assert!(rendered.contains("<hr"));
        assert!(!rendered.contains("javascript:"));
    }
}

fn ensure_resource_html_media_sources_are_controlled(
    body: &str,
    project_key: &str,
    resource_id: i64,
) -> AppResult<()> {
    for tag_name in ["img", "source", "video"] {
        ensure_resource_html_tag_sources_are_controlled(body, tag_name, project_key, resource_id)?;
    }
    Ok(())
}

fn ensure_resource_html_attachment_links_are_controlled(
    body: &str,
    project_key: &str,
    resource_id: i64,
) -> AppResult<()> {
    let lower_body = body.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(relative_start) = lower_body[search_from..].find("<a") {
        let tag_start = search_from + relative_start;
        let tag_end = lower_body[tag_start..]
            .find('>')
            .map(|relative_end| tag_start + relative_end)
            .unwrap_or(body.len());
        let tag_html = &body[tag_start..tag_end];
        let lower_tag = &lower_body[tag_start..tag_end];
        if lower_tag.contains("data-yuance-attachment-kind")
            && let Some(href) = html_attribute_value(tag_html, "href")
            && !resource_attachment_url_like(&href, project_key, resource_id)
        {
            return Err(AppError::BadRequest(
                "正文附件链接必须使用已上传的资料附件".to_string(),
            ));
        }
        search_from = tag_end.saturating_add(1);
    }
    Ok(())
}

fn ensure_resource_html_tag_sources_are_controlled(
    body: &str,
    tag_name: &str,
    project_key: &str,
    resource_id: i64,
) -> AppResult<()> {
    let lower_body = body.to_ascii_lowercase();
    let marker = format!("<{tag_name}");
    let mut search_from = 0;
    while let Some(relative_start) = lower_body[search_from..].find(&marker) {
        let tag_start = search_from + relative_start;
        let tag_end = lower_body[tag_start..]
            .find('>')
            .map(|relative_end| tag_start + relative_end)
            .unwrap_or(body.len());
        let tag_html = &body[tag_start..tag_end];
        if let Some(source) = html_attribute_value(tag_html, "src")
            && !resource_attachment_url_like(&source, project_key, resource_id)
        {
            return Err(AppError::BadRequest(
                "正文媒体必须使用已上传的资料附件".to_string(),
            ));
        }
        search_from = tag_end.saturating_add(1);
    }
    Ok(())
}

fn resource_attachment_url_like(value: &str, project_key: &str, resource_id: i64) -> bool {
    let value = value.trim();
    let path = value.split('?').next().unwrap_or(value);
    if !path.starts_with("/web/projects/") || !path.contains("/resources/") {
        return false;
    }
    if resource_id > 0 && !path.contains(&format!("/resources/{resource_id}/attachments/")) {
        return false;
    }
    if !project_key.is_empty() {
        let encoded_key = project_key.trim();
        if !path.starts_with(&format!("/web/projects/{encoded_key}/")) {
            return false;
        }
    }
    path.contains("/attachments/") && path.ends_with("/download")
}

fn resource_html_has_media_reference(body: &str) -> bool {
    body.contains("/resources/") && body.contains("/attachments/")
}

fn extract_resource_attachment_references(body: &str) -> AppResult<Vec<(i64, i64)>> {
    let mut references = Vec::new();
    let mut remaining = body;
    while let Some(resource_marker) = remaining.find("/resources/") {
        remaining = &remaining[resource_marker + "/resources/".len()..];
        let resource_digits = remaining
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect::<String>();
        if resource_digits.is_empty()
            || !remaining[resource_digits.len()..].starts_with("/attachments/")
        {
            continue;
        }
        remaining = &remaining[resource_digits.len() + "/attachments/".len()..];
        let attachment_digits = remaining
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect::<String>();
        if attachment_digits.is_empty() {
            continue;
        }
        let resource_id = resource_digits
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("资料附件引用无效".to_string()))?;
        let attachment_id = attachment_digits
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("资料附件引用无效".to_string()))?;
        references.push((resource_id, attachment_id));
    }
    references.sort_unstable();
    references.dedup();
    Ok(references)
}

fn html_attribute_value(tag_html: &str, attribute_name: &str) -> Option<String> {
    let lower_tag = tag_html.to_ascii_lowercase();
    let attribute_name = attribute_name.to_ascii_lowercase();
    let mut search_from = 0;
    while let Some(relative_start) = lower_tag[search_from..].find(&attribute_name) {
        let attr_start = search_from + relative_start;
        let before = lower_tag[..attr_start].chars().next_back();
        let valid_prefix = before.is_some_and(|character| {
            character == '<' || character == '/' || character.is_whitespace()
        });
        let mut cursor = attr_start + attribute_name.len();
        if valid_prefix {
            cursor += lower_tag[cursor..].len() - lower_tag[cursor..].trim_start().len();
            if cursor < lower_tag.len() && lower_tag[cursor..].starts_with('=') {
                cursor += 1;
                cursor += lower_tag[cursor..].len() - lower_tag[cursor..].trim_start().len();
                return Some(read_html_attribute_value(tag_html, cursor));
            }
        }
        search_from = attr_start + attribute_name.len();
    }
    None
}

fn read_html_attribute_value(tag_html: &str, marker_start: usize) -> String {
    let bytes = tag_html.as_bytes();
    if marker_start >= bytes.len() {
        return String::new();
    }
    let quote = bytes[marker_start] as char;
    if quote == '"' || quote == '\'' {
        let value_start = marker_start + 1;
        let value_end = tag_html[value_start..]
            .find(quote)
            .map(|relative_end| value_start + relative_end)
            .unwrap_or(tag_html.len());
        return tag_html[value_start..value_end].trim().to_string();
    }
    let value_end = tag_html[marker_start..]
        .find(|character: char| character.is_whitespace() || character == '>')
        .map(|relative_end| marker_start + relative_end)
        .unwrap_or(tag_html.len());
    tag_html[marker_start..value_end].trim().to_string()
}

fn plain_text_to_html(value: &str) -> String {
    let escaped = escape_html(value);
    let paragraphs = escaped
        .split("\n\n")
        .map(|paragraph| {
            let content = paragraph.replace('\n', "<br>");
            if content.trim().is_empty() {
                "<p><br></p>".to_string()
            } else {
                format!("<p>{content}</p>")
            }
        })
        .collect::<Vec<_>>()
        .join("");
    if paragraphs.is_empty() {
        "<p><br></p>".to_string()
    } else {
        paragraphs
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn html_to_plain_text(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => {
                in_tag = true;
                output.push(' ');
            }
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }
    decode_basic_html_entities(&output)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_basic_html_entities(value: &str) -> String {
    value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn compact_summary(value: &str) -> String {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut output = value.chars().take(96).collect::<String>();
    if value.chars().count() > 96 {
        output.push_str("...");
    }
    if output.trim().is_empty() {
        "暂无正文摘要".to_string()
    } else {
        output
    }
}
