use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{
    AssertSqlSafe, Row, SqlitePool,
    sqlite::{Sqlite, SqliteRow},
};
use std::{borrow::Cow, collections::HashSet};

use crate::{
    domains::{
        notifications::{self, CreateNotification},
        users,
    },
    platform::{
        error::{AppError, AppResult},
        realtime,
    },
};

mod comment_ops;
pub use comment_ops::*;
mod batch_ops;
pub use batch_ops::*;
mod work_item_ops;
pub use work_item_ops::*;
mod cycle_ops;
pub use cycle_ops::*;
mod member_ops;
pub use member_ops::*;

const PROJECT_KEY_GENERATE_MAX_ATTEMPTS: usize = 5;
const PROJECT_STATUS_NOT_STARTED: &str = "not_started";
const PROJECT_STATUS_IN_PROGRESS: &str = "in_progress";
const PROJECT_STATUS_ACCEPTANCE: &str = "acceptance";
const PROJECT_STATUS_COMPLETED: &str = "completed";
const PROJECT_STATUS_ON_HOLD: &str = "on_hold";
const PROJECT_STATUS_CANCELLED: &str = "cancelled";
const PROJECT_STATUS_ARCHIVED: &str = "archived";
const WORK_ITEM_FLOW_COMMENT_PREFIX: &str = "[yuance-flow] ";
const WORK_ITEM_SORT_UPDATED_DESC: &str = "updated_desc";
const WORK_ITEM_SORT_CREATED_DESC: &str = "created_desc";
const WORK_ITEM_SORT_PRIORITY_DESC: &str = "priority_desc";
const WORK_ITEM_SORT_DUE_DATE_ASC: &str = "due_date_asc";
const WORK_ITEM_SAVED_VIEW_LIMIT_PER_SCOPE: i64 = 20;
pub const COMMENT_BODY_FORMAT_PLAIN: &str = "plain";
pub const COMMENT_BODY_FORMAT_HTML: &str = "html";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DemoSeedResult {
    pub project_count: i64,
    pub work_item_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectSummary {
    pub id: i64,
    pub project_key: String,
    pub name: String,
    pub status: String,
    pub owner_display_name: String,
    pub owner_username: String,
    pub work_item_count: i64,
    pub active_work_item_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CurrentProject {
    pub id: i64,
    pub project_key: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectDetail {
    pub id: i64,
    pub project_key: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub owner_username: String,
    pub owner_display_name: String,
    pub start_date: String,
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectMemberSummary {
    pub user_id: i64,
    pub display_name: String,
    pub username: String,
    pub member_role: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectMemberDetail {
    pub user_id: i64,
    pub display_name: String,
    pub username: String,
    pub member_role: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserProjectMembershipSummary {
    pub project_id: i64,
    pub project_key: String,
    pub project_name: String,
    pub project_status: String,
    pub member_role: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectCycleDetail {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub goal: String,
    pub description: String,
    pub owner_username: String,
    pub owner_display_name: String,
    pub start_date: String,
    pub end_date: String,
    pub closed_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub total_items: i64,
    pub requirement_count: i64,
    pub task_count: i64,
    pub bug_count: i64,
    pub pending_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemSummary {
    pub id: i64,
    pub item_key: String,
    pub item_type: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub assignee_display_name: String,
    pub due_date: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectCycleWorkItemSnapshot {
    pub item_key: String,
    pub item_type: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee_username: String,
    pub assignee_display_name: String,
    pub due_date: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemDetail {
    pub id: i64,
    pub item_key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub primary_post_comment_id: Option<i64>,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub parent_item_key: String,
    pub parent_title: String,
    pub cycle_id: Option<i64>,
    pub cycle_name: String,
    pub cycle_start_date: String,
    pub cycle_end_date: String,
    pub assignee_username: String,
    pub assignee_display_name: String,
    pub reporter_user_id: Option<i64>,
    pub reporter_username: String,
    pub reporter_display_name: String,
    pub due_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemCommentSummary {
    pub id: i64,
    pub parent_comment_id: Option<i64>,
    pub parent_author_display_name: String,
    pub body: String,
    pub body_format: String,
    pub author_user_id: Option<i64>,
    pub author_username: String,
    pub author_display_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_flow: bool,
    pub is_draft: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemOperationSummary {
    pub source_kind: String,
    pub actor_display_name: String,
    pub created_at: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectActivitySummary {
    pub id: i64,
    pub project_key: String,
    pub summary: String,
    pub actor_display_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub hit_type: String,
    pub key: String,
    pub title: String,
    pub context: String,
    pub url: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkItemAssignmentCounts {
    pub requirements: i64,
    pub tasks: i64,
    pub bugs: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProjectPendingCounts {
    pub project_id: i64,
    pub requirements: i64,
    pub tasks: i64,
    pub bugs: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProjectAssignedPendingCount {
    pub project_key: String,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PersonalProjectAnalysis {
    pub joined_at: String,
    pub completed_total: i64,
    pub completed_requirements: i64,
    pub completed_tasks: i64,
    pub completed_bugs: i64,
    pub completed_last_30_days: i64,
    pub pending: WorkItemAssignmentCounts,
    pub daily_average: f64,
    pub daily_peak: i64,
    pub daily_peak_date: String,
    pub monthly_average: f64,
    pub monthly_peak: i64,
    pub monthly_peak_month: String,
    pub active_days: i64,
    pub comment_count: i64,
    pub handoff_count: i64,
    pub recent_completions: Vec<PersonalCompletion>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersonalCompletion {
    pub item_key: String,
    pub item_type: String,
    pub title: String,
    pub completed_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateProjectInput {
    pub name: String,
    pub description: String,
    pub status: String,
    pub start_date: String,
    pub due_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateProjectInput {
    pub name: String,
    pub description: String,
    pub status: String,
    pub owner_username: String,
    pub start_date: String,
    pub due_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateProjectCycleInput {
    pub name: String,
    pub goal: String,
    pub description: String,
    pub owner_username: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateProjectCycleInput {
    pub name: String,
    pub goal: String,
    pub description: String,
    pub owner_username: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateWorkItemInput {
    pub project_key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub assignee_username: String,
    pub due_date: String,
    pub parent_item_key: String,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProjectListFilter {
    pub status: String,
    pub keyword: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedProjectFilter {
    status: String,
    keyword: String,
    keyword_like: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkItemListFilter {
    pub item_type: Option<String>,
    pub keyword: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub assignee_username: String,
    pub cycle_id: String,
    pub sort_by: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkItemListStats {
    pub total_items: i64,
    pub active_items: i64,
    pub high_priority_items: i64,
    pub completed_items: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemSavedView {
    pub id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub item_type: String,
    pub name: String,
    pub filter: WorkItemListFilter,
    pub per_page: i64,
    pub is_default: bool,
    pub cycle_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateWorkItemSavedViewInput {
    pub name: String,
    pub filter: WorkItemListFilter,
    pub per_page: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pagination {
    pub page: i64,
    pub per_page: i64,
}

impl Pagination {
    pub fn offset(self) -> i64 {
        (self.page - 1).saturating_mul(self.per_page)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paginated<T> {
    pub items: Vec<T>,
    pub page: i64,
    pub per_page: i64,
    pub total_items: i64,
}

impl<T> Paginated<T> {
    pub fn total_pages(&self) -> i64 {
        if self.total_items == 0 {
            1
        } else {
            (self.total_items + self.per_page - 1) / self.per_page
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedWorkItemFilter {
    item_type: String,
    keyword: String,
    keyword_like: String,
    status: String,
    priority: String,
    project_key: String,
    assignee_username: String,
    cycle_id: Option<i64>,
    sort_by: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateWorkItemInput {
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub assignee_username: String,
    pub due_date: String,
    pub parent_item_key: String,
    pub cycle_id: Option<i64>,
    pub actor_display_name_snapshot: String,
    /// 乐观锁：非空时只有当前 `updated_at` 与之相同才写入，否则返回 409。
    /// 评论、正文发布也会刷新 `updated_at`，因此是否携带由调用方决定。
    pub expected_updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandoffWorkItemInput {
    pub status: String,
    pub assignee_username: String,
    pub body: String,
    pub source_comment_id: Option<i64>,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchUpdateWorkItemsInput {
    pub project_key: String,
    pub item_type: String,
    pub item_keys: Vec<String>,
    pub action: String,
    pub status: String,
    pub assignee_username: String,
    pub priority: String,
    pub cycle_id: Option<i64>,
    pub actor_display_name_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchUpdateWorkItemsResult {
    pub project_id: i64,
    pub project_key: String,
    pub item_type: String,
    pub action: String,
    pub updated_count: usize,
    pub item_keys: Vec<String>,
}

pub async fn seed_demo_data(pool: &SqlitePool, owner_user_id: i64) -> AppResult<DemoSeedResult> {
    seed_demo_projects(pool, owner_user_id).await?;
    seed_demo_members(pool, owner_user_id).await?;
    seed_demo_work_items(pool, owner_user_id).await?;
    seed_demo_comments(pool, owner_user_id).await?;
    seed_demo_activities(pool, owner_user_id).await?;

    Ok(DemoSeedResult {
        project_count: sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(pool)
            .await?,
        work_item_count: sqlx::query_scalar("SELECT COUNT(*) FROM work_items")
            .fetch_one(pool)
            .await?,
    })
}

pub async fn list_project_summaries(pool: &SqlitePool) -> AppResult<Vec<ProjectSummary>> {
    let page = list_project_summaries_paginated(
        pool,
        ProjectListFilter::default(),
        Pagination {
            page: 1,
            per_page: i64::MAX,
        },
    )
    .await?;
    Ok(page.items)
}

pub async fn list_project_summaries_paginated(
    pool: &SqlitePool,
    filter: ProjectListFilter,
    pagination: Pagination,
) -> AppResult<Paginated<ProjectSummary>> {
    let normalized = normalize_project_filter(filter)?;
    let pagination = normalize_pagination(pagination)?;
    let total_items = count_project_summaries(pool, &normalized).await?;
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            i64,
            i64,
            String,
        ),
    >(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.status,
            COALESCE(u.display_name, '') AS owner_display_name,
            COALESCE(u.username, '') AS owner_username,
            COUNT(wi.id) AS work_item_count,
            COALESCE(SUM(CASE
                WHEN wi.id IS NOT NULL
                 AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
                THEN 1
                ELSE 0
            END), 0) AS active_work_item_count,
            p.updated_at
        FROM projects p
        LEFT JOIN users u ON u.id = p.owner_user_id
        LEFT JOIN work_items wi ON wi.project_id = p.id
            AND wi.deleted_at IS NULL
        WHERE (?1 = '' OR p.status = ?1)
          AND (?4 = '' OR p.name LIKE ?4 OR p.project_key LIKE ?4)
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT ?2 OFFSET ?3
        "#,
    )
    .bind(&normalized.status)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .bind(&normalized.keyword_like)
    .fetch_all(pool)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                project_key,
                name,
                status,
                owner_display_name,
                owner_username,
                work_item_count,
                active_work_item_count,
                updated_at,
            )| ProjectSummary {
                id,
                project_key,
                name,
                status,
                owner_display_name,
                owner_username,
                work_item_count,
                active_work_item_count,
                updated_at,
            },
        )
        .collect();

    Ok(Paginated {
        items,
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
}

pub async fn list_project_summaries_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<Vec<ProjectSummary>> {
    let page = list_project_summaries_for_user_paginated(
        pool,
        user_id,
        is_super_admin,
        ProjectListFilter::default(),
        Pagination {
            page: 1,
            per_page: i64::MAX,
        },
    )
    .await?;
    Ok(page.items)
}

pub async fn list_project_summaries_for_user_paginated(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    filter: ProjectListFilter,
    pagination: Pagination,
) -> AppResult<Paginated<ProjectSummary>> {
    if is_super_admin {
        return list_project_summaries_paginated(pool, filter, pagination).await;
    }

    let normalized = normalize_project_filter(filter)?;
    let pagination = normalize_pagination(pagination)?;
    let total_items = count_project_summaries_for_user(pool, user_id, &normalized).await?;
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            i64,
            i64,
            String,
        ),
    >(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.status,
            COALESCE(u.display_name, '') AS owner_display_name,
            COALESCE(u.username, '') AS owner_username,
            COUNT(wi.id) AS work_item_count,
            COALESCE(SUM(CASE
                WHEN wi.id IS NOT NULL
                 AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
                THEN 1
                ELSE 0
            END), 0) AS active_work_item_count,
            p.updated_at
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
            AND pm.user_id = ?1
        LEFT JOIN users u ON u.id = p.owner_user_id
        LEFT JOIN work_items wi ON wi.project_id = p.id
            AND wi.deleted_at IS NULL
        WHERE (?2 = '' OR p.status = ?2)
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT ?3 OFFSET ?4
        "#,
    )
    .bind(user_id)
    .bind(&normalized.status)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                project_key,
                name,
                status,
                owner_display_name,
                owner_username,
                work_item_count,
                active_work_item_count,
                updated_at,
            )| ProjectSummary {
                id,
                project_key,
                name,
                status,
                owner_display_name,
                owner_username,
                work_item_count,
                active_work_item_count,
                updated_at,
            },
        )
        .collect();

    Ok(Paginated {
        items,
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
}

pub async fn get_current_project_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<Option<CurrentProject>> {
    let row = if is_super_admin {
        sqlx::query_as::<_, (i64, String, String)>(
            r#"
            SELECT p.id, p.project_key, p.name
            FROM user_project_preferences upp
            JOIN projects p ON p.id = upp.current_project_id
            WHERE upp.user_id = ?1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query_as::<_, (i64, String, String)>(
            r#"
            SELECT p.id, p.project_key, p.name
            FROM user_project_preferences upp
            JOIN projects p ON p.id = upp.current_project_id
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = upp.user_id
            WHERE upp.user_id = ?1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?
    };

    if row.is_none() {
        clear_current_project(pool, user_id).await?;
    }

    Ok(row.map(|(id, project_key, name)| CurrentProject {
        id,
        project_key,
        name,
    }))
}

pub async fn get_or_select_current_project_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<Option<CurrentProject>> {
    if let Some(project) = get_current_project_for_user(pool, user_id, is_super_admin).await? {
        return Ok(Some(project));
    }

    let project_options = list_project_summaries_for_user(pool, user_id, is_super_admin).await?;
    let Some(project) = project_options
        .iter()
        .find(|project| project.status == PROJECT_STATUS_IN_PROGRESS)
        .or_else(|| {
            project_options
                .iter()
                .find(|project| project.status == PROJECT_STATUS_NOT_STARTED)
        })
        .or_else(|| project_options.first())
    else {
        return Ok(None);
    };

    set_current_project_for_user(pool, user_id, is_super_admin, &project.project_key)
        .await
        .map(Some)
}

pub async fn set_current_project_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
) -> AppResult<CurrentProject> {
    let project = get_project_detail(pool, project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;

    if !is_super_admin && !is_project_member(pool, project.id, user_id).await? {
        return Err(AppError::Forbidden("无权选择该项目".to_string()));
    }

    sqlx::query(
        r#"
        INSERT INTO user_project_preferences (user_id, current_project_id, updated_at)
        VALUES (?1, ?2, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            current_project_id = excluded.current_project_id,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(user_id)
    .bind(project.id)
    .execute(pool)
    .await?;
    realtime::publish_topbar_refresh_for_user(user_id);

    Ok(CurrentProject {
        id: project.id,
        project_key: project.project_key,
        name: project.name,
    })
}

pub async fn clear_current_project(pool: &SqlitePool, user_id: i64) -> AppResult<()> {
    sqlx::query("DELETE FROM user_project_preferences WHERE user_id = ?1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create_project(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateProjectInput,
) -> AppResult<ProjectDetail> {
    let name = validate_name(&input.name, "项目名称", 120)?;
    let description = validate_optional_text(&input.description, "项目描述", 2000)?;
    let status = validate_project_status(&input.status)?;
    let start_date = validate_optional_date(&input.start_date, "项目开始日期")?;
    let due_date = validate_optional_date(&input.due_date, "项目截止日期")?;
    validate_date_range(&start_date, &due_date, "项目截止日期不能早于开始日期")?;

    for _ in 0..PROJECT_KEY_GENERATE_MAX_ATTEMPTS {
        let project_key = generate_project_key();
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
        let project_id = sqlx::query_scalar::<_, i64>(
            r#"
            INSERT INTO projects (
                project_key,
                name,
                description,
                status,
                owner_user_id,
                start_date,
                due_date
            )
            VALUES (?1, ?2, ?3, ?4, ?5, NULLIF(?6, ''), NULLIF(?7, ''))
            ON CONFLICT(project_key) DO NOTHING
            RETURNING id
            "#,
        )
        .bind(&project_key)
        .bind(&name)
        .bind(&description)
        .bind(status)
        .bind(actor_user_id)
        .bind(&start_date)
        .bind(&due_date)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(project_id) = project_id else {
            tx.rollback().await?;
            continue;
        };

        sqlx::query(
            r#"
            INSERT INTO project_members (
                project_id,
                user_id,
                member_role
            )
            VALUES (?1, ?2, 'owner')
            ON CONFLICT(project_id, user_id) DO UPDATE SET
                member_role = 'owner',
                updated_at = datetime('now')
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO project_activities (
                project_id,
                actor_user_id,
                action,
                target_type,
                target_id,
                summary
            )
            VALUES (?1, ?2, 'project.created', 'project', ?3, ?4)
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
        .bind(&project_key)
        .bind(format!("创建项目 {name}"))
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        return get_project_detail(pool, &project_key)
            .await?
            .ok_or_else(|| AppError::NotFound("项目创建后未找到".to_string()));
    }

    Err(AppError::Conflict(
        "项目编号生成冲突，请重新创建项目".to_string(),
    ))
}

pub async fn update_project(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    input: UpdateProjectInput,
) -> AppResult<ProjectDetail> {
    let project_key = validate_project_key(project_key)?;
    let name = validate_name(&input.name, "项目名称", 120)?;
    let description = validate_optional_text(&input.description, "项目描述", 2000)?;
    let status = validate_project_status(&input.status)?;
    let owner_username = validate_username_ref(&input.owner_username)?;
    let start_date = validate_optional_date(&input.start_date, "项目开始日期")?;
    let due_date = validate_optional_date(&input.due_date, "项目截止日期")?;
    validate_date_range(&start_date, &due_date, "项目截止日期不能早于开始日期")?;

    let Some((project_id, previous_owner_user_id, current_status)) =
        sqlx::query_as::<_, (i64, Option<i64>, String)>(
            "SELECT id, owner_user_id, status FROM projects WHERE project_key = ?1",
        )
        .bind(&project_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("项目不存在".to_string()));
    };
    validate_project_status_transition(&current_status, status)?;

    let Some(owner_user_id) = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT u.id
        FROM users u
        JOIN project_members pm ON pm.user_id = u.id
            AND pm.project_id = ?1
        WHERE u.username = ?2
          AND u.status = 'active'
        "#,
    )
    .bind(project_id)
    .bind(&owner_username)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::BadRequest(
            "项目负责人必须是已启用的项目成员".to_string(),
        ));
    };

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query(
        r#"
        UPDATE projects
        SET name = ?2,
            description = ?3,
            status = ?4,
            owner_user_id = ?5,
            start_date = NULLIF(?6, ''),
            due_date = NULLIF(?7, ''),
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(project_id)
    .bind(&name)
    .bind(&description)
    .bind(status)
    .bind(owner_user_id)
    .bind(&start_date)
    .bind(&due_date)
    .execute(&mut *tx)
    .await?;

    if previous_owner_user_id != Some(owner_user_id) {
        sqlx::query(
            r#"
            UPDATE project_members
            SET member_role = 'maintainer',
                updated_at = datetime('now')
            WHERE project_id = ?1
              AND member_role = 'owner'
              AND user_id <> ?2
            "#,
        )
        .bind(project_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE project_members
            SET member_role = 'owner',
                updated_at = datetime('now')
            WHERE project_id = ?1
              AND user_id = ?2
            "#,
        )
        .bind(project_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await?;
    }

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
        VALUES (?1, ?2, 'project.updated', 'project', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&project_key)
    .bind(format!("更新项目 {name}"))
    .bind(format!(
        r#"{{"status":"{status}","owner_username":"{owner_username}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目更新后未找到".to_string()))
}

pub async fn get_project_detail(
    pool: &SqlitePool,
    project_key: &str,
) -> AppResult<Option<ProjectDetail>> {
    let row = sqlx::query_as::<
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
            String,
        ),
    >(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.description,
            p.status,
            COALESCE(u.username, '') AS owner_username,
            COALESCE(u.display_name, '') AS owner_display_name,
            COALESCE(p.start_date, '') AS start_date,
            COALESCE(p.due_date, '') AS due_date,
            p.created_at,
            p.updated_at
        FROM projects p
        LEFT JOIN users u ON u.id = p.owner_user_id
        WHERE p.project_key = ?1
        "#,
    )
    .bind(project_key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            project_key,
            name,
            description,
            status,
            owner_username,
            owner_display_name,
            start_date,
            due_date,
            created_at,
            updated_at,
        )| ProjectDetail {
            id,
            project_key,
            name,
            description,
            status,
            owner_username,
            owner_display_name,
            start_date,
            due_date,
            created_at,
            updated_at,
        },
    ))
}

pub async fn get_project_detail_by_id(
    pool: &SqlitePool,
    project_id: i64,
) -> AppResult<Option<ProjectDetail>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let row = sqlx::query_as::<
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
            String,
        ),
    >(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.description,
            p.status,
            COALESCE(u.username, '') AS owner_username,
            COALESCE(u.display_name, '') AS owner_display_name,
            COALESCE(p.start_date, '') AS start_date,
            COALESCE(p.due_date, '') AS due_date,
            p.created_at,
            p.updated_at
        FROM projects p
        LEFT JOIN users u ON u.id = p.owner_user_id
        WHERE p.id = ?1
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            project_key,
            name,
            description,
            status,
            owner_username,
            owner_display_name,
            start_date,
            due_date,
            created_at,
            updated_at,
        )| ProjectDetail {
            id,
            project_key,
            name,
            description,
            status,
            owner_username,
            owner_display_name,
            start_date,
            due_date,
            created_at,
            updated_at,
        },
    ))
}

pub async fn user_can_write_project_content(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<bool> {
    if is_super_admin {
        return Ok(true);
    }

    Ok(matches!(
        project_member_role(pool, project_id, user_id)
            .await?
            .as_deref(),
        Some("owner" | "maintainer" | "member")
    ))
}

pub async fn list_project_pending_counts_for_user(
    pool: &SqlitePool,
    user_id: i64,
) -> AppResult<Vec<ProjectPendingCounts>> {
    let rows = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        r#"
        SELECT
            wi.project_id,
            SUM(CASE WHEN wi.item_type = 'requirement' THEN 1 ELSE 0 END),
            SUM(CASE WHEN wi.item_type = 'task' THEN 1 ELSE 0 END),
            SUM(CASE WHEN wi.item_type = 'bug' THEN 1 ELSE 0 END)
        FROM work_items wi
        WHERE wi.assignee_user_id = ?1
          AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
          AND wi.deleted_at IS NULL
        GROUP BY wi.project_id
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(project_id, requirements, tasks, bugs)| ProjectPendingCounts {
                project_id,
                requirements,
                tasks,
                bugs,
            },
        )
        .collect())
}

pub async fn personal_project_analysis(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
) -> AppResult<PersonalProjectAnalysis> {
    let joined_at = sqlx::query_scalar::<_, String>(
        r#"
        SELECT COALESCE(
            (SELECT pm.joined_at FROM project_members pm
             WHERE pm.project_id = ?1 AND pm.user_id = ?2),
            (SELECT p.created_at FROM projects p WHERE p.id = ?1),
            datetime('now')
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let (completed_total, completed_requirements, completed_tasks, completed_bugs, completed_last_30_days) =
        sqlx::query_as::<_, (i64, i64, i64, i64, i64)>(
        r#"
        SELECT
            COUNT(*),
            COALESCE(SUM(CASE WHEN wi.item_type = 'requirement' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN wi.item_type = 'task' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN wi.item_type = 'bug' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN pa.created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0)
        FROM project_activities pa
        LEFT JOIN work_items wi ON wi.item_key = pa.target_id
        WHERE pa.project_id = ?1 AND pa.actor_user_id = ?2
          AND pa.target_type = 'work_item'
          AND pa.action IN ('work_item.status.updated', 'work_item.handoff', 'work_item.updated')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.status') ELSE NULL END
              IN ('done', 'resolved', 'verified', 'closed')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.previous_status') ELSE NULL END
              NOT IN ('done', 'resolved', 'verified', 'closed', 'cancelled')
        "#,
        )
            .bind(project_id)
            .bind(user_id)
            .fetch_one(pool)
            .await?;

    let pending_rows = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT item_type, COUNT(*)
        FROM work_items
        WHERE project_id = ?1
          AND assignee_user_id = ?2
          AND status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
          AND deleted_at IS NULL
        GROUP BY item_type
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let mut pending = WorkItemAssignmentCounts::default();
    for (item_type, count) in pending_rows {
        match item_type.as_str() {
            "requirement" => pending.requirements = count,
            "task" => pending.tasks = count,
            "bug" => pending.bugs = count,
            _ => {}
        }
    }

    let days = sqlx::query_scalar::<_, f64>(
        "SELECT MAX(1.0, julianday(date('now')) - julianday(date(?1)) + 1.0)",
    )
    .bind(&joined_at)
    .fetch_one(pool)
    .await?;
    let months = sqlx::query_scalar::<_, f64>(
        r#"
        SELECT CAST(MAX(1.0,
            (CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', ?1) AS INTEGER)) * 12
            + CAST(strftime('%m', 'now') AS INTEGER) - CAST(strftime('%m', ?1) AS INTEGER) + 1
        ) AS REAL)
        "#,
    )
    .bind(&joined_at)
    .fetch_one(pool)
    .await?;

    let daily_peak = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT date(pa.created_at), COUNT(*) FROM project_activities pa
        WHERE pa.project_id = ?1 AND pa.actor_user_id = ?2 AND pa.target_type = 'work_item'
          AND pa.action IN ('work_item.status.updated', 'work_item.handoff', 'work_item.updated')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.status') ELSE NULL END
              IN ('done', 'resolved', 'verified', 'closed')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.previous_status') ELSE NULL END
              NOT IN ('done', 'resolved', 'verified', 'closed', 'cancelled')
        GROUP BY date(pa.created_at) ORDER BY COUNT(*) DESC, date(pa.created_at) DESC LIMIT 1
        "#,
    )
        .bind(project_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    let monthly_peak = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT strftime('%Y-%m', pa.created_at), COUNT(*) FROM project_activities pa
        WHERE pa.project_id = ?1 AND pa.actor_user_id = ?2 AND pa.target_type = 'work_item'
          AND pa.action IN ('work_item.status.updated', 'work_item.handoff', 'work_item.updated')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.status') ELSE NULL END
              IN ('done', 'resolved', 'verified', 'closed')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.previous_status') ELSE NULL END
              NOT IN ('done', 'resolved', 'verified', 'closed', 'cancelled')
        GROUP BY strftime('%Y-%m', pa.created_at)
        ORDER BY COUNT(*) DESC, strftime('%Y-%m', pa.created_at) DESC LIMIT 1
        "#,
    )
        .bind(project_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    let active_days = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT date(created_at)) FROM project_activities WHERE project_id = ?1 AND actor_user_id = ?2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let comment_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_item_comments c
        JOIN work_items wi ON wi.id = c.work_item_id
        WHERE wi.project_id = ?1
          AND c.author_user_id = ?2
          AND c.deleted_at IS NULL
          AND c.body NOT LIKE '[yuance-flow] %'
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let handoff_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_activities WHERE project_id = ?1 AND actor_user_id = ?2 AND action = 'work_item.handoff'",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let recent_completions = sqlx::query_as::<_, (String, String, String, String)>(
        r#"
        SELECT pa.target_id, COALESCE(wi.item_type, ''), COALESCE(wi.title, pa.target_id), pa.created_at
        FROM project_activities pa
        LEFT JOIN work_items wi ON wi.item_key = pa.target_id
        WHERE pa.project_id = ?1 AND pa.actor_user_id = ?2 AND pa.target_type = 'work_item'
          AND pa.action IN ('work_item.status.updated', 'work_item.handoff', 'work_item.updated')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.status') ELSE NULL END
              IN ('done', 'resolved', 'verified', 'closed')
          AND CASE WHEN json_valid(pa.metadata) THEN json_extract(pa.metadata, '$.previous_status') ELSE NULL END
              NOT IN ('done', 'resolved', 'verified', 'closed', 'cancelled')
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT 8
        "#,
    )
        .bind(project_id)
        .bind(user_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(item_key, item_type, title, completed_at)| PersonalCompletion {
            item_key,
            item_type,
            title,
            completed_at,
        })
        .collect();

    Ok(PersonalProjectAnalysis {
        joined_at,
        completed_total,
        completed_requirements,
        completed_tasks,
        completed_bugs,
        completed_last_30_days,
        pending,
        daily_average: completed_total as f64 / days,
        daily_peak: daily_peak.as_ref().map_or(0, |(_, count)| *count),
        daily_peak_date: daily_peak.map_or_else(String::new, |(date, _)| date),
        monthly_average: completed_total as f64 / months,
        monthly_peak: monthly_peak.as_ref().map_or(0, |(_, count)| *count),
        monthly_peak_month: monthly_peak.map_or_else(String::new, |(month, _)| month),
        active_days,
        comment_count,
        handoff_count,
        recent_completions,
    })
}

struct CommentBodyInput<'a> {
    body: &'a str,
    body_format: &'a str,
}

pub async fn list_recent_activities(
    pool: &SqlitePool,
    limit: i64,
) -> AppResult<Vec<ProjectActivitySummary>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            pa.id,
            p.project_key,
            pa.summary,
            COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
            pa.created_at
        FROM project_activities pa
        JOIN projects p ON p.id = pa.project_id
        LEFT JOIN users u ON u.id = pa.actor_user_id
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, project_key, summary, actor_display_name, created_at)| ProjectActivitySummary {
                id,
                project_key,
                summary,
                actor_display_name,
                created_at,
            },
        )
        .collect())
}

pub async fn list_recent_activities_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    limit: i64,
) -> AppResult<Vec<ProjectActivitySummary>> {
    if is_super_admin {
        return list_recent_activities(pool, limit).await;
    }

    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            pa.id,
            p.project_key,
            pa.summary,
            COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
            pa.created_at
        FROM project_activities pa
        JOIN projects p ON p.id = pa.project_id
        JOIN project_members pm ON pm.project_id = p.id
            AND pm.user_id = ?1
        LEFT JOIN users u ON u.id = pa.actor_user_id
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ?2
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, project_key, summary, actor_display_name, created_at)| ProjectActivitySummary {
                id,
                project_key,
                summary,
                actor_display_name,
                created_at,
            },
        )
        .collect())
}

pub async fn list_project_activities(
    pool: &SqlitePool,
    project_id: i64,
    limit: i64,
) -> AppResult<Vec<ProjectActivitySummary>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            pa.id,
            p.project_key,
            pa.summary,
            COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
            pa.created_at
        FROM project_activities pa
        JOIN projects p ON p.id = pa.project_id
        LEFT JOIN users u ON u.id = pa.actor_user_id
        WHERE pa.project_id = ?1
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ?2
        "#,
    )
    .bind(project_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, project_key, summary, actor_display_name, created_at)| ProjectActivitySummary {
                id,
                project_key,
                summary,
                actor_display_name,
                created_at,
            },
        )
        .collect())
}

pub async fn list_project_activities_by_key(
    pool: &SqlitePool,
    project_key: &str,
    limit: i64,
) -> AppResult<Vec<ProjectActivitySummary>> {
    let project_key = validate_project_key(project_key)?;
    let Some(project_id) =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = ?1")
            .bind(project_key)
            .fetch_optional(pool)
            .await?
    else {
        return Ok(Vec::new());
    };

    list_project_activities(pool, project_id, limit).await
}

pub async fn search_visible(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    query: &str,
    limit: i64,
) -> AppResult<Vec<SearchHit>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let like = format!("%{query}%");
    let project_limit = limit.max(1);
    let work_item_limit = limit.max(1);
    let resource_limit = limit.max(1);
    let resource_search_match = resource_search_match_sql();
    let resource_search_context = resource_search_context_sql();

    let project_hits = if is_super_admin {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
            r#"
            SELECT
                'project' AS hit_type,
                p.project_key AS hit_key,
                p.name AS title,
                p.description AS context,
                '/web/projects/' || p.project_key AS url,
                p.updated_at
            FROM projects p
            WHERE p.project_key LIKE ?1
               OR p.name LIKE ?1
               OR p.description LIKE ?1
            ORDER BY p.updated_at DESC, p.id DESC
            LIMIT ?2
            "#,
        )
        .bind(&like)
        .bind(project_limit)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
            r#"
            SELECT
                'project' AS hit_type,
                p.project_key AS hit_key,
                p.name AS title,
                p.description AS context,
                '/web/projects/' || p.project_key AS url,
                p.updated_at
            FROM projects p
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = ?2
            WHERE p.project_key LIKE ?1
               OR p.name LIKE ?1
               OR p.description LIKE ?1
            ORDER BY p.updated_at DESC, p.id DESC
            LIMIT ?3
            "#,
        )
        .bind(&like)
        .bind(user_id)
        .bind(project_limit)
        .fetch_all(pool)
        .await?
    };

    let work_item_hits = if is_super_admin {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
            r#"
            SELECT
                wi.item_type AS hit_type,
                wi.item_key AS hit_key,
                wi.title,
                p.project_key || ' · ' || p.name AS context,
                '/web/work-items/' || wi.item_key AS url,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            WHERE (
                wi.item_key LIKE ?1
                OR wi.title LIKE ?1
                OR wi.description LIKE ?1
                OR p.project_key LIKE ?1
                OR p.name LIKE ?1
            )
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            LIMIT ?2
            "#,
        )
        .bind(&like)
        .bind(work_item_limit)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
            r#"
            SELECT
                wi.item_type AS hit_type,
                wi.item_key AS hit_key,
                wi.title,
                p.project_key || ' · ' || p.name AS context,
                '/web/work-items/' || wi.item_key AS url,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = ?2
            WHERE (
                wi.item_key LIKE ?1
                OR wi.title LIKE ?1
                OR wi.description LIKE ?1
                OR p.project_key LIKE ?1
                OR p.name LIKE ?1
            )
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            LIMIT ?3
            "#,
        )
        .bind(&like)
        .bind(user_id)
        .bind(work_item_limit)
        .fetch_all(pool)
        .await?
    };

    let resource_hits = if is_super_admin {
        let query_sql = format!(
            r#"
            SELECT
                'resource' AS hit_type,
                p.project_key || '-RES-' || pr.id AS hit_key,
                pr.title,
                {resource_search_context} AS context,
                '/web/projects/' || p.project_key || '/resources/' || pr.id AS url,
                pr.updated_at
            FROM project_resources pr
            JOIN projects p ON p.id = pr.project_id
            WHERE {resource_search_match}
            ORDER BY pr.updated_at DESC, pr.id DESC
            LIMIT ?2
            "#
        );
        sqlx::query_as::<_, (String, String, String, String, String, String)>(AssertSqlSafe(
            query_sql,
        ))
        .bind(&like)
        .bind(resource_limit)
        .fetch_all(pool)
        .await?
    } else {
        let query_sql = format!(
            r#"
            SELECT
                'resource' AS hit_type,
                p.project_key || '-RES-' || pr.id AS hit_key,
                pr.title,
                {resource_search_context} AS context,
                '/web/projects/' || p.project_key || '/resources/' || pr.id AS url,
                pr.updated_at
            FROM project_resources pr
            JOIN projects p ON p.id = pr.project_id
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = ?2
            WHERE {resource_search_match}
            ORDER BY pr.updated_at DESC, pr.id DESC
            LIMIT ?3
            "#
        );
        sqlx::query_as::<_, (String, String, String, String, String, String)>(AssertSqlSafe(
            query_sql,
        ))
        .bind(&like)
        .bind(user_id)
        .bind(resource_limit)
        .fetch_all(pool)
        .await?
    };

    let mut hits = project_hits
        .into_iter()
        .chain(work_item_hits)
        .chain(resource_hits)
        .map(
            |(hit_type, key, title, context, url, updated_at)| SearchHit {
                hit_type,
                key,
                title,
                context,
                url,
                updated_at,
            },
        )
        .collect::<Vec<_>>();
    hits.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    hits.truncate(limit.max(0) as usize);

    Ok(hits)
}

pub async fn search_visible_paginated(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    query: &str,
    include_projects: bool,
    include_work_items: bool,
    pagination: Pagination,
) -> AppResult<Paginated<SearchHit>> {
    let query = query.trim();
    let pagination = normalize_pagination(pagination)?;
    if query.is_empty() || (!include_projects && !include_work_items) {
        return Ok(Paginated {
            items: Vec::new(),
            page: pagination.page,
            per_page: pagination.per_page,
            total_items: 0,
        });
    }

    let like = format!("%{query}%");
    let resource_search_match = resource_search_match_sql();
    let resource_search_context = resource_search_context_sql();
    let total_items = if is_super_admin {
        let query_sql = format!(
            r#"
            SELECT COUNT(*)
            FROM (
                SELECT p.id AS sort_id
                FROM projects p
                WHERE ?2
                  AND (
                    p.project_key LIKE ?1
                    OR p.name LIKE ?1
                    OR p.description LIKE ?1
                  )
                UNION ALL
                SELECT wi.id AS sort_id
                FROM work_items wi
                JOIN projects p ON p.id = wi.project_id
                WHERE ?3
                  AND (
                    wi.item_key LIKE ?1
                    OR wi.title LIKE ?1
                    OR wi.description LIKE ?1
                    OR p.project_key LIKE ?1
                    OR p.name LIKE ?1
                  )
                  AND wi.deleted_at IS NULL
                UNION ALL
                SELECT pr.id AS sort_id
                FROM project_resources pr
                JOIN projects p ON p.id = pr.project_id
                WHERE ?2
                  AND {resource_search_match}
            ) hits
            "#,
        );
        let (total_items,) = sqlx::query_as::<_, (i64,)>(AssertSqlSafe(query_sql))
            .bind(&like)
            .bind(include_projects)
            .bind(include_work_items)
            .fetch_one(pool)
            .await?;
        total_items
    } else {
        let query_sql = format!(
            r#"
            SELECT COUNT(*)
            FROM (
                SELECT p.id AS sort_id
                FROM projects p
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?3
                  AND (
                    p.project_key LIKE ?1
                    OR p.name LIKE ?1
                    OR p.description LIKE ?1
                  )
                UNION ALL
                SELECT wi.id AS sort_id
                FROM work_items wi
                JOIN projects p ON p.id = wi.project_id
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?4
                  AND (
                    wi.item_key LIKE ?1
                    OR wi.title LIKE ?1
                    OR wi.description LIKE ?1
                    OR p.project_key LIKE ?1
                    OR p.name LIKE ?1
                  )
                  AND wi.deleted_at IS NULL
                UNION ALL
                SELECT pr.id AS sort_id
                FROM project_resources pr
                JOIN projects p ON p.id = pr.project_id
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?3
                  AND {resource_search_match}
            ) hits
            "#,
        );
        let (total_items,) = sqlx::query_as::<_, (i64,)>(AssertSqlSafe(query_sql))
            .bind(&like)
            .bind(user_id)
            .bind(include_projects)
            .bind(include_work_items)
            .fetch_one(pool)
            .await?;
        total_items
    };

    let rows = if is_super_admin {
        let query_sql = format!(
            r#"
            SELECT hit_type, hit_key, title, context, url, updated_at
            FROM (
                SELECT
                    'project' AS hit_type,
                    p.project_key AS hit_key,
                    p.name AS title,
                    p.description AS context,
                    '/web/projects/' || p.project_key AS url,
                    p.updated_at
                FROM projects p
                WHERE ?2
                  AND (
                    p.project_key LIKE ?1
                    OR p.name LIKE ?1
                    OR p.description LIKE ?1
                  )
                UNION ALL
                SELECT
                    wi.item_type AS hit_type,
                    wi.item_key AS hit_key,
                    wi.title,
                    p.project_key || ' · ' || p.name AS context,
                    '/web/work-items/' || wi.item_key AS url,
                    wi.updated_at
                FROM work_items wi
                JOIN projects p ON p.id = wi.project_id
                WHERE ?3
                  AND (
                    wi.item_key LIKE ?1
                    OR wi.title LIKE ?1
                    OR wi.description LIKE ?1
                    OR p.project_key LIKE ?1
                    OR p.name LIKE ?1
                  )
                  AND wi.deleted_at IS NULL
                UNION ALL
                SELECT
                    'resource' AS hit_type,
                    p.project_key || '-RES-' || pr.id AS hit_key,
                    pr.title,
                    {resource_search_context} AS context,
                    '/web/projects/' || p.project_key || '/resources/' || pr.id AS url,
                    pr.updated_at
                FROM project_resources pr
                JOIN projects p ON p.id = pr.project_id
                WHERE ?2
                  AND {resource_search_match}
            ) hits
            ORDER BY updated_at DESC, hit_key DESC
            LIMIT ?4 OFFSET ?5
            "#,
        );
        sqlx::query_as::<_, (String, String, String, String, String, String)>(AssertSqlSafe(
            query_sql,
        ))
        .bind(&like)
        .bind(include_projects)
        .bind(include_work_items)
        .bind(pagination.per_page)
        .bind(pagination.offset())
        .fetch_all(pool)
        .await?
    } else {
        let query_sql = format!(
            r#"
            SELECT hit_type, hit_key, title, context, url, updated_at
            FROM (
                SELECT
                    'project' AS hit_type,
                    p.project_key AS hit_key,
                    p.name AS title,
                    p.description AS context,
                    '/web/projects/' || p.project_key AS url,
                    p.updated_at
                FROM projects p
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?3
                  AND (
                    p.project_key LIKE ?1
                    OR p.name LIKE ?1
                    OR p.description LIKE ?1
                  )
                UNION ALL
                SELECT
                    wi.item_type AS hit_type,
                    wi.item_key AS hit_key,
                    wi.title,
                    p.project_key || ' · ' || p.name AS context,
                    '/web/work-items/' || wi.item_key AS url,
                    wi.updated_at
                FROM work_items wi
                JOIN projects p ON p.id = wi.project_id
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?4
                  AND (
                    wi.item_key LIKE ?1
                    OR wi.title LIKE ?1
                    OR wi.description LIKE ?1
                    OR p.project_key LIKE ?1
                    OR p.name LIKE ?1
                  )
                  AND wi.deleted_at IS NULL
                UNION ALL
                SELECT
                    'resource' AS hit_type,
                    p.project_key || '-RES-' || pr.id AS hit_key,
                    pr.title,
                    {resource_search_context} AS context,
                    '/web/projects/' || p.project_key || '/resources/' || pr.id AS url,
                    pr.updated_at
                FROM project_resources pr
                JOIN projects p ON p.id = pr.project_id
                JOIN project_members pm ON pm.project_id = p.id
                    AND pm.user_id = ?2
                WHERE ?3
                  AND {resource_search_match}
            ) hits
            ORDER BY updated_at DESC, hit_key DESC
            LIMIT ?5 OFFSET ?6
            "#,
        );
        sqlx::query_as::<_, (String, String, String, String, String, String)>(AssertSqlSafe(
            query_sql,
        ))
        .bind(&like)
        .bind(user_id)
        .bind(include_projects)
        .bind(include_work_items)
        .bind(pagination.per_page)
        .bind(pagination.offset())
        .fetch_all(pool)
        .await?
    };

    let items = rows
        .into_iter()
        .map(
            |(hit_type, key, title, context, url, updated_at)| SearchHit {
                hit_type,
                key,
                title,
                context,
                url,
                updated_at,
            },
        )
        .collect();

    Ok(Paginated {
        items,
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
}

fn resource_search_category_sql() -> &'static str {
    r#"
    CASE pr.category
        WHEN 'integration' THEN '开发资料'
        WHEN 'customer' THEN '客户资料'
        WHEN 'meeting' THEN '会议纪要'
        WHEN 'implementation' THEN '实施文档'
        ELSE '其他'
    END
    "#
}

fn resource_search_match_sql() -> String {
    format!(
        r#"
        (
            p.project_key LIKE ?1
            OR p.name LIKE ?1
            OR (p.project_key || '-RES-' || pr.id) LIKE ?1
            OR pr.title LIKE ?1
            OR ({}) LIKE ?1
            OR (pr.access_password_hash = '' AND pr.body LIKE ?1)
        )
        "#,
        resource_search_category_sql()
    )
}

fn resource_search_context_sql() -> String {
    format!(
        r#"
        p.project_key
        || ' · '
        || p.name
        || ' · '
        || ({})
        || CASE WHEN pr.status = 'archived' THEN ' · 已归档' ELSE '' END
        || CASE WHEN pr.access_password_hash <> '' THEN ' · 受保护资料' ELSE '' END
        "#,
        resource_search_category_sql()
    )
}

fn normalize_project_filter(filter: ProjectListFilter) -> AppResult<NormalizedProjectFilter> {
    let status = match filter.status.trim() {
        "" => String::new(),
        value => validate_project_status(value)?.to_string(),
    };
    let keyword = validate_optional_text(&filter.keyword, "项目关键词", 120)?;
    let keyword_like = if keyword.is_empty() {
        String::new()
    } else {
        format!("%{}%", keyword)
    };

    Ok(NormalizedProjectFilter {
        status,
        keyword,
        keyword_like,
    })
}

fn normalize_pagination(pagination: Pagination) -> AppResult<Pagination> {
    if pagination.page < 1 {
        return Err(AppError::BadRequest("页码不能小于 1".to_string()));
    }
    if pagination.per_page < 1 {
        return Err(AppError::BadRequest("每页数量不能小于 1".to_string()));
    }
    Ok(pagination)
}

async fn count_project_summaries(
    pool: &SqlitePool,
    normalized: &NormalizedProjectFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM projects p
        WHERE (?1 = '' OR p.status = ?1)
          AND (?2 = '' OR p.name LIKE ?2 OR p.project_key LIKE ?2)
        "#,
    )
    .bind(&normalized.status)
    .bind(&normalized.keyword_like)
    .fetch_one(pool)
    .await?)
}

async fn count_project_summaries_for_user(
    pool: &SqlitePool,
    user_id: i64,
    normalized: &NormalizedProjectFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
            AND pm.user_id = ?1
        WHERE (?2 = '' OR p.status = ?2)
          AND (?3 = '' OR p.name LIKE ?3 OR p.project_key LIKE ?3)
        "#,
    )
    .bind(user_id)
    .bind(&normalized.status)
    .bind(&normalized.keyword_like)
    .fetch_one(pool)
    .await?)
}

#[derive(Debug, Clone)]
struct WorkItemSavedViewScope {
    project_id: i64,
    project_key: String,
    item_type: String,
}

fn validate_project_key(project_key: &str) -> AppResult<String> {
    let project_key = project_key.trim().to_ascii_uppercase();
    if project_key.len() < 2 || project_key.len() > 16 {
        return Err(AppError::BadRequest(
            "项目编号长度必须为 2-16 个字符".to_string(),
        ));
    }
    if !project_key
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || matches!(c, '_' | '-'))
    {
        return Err(AppError::BadRequest(
            "项目编号只能包含大写字母、数字、下划线和中划线".to_string(),
        ));
    }
    Ok(project_key)
}

fn generate_project_key() -> String {
    let date = (Utc::now() + Duration::hours(8)).format("%y%m%d");
    let mut rng = OsRng;
    let random_code = rng.next_u32() % 1_000_000;
    format!("P{date}{random_code:06}")
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

#[derive(Debug, Clone)]
struct PreparedWorkItemCommentBody {
    body: String,
    body_format: String,
    plain_text: String,
}

#[derive(Debug, Clone)]
struct WorkItemMentionTarget {
    user_id: i64,
    username: String,
}

fn normalized_plain_summary(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn resolve_project_mention_targets(
    pool: &SqlitePool,
    project_id: i64,
    usernames: &[String],
) -> AppResult<Vec<WorkItemMentionTarget>> {
    if usernames.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = sqlx::QueryBuilder::<Sqlite>::new(
        r#"
        SELECT u.id, u.username, u.display_name
        FROM users u
        JOIN project_members pm ON pm.user_id = u.id
        WHERE pm.project_id = "#,
    );
    query
        .push_bind(project_id)
        .push(" AND u.status = 'active' AND u.username IN (");
    {
        let mut separated = query.separated(", ");
        for username in usernames {
            separated.push_bind(username);
        }
    }
    query.push(")");

    let resolved = query
        .build_query_as::<(i64, String, String)>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|(user_id, username, _display_name)| WorkItemMentionTarget { user_id, username })
        .collect::<Vec<_>>();
    let missing = usernames
        .iter()
        .filter(|username| !resolved.iter().any(|target| &target.username == *username))
        .cloned()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(AppError::BadRequest(format!(
            "以下被提及用户不是当前项目成员：{}",
            missing.join("、")
        )));
    }

    Ok(resolved)
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

fn strip_inline_attachment_nodes(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some((start, end)) = next_inline_attachment_range(remaining) {
        output.push_str(&remaining[..start]);
        output.push(' ');
        remaining = &remaining[end..];
    }
    output.push_str(remaining);
    output
}

fn strip_inline_attachment_node(value: &str, attachment_id: i64) -> String {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some((start, end)) = next_inline_attachment_range_for_id(remaining, attachment_id) {
        output.push_str(&remaining[..start]);
        remaining = &remaining[end..];
    }
    output.push_str(remaining);
    output
}

fn next_inline_attachment_range_for_id(value: &str, attachment_id: i64) -> Option<(usize, usize)> {
    let figure = rich_attachment_tag_range_for_id(value, "figure", attachment_id);
    let link = rich_attachment_tag_range_for_id(value, "a", attachment_id);
    match (figure, link) {
        (Some(left), Some(right)) => Some(if left.0 <= right.0 { left } else { right }),
        (Some(range), None) | (None, Some(range)) => Some(range),
        (None, None) => None,
    }
}

fn rich_attachment_tag_range_for_id(
    value: &str,
    tag: &str,
    attachment_id: i64,
) -> Option<(usize, usize)> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut search_from = 0;
    while let Some(relative_start) = value[search_from..].find(&open) {
        let start = search_from + relative_start;
        let after_start = &value[start..];
        let relative_tag_end = after_start.find('>')?;
        let tag_end = start + relative_tag_end + 1;
        let open_tag = &value[start..tag_end];
        let matches_id = html_attribute_value(open_tag, "data-yuance-attachment-id")
            .and_then(|value| value.parse::<i64>().ok())
            == Some(attachment_id);
        if !matches_id {
            search_from = tag_end;
            continue;
        }
        let relative_close_start = value[tag_end..].find(&close)?;
        return Some((start, tag_end + relative_close_start + close.len()));
    }
    None
}

fn next_inline_attachment_range(value: &str) -> Option<(usize, usize)> {
    let figure = rich_attachment_tag_range(value, "figure");
    let link = rich_attachment_tag_range(value, "a");
    match (figure, link) {
        (Some(left), Some(right)) => Some(if left.0 <= right.0 { left } else { right }),
        (Some(range), None) | (None, Some(range)) => Some(range),
        (None, None) => None,
    }
}

fn rich_attachment_tag_range(value: &str, tag: &str) -> Option<(usize, usize)> {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut search_from = 0;
    while let Some(relative_start) = value[search_from..].find(&open) {
        let start = search_from + relative_start;
        let after_start = &value[start..];
        let relative_tag_end = after_start.find('>')?;
        let tag_end = start + relative_tag_end + 1;
        let open_tag = &value[start..tag_end];
        if !open_tag.contains("data-yuance-attachment-kind=") {
            search_from = tag_end;
            continue;
        }
        let after_tag = &value[tag_end..];
        let relative_close_start = after_tag.find(&close)?;
        let end = tag_end + relative_close_start + close.len();
        return Some((start, end));
    }
    None
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

const DRAFT_ATTACHMENT_URL_PREFIX: &str = "/web/projects/";
const DRAFT_ATTACHMENT_URL_MARKER: &str = "/work-item-draft-attachments/";
const DRAFT_ATTACHMENT_URL_SUFFIX: &str = "/download";

fn validate_optional_date(value: &str, field_name: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }

    let [year, month, day] = value
        .split('-')
        .collect::<Vec<_>>()
        .try_into()
        .map_err(|_| AppError::BadRequest(format!("{field_name}必须是 YYYY-MM-DD 格式")))?;
    if year.len() != 4 || month.len() != 2 || day.len() != 2 {
        return Err(AppError::BadRequest(format!(
            "{field_name}必须是 YYYY-MM-DD 格式"
        )));
    }

    let year = parse_date_part(year, field_name)?;
    let month = parse_date_part(month, field_name)?;
    let day = parse_date_part(day, field_name)?;
    if !(1..=12).contains(&month) {
        return Err(AppError::BadRequest(format!("{field_name}月份无效")));
    }
    let max_day = days_in_month(year, month);
    if day < 1 || day > max_day {
        return Err(AppError::BadRequest(format!("{field_name}日期无效")));
    }

    Ok(value.to_string())
}

fn validate_date_range(start_date: &str, due_date: &str, message: &str) -> AppResult<()> {
    if !start_date.is_empty() && !due_date.is_empty() && due_date < start_date {
        return Err(AppError::BadRequest(message.to_string()));
    }
    Ok(())
}

fn parse_date_part(value: &str, field_name: &str) -> AppResult<i32> {
    if !value.chars().all(|char| char.is_ascii_digit()) {
        return Err(AppError::BadRequest(format!(
            "{field_name}必须是 YYYY-MM-DD 格式"
        )));
    }
    value
        .parse::<i32>()
        .map_err(|_| AppError::BadRequest(format!("{field_name}必须是 YYYY-MM-DD 格式")))
}

fn days_in_month(year: i32, month: i32) -> i32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn validate_project_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "" | PROJECT_STATUS_NOT_STARTED => Ok(PROJECT_STATUS_NOT_STARTED),
        PROJECT_STATUS_IN_PROGRESS => Ok(PROJECT_STATUS_IN_PROGRESS),
        PROJECT_STATUS_ACCEPTANCE => Ok(PROJECT_STATUS_ACCEPTANCE),
        PROJECT_STATUS_COMPLETED => Ok(PROJECT_STATUS_COMPLETED),
        PROJECT_STATUS_ON_HOLD => Ok(PROJECT_STATUS_ON_HOLD),
        PROJECT_STATUS_CANCELLED => Ok(PROJECT_STATUS_CANCELLED),
        PROJECT_STATUS_ARCHIVED => Ok(PROJECT_STATUS_ARCHIVED),
        _ => Err(AppError::BadRequest(
            "项目状态只能是 not_started / in_progress / acceptance / completed / on_hold / cancelled / archived".to_string(),
        )),
    }
}

fn validate_project_status_transition(from: &str, to: &str) -> AppResult<()> {
    if from == to {
        return Ok(());
    }

    let allowed = match from {
        PROJECT_STATUS_NOT_STARTED => {
            matches!(to, PROJECT_STATUS_IN_PROGRESS | PROJECT_STATUS_CANCELLED)
        }
        PROJECT_STATUS_IN_PROGRESS => {
            matches!(
                to,
                PROJECT_STATUS_ACCEPTANCE | PROJECT_STATUS_ON_HOLD | PROJECT_STATUS_CANCELLED
            )
        }
        PROJECT_STATUS_ACCEPTANCE => {
            matches!(
                to,
                PROJECT_STATUS_IN_PROGRESS
                    | PROJECT_STATUS_COMPLETED
                    | PROJECT_STATUS_ON_HOLD
                    | PROJECT_STATUS_CANCELLED
            )
        }
        PROJECT_STATUS_ON_HOLD => {
            matches!(to, PROJECT_STATUS_IN_PROGRESS | PROJECT_STATUS_CANCELLED)
        }
        PROJECT_STATUS_COMPLETED => {
            matches!(to, PROJECT_STATUS_IN_PROGRESS | PROJECT_STATUS_ARCHIVED)
        }
        PROJECT_STATUS_CANCELLED => {
            matches!(to, PROJECT_STATUS_NOT_STARTED | PROJECT_STATUS_ARCHIVED)
        }
        PROJECT_STATUS_ARCHIVED => {
            matches!(
                to,
                PROJECT_STATUS_COMPLETED | PROJECT_STATUS_CANCELLED | PROJECT_STATUS_IN_PROGRESS
            )
        }
        _ => false,
    };

    if allowed {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "项目状态不能从 {} 切换到 {}",
            project_status_label(from),
            project_status_label(to)
        )))
    }
}

pub fn ensure_project_accepts_writes(status: &str) -> AppResult<()> {
    match status {
        PROJECT_STATUS_NOT_STARTED | PROJECT_STATUS_IN_PROGRESS | PROJECT_STATUS_ACCEPTANCE => {
            Ok(())
        }
        PROJECT_STATUS_ON_HOLD => Err(AppError::BadRequest(
            "项目已暂停，不能执行写入操作".to_string(),
        )),
        PROJECT_STATUS_COMPLETED => Err(AppError::BadRequest(
            "项目已完成，不能执行写入操作".to_string(),
        )),
        PROJECT_STATUS_CANCELLED => Err(AppError::BadRequest(
            "项目已取消，不能执行写入操作".to_string(),
        )),
        PROJECT_STATUS_ARCHIVED => Err(AppError::BadRequest(
            "项目已归档，不能执行写入操作".to_string(),
        )),
        _ => Err(AppError::BadRequest(
            "项目状态异常，不能执行写入操作".to_string(),
        )),
    }
}

fn project_status_label(status: &str) -> &'static str {
    match status {
        PROJECT_STATUS_NOT_STARTED => "待启动",
        PROJECT_STATUS_IN_PROGRESS => "进行中",
        PROJECT_STATUS_ACCEPTANCE => "验收中",
        PROJECT_STATUS_COMPLETED => "已完成",
        PROJECT_STATUS_ON_HOLD => "已暂停",
        PROJECT_STATUS_CANCELLED => "已取消",
        PROJECT_STATUS_ARCHIVED => "已归档",
        _ => "未知",
    }
}

fn normalize_actor_display_name_snapshot(display_name: &str) -> String {
    display_name.trim().chars().take(160).collect()
}

fn assignee_label(display_name: &str) -> &str {
    let display_name = display_name.trim();
    if display_name.is_empty() {
        "未分配"
    } else {
        display_name
    }
}

type WorkItemCommentRow = (
    i64,
    String,
    String,
    i64,
    Option<i64>,
    String,
    String,
    String,
    String,
    Option<i64>,
    String,
);

async fn resolve_active_user_id(pool: &SqlitePool, username: &str) -> AppResult<i64> {
    let username = validate_username_ref(username)?;
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT id
        FROM users
        WHERE username = ?1
          AND status = 'active'
          AND is_super_admin = 0
        "#,
    )
    .bind(&username)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("排期对象必须是已启用的非超级管理员用户".to_string()))
}

fn validate_priority(priority: &str) -> AppResult<&'static str> {
    match priority.trim() {
        "" | "P2" => Ok("P2"),
        "P0" => Ok("P0"),
        "P1" => Ok("P1"),
        "P3" => Ok("P3"),
        _ => Err(AppError::BadRequest(
            "优先级只能是 P0 / P1 / P2 / P3".to_string(),
        )),
    }
}

fn validate_username_ref(username: &str) -> AppResult<String> {
    let username = username.trim();
    if username.len() < 3 || username.len() > 64 {
        return Err(AppError::BadRequest(
            "用户名长度必须为 3-64 个字符".to_string(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err(AppError::BadRequest(
            "用户名只能包含字母、数字、下划线、中划线和点".to_string(),
        ));
    }
    Ok(username.to_string())
}

async fn seed_demo_projects(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    let projects = [
        (
            "YCE",
            "元策 MVP",
            "统一项目、需求、任务、Bug 的轻量项目管理系统。",
            PROJECT_STATUS_IN_PROGRESS,
        ),
        (
            "OPS",
            "交付运维台",
            "沉淀迁移、审计、配置和运行态验证能力。",
            PROJECT_STATUS_NOT_STARTED,
        ),
        (
            "CRM",
            "客户线索同步",
            "从 CRM 视角验证项目协作和外部集成边界。",
            PROJECT_STATUS_ON_HOLD,
        ),
        (
            "BI",
            "经营分析 BI",
            "指标看板、报表订阅与经营数据洞察。",
            PROJECT_STATUS_IN_PROGRESS,
        ),
        (
            "WMS",
            "仓储管理",
            "入库、出库、库存盘点与物流协同。",
            PROJECT_STATUS_IN_PROGRESS,
        ),
        (
            "CMS",
            "内容中台",
            "内容发布、审核与多渠道分发。",
            PROJECT_STATUS_NOT_STARTED,
        ),
        (
            "OA",
            "OA 办公",
            "审批、日程、公告与行政协同。",
            PROJECT_STATUS_NOT_STARTED,
        ),
        (
            "IOT",
            "设备物联",
            "设备接入、遥测采集与告警规则。",
            PROJECT_STATUS_ON_HOLD,
        ),
        (
            "PAY",
            "支付网关",
            "交易、账单、退款与渠道对账。",
            PROJECT_STATUS_IN_PROGRESS,
        ),
        (
            "IM",
            "即时通讯",
            "会话、消息、群组与消息回调。",
            PROJECT_STATUS_ACCEPTANCE,
        ),
        (
            "OPEN",
            "开放平台",
            "OpenAPI、应用凭证与第三方接入。",
            PROJECT_STATUS_COMPLETED,
        ),
        (
            "TRAIN",
            "培训学习",
            "课程、学习进度与培训考核。",
            PROJECT_STATUS_ON_HOLD,
        ),
    ];

    for (project_key, name, description, status) in projects {
        sqlx::query(
            r#"
            INSERT INTO projects (
                project_key,
                name,
                description,
                status,
                owner_user_id
            )
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(project_key) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                status = excluded.status,
                owner_user_id = excluded.owner_user_id,
                updated_at = datetime('now')
            "#,
        )
        .bind(project_key)
        .bind(name)
        .bind(description)
        .bind(status)
        .bind(owner_user_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn seed_demo_activities(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    let activities = [
        (
            "demo:YCE:architecture-confirmed",
            "YCE",
            "plan.confirmed",
            "project",
            "YCE",
            "架构计划已确认",
        ),
        (
            "demo:YCE:rbac-selected",
            "YCE",
            "rbac.selected",
            "project",
            "YCE",
            "RBAC 采用轻量权限点模型",
        ),
        (
            "demo:YCE:storage-selected",
            "YCE",
            "storage.selected",
            "project",
            "YCE",
            "对象存储第一版锁定阿里云 OSS",
        ),
    ];

    for (activity_key, project_key, action, target_type, target_id, summary) in activities {
        sqlx::query(
            r#"
            INSERT INTO project_activities (
                activity_key,
                project_id,
                actor_user_id,
                action,
                target_type,
                target_id,
                summary
            )
            SELECT
                ?1,
                p.id,
                ?3,
                ?4,
                ?5,
                ?6,
                ?7
            FROM projects p
            WHERE p.project_key = ?2
            ON CONFLICT(activity_key) DO UPDATE SET
                actor_user_id = excluded.actor_user_id,
                action = excluded.action,
                target_type = excluded.target_type,
                target_id = excluded.target_id,
                summary = excluded.summary
            "#,
        )
        .bind(activity_key)
        .bind(project_key)
        .bind(owner_user_id)
        .bind(action)
        .bind(target_type)
        .bind(target_id)
        .bind(summary)
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::platform::error::AppError;

    use super::{
        WorkItemCommentSummary, prepare_work_item_comment_body, strip_inline_attachment_node,
        work_item_comment_body_html_for_display, work_item_description_html_for_display,
        work_item_description_summary, work_item_primary_post, work_item_primary_post_summary,
    };

    #[test]
    fn time_allocation_hours_preserve_finite_positive_boundary() {
        for hours in [
            f64::NAN,
            f64::NEG_INFINITY,
            f64::INFINITY,
            -1.0,
            -0.0,
            0.0,
            24.1,
        ] {
            assert!(
                super::validate_time_allocation_input(
                    "admin",
                    "2026-10-08",
                    "2026-10-09",
                    hours,
                    "",
                    ""
                )
                .is_err()
            );
        }
        for hours in [0.001, 8.0, 24.0] {
            let validated = super::validate_time_allocation_input(
                "admin",
                "2026-10-08",
                "2026-10-09",
                hours,
                "",
                "",
            )
            .expect("valid hours should be retained");
            assert_eq!(validated.3, hours);
        }
    }

    #[test]
    fn empty_primary_post_reports_subject_specific_message() {
        assert!(matches!(
            prepare_work_item_comment_body("<p><br></p>", "html", "主内容"),
            Err(AppError::BadRequest(message)) if message.contains("主内容不能为空")
        ));
    }

    #[test]
    fn media_only_primary_post_body_is_accepted() {
        let body = concat!(
            "<figure data-yuance-attachment-id=\"7\" data-yuance-attachment-kind=\"image\">",
            "<img src=\"/web/work-items/YCE-TASK-1/comments/3/attachments/7/download\">",
            "</figure>"
        );

        let prepared =
            prepare_work_item_comment_body(body, "html", "主内容").expect("只含图片的主内容应通过");

        assert!(prepared.plain_text.is_empty());
        assert!(prepared.body.contains("/comments/3/attachments/7/download"));
    }

    #[test]
    fn inline_attachment_removal_only_removes_the_target_node() {
        let html = concat!(
            "<p>正文</p>",
            "<figure data-yuance-attachment-id=\"7\" data-yuance-attachment-kind=\"image\"><img src=\"/seven\"></figure>",
            "<a data-yuance-attachment-id=\"17\" data-yuance-attachment-kind=\"file\" href=\"/seventeen\">17</a>",
            "<a data-yuance-attachment-id=\"7\" data-yuance-attachment-kind=\"file\" href=\"/seven\">7</a>"
        );

        let updated = strip_inline_attachment_node(html, 7);

        assert_eq!(
            updated,
            "<p>正文</p><a data-yuance-attachment-id=\"17\" data-yuance-attachment-kind=\"file\" href=\"/seventeen\">17</a>"
        );
    }

    #[test]
    fn work_item_primary_post_matches_a_truncated_long_summary() {
        let body = format!("<p>{}</p>", "长".repeat(6000));
        let summary = work_item_primary_post_summary(&body, "html");
        let comments = vec![WorkItemCommentSummary {
            id: 17,
            parent_comment_id: None,
            parent_author_display_name: String::new(),
            body,
            body_format: "html".to_string(),
            author_user_id: Some(3),
            author_username: "reporter".to_string(),
            author_display_name: "报告人".to_string(),
            created_at: "2026-08-08T00:00:00Z".to_string(),
            updated_at: "2026-08-08T00:00:00Z".to_string(),
            is_flow: false,
            is_draft: false,
        }];

        assert_eq!(summary.chars().count(), 5000);
        assert_eq!(
            work_item_primary_post(&comments, None, "reporter", &summary).map(|comment| comment.id),
            Some(17)
        );
    }

    #[test]
    fn work_item_description_summary_supports_plain_and_rich_legacy_content() {
        assert_eq!(
            work_item_description_summary("历史纯文本说明"),
            "历史纯文本说明"
        );
        assert_eq!(
            work_item_description_summary("<p>历史富文本说明</p>"),
            "历史富文本说明"
        );
    }

    #[test]
    fn work_item_description_treats_table_html_as_rich_text() {
        let html = "<table><tbody><tr><td>单元格</td></tr></tbody></table>";

        let rendered = work_item_description_html_for_display(html, "YCE-TASK-1");

        assert!(rendered.contains("<table>"));
        assert!(rendered.contains("<td>单元格</td>"));
    }

    #[test]
    fn work_item_description_preserves_file_card_dataset_attributes() {
        let html = concat!(
            "<a data-yuance-attachment-id=\"7\" ",
            "data-yuance-attachment-kind=\"file\" ",
            "data-yuance-align=\"left\" ",
            "data-yuance-file-kind=\"text\" ",
            "data-yuance-file-ext=\"TXT\" ",
            "href=\"/web/work-items/YCE-TASK-1/attachments/7/download\" ",
            "title=\"demo.txt\">demo.txt</a>"
        );

        let rendered = work_item_description_html_for_display(html, "YCE-TASK-1");

        assert!(rendered.contains("data-yuance-attachment-kind=\"file\""));
        assert!(rendered.contains("data-yuance-file-kind=\"text\""));
        assert!(rendered.contains("data-yuance-file-ext=\"TXT\""));
    }

    #[test]
    fn work_item_description_preserves_span_text_style_properties() {
        let html = r#"<p><span style="color: blue; font-size: x-large; text-decoration: underline">标题色</span></p>"#;

        let rendered = work_item_description_html_for_display(html, "YCE-TASK-1");

        assert!(rendered.contains("style=\"color:blue"));
        assert!(rendered.contains("font-size:x-large"));
        assert!(!rendered.contains("text-decoration"));
    }

    #[test]
    fn work_item_comment_preserves_span_text_style_properties() {
        let html = r#"<p><span style="color: green; font-size: medium">评论色</span></p>"#;

        let rendered = work_item_comment_body_html_for_display(html, "html", false);

        assert!(rendered.contains("style=\"color:green"));
        assert!(rendered.contains("font-size:medium"));
    }

    #[test]
    fn work_item_comment_preserves_markdown_html_blocks_and_strips_unsafe_links() {
        let html = concat!(
            "<h2>接口说明</h2>",
            "<blockquote>需要先创建测试数据</blockquote>",
            "<pre><code>curl https://example.com</code></pre>",
            "<hr>",
            "<p><a href=\"javascript:alert(1)\">bad</a></p>"
        );

        let rendered = work_item_comment_body_html_for_display(html, "html", false);

        assert!(rendered.contains("<h2>接口说明</h2>"));
        assert!(rendered.contains("<blockquote>需要先创建测试数据</blockquote>"));
        assert!(rendered.contains("<pre><code>curl https://example.com</code></pre>"));
        assert!(rendered.contains("<hr"));
        assert!(!rendered.contains("javascript:"));
    }

    #[test]
    fn work_item_description_preserves_markdown_html_blocks() {
        let html = concat!(
            "<h3>排查步骤</h3>",
            "<pre><code>pnpm install</code></pre>",
            "<blockquote>先切到测试项目</blockquote>"
        );

        let rendered = work_item_description_html_for_display(html, "YCE-TASK-1");

        assert!(rendered.contains("<h3>排查步骤</h3>"));
        assert!(rendered.contains("<pre><code>pnpm install</code></pre>"));
        assert!(rendered.contains("<blockquote>先切到测试项目</blockquote>"));
    }
}

// ---------- 时间管理排期 ----------

#[derive(Debug, Clone)]
pub struct TimeAllocationDetail {
    pub id: i64,
    pub project_key: String,
    pub project_name: String,
    pub username: String,
    pub display_name: String,
    pub start_date: String,
    pub end_date: String,
    pub daily_hours: f64,
    pub phase_task_name: String,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateTimeAllocationInput {
    pub username: String,
    pub start_date: String,
    pub end_date: String,
    pub daily_hours: f64,
    pub phase_task_name: String,
    pub note: String,
}

#[derive(Debug, Clone)]
pub struct UpdateTimeAllocationInput {
    pub username: String,
    pub start_date: String,
    pub end_date: String,
    pub daily_hours: f64,
    pub phase_task_name: String,
    pub note: String,
}

#[derive(Debug, Clone, Default)]
pub struct TimeAllocationListFilter {
    pub project_key: String,
    pub username: String,
    pub start_date: String,
    pub end_date: String,
    pub user_id: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimeAllocationFieldChange {
    pub field: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct TimeAllocationChangeRecord {
    pub id: i64,
    pub allocation_id: i64,
    pub project_key: String,
    pub project_name: String,
    pub action: String,
    pub actor_username: String,
    pub actor_display_name: String,
    pub summary: String,
    pub changes: Vec<TimeAllocationFieldChange>,
    pub before: Option<Value>,
    pub after: Option<Value>,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct TimeAllocationChangeRecordMeta {
    pub record_id: i64,
    pub project_id: i64,
    pub project_key: String,
    pub project_status: String,
    pub allocation_id: i64,
    pub action: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

#[derive(Debug, Clone, Default)]
pub struct TimeAllocationChangeFilter {
    pub project_key: String,
    pub actor: String,
    pub user_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeAllocationMember {
    pub username: String,
    pub display_name: String,
}

pub async fn list_time_management_members(
    pool: &SqlitePool,
    user_id: i64,
) -> AppResult<Vec<TimeAllocationMember>> {
    let rows = if user_id == 0 {
        sqlx::query_as::<_, (String, String)>(
            r#"
            SELECT u.username, u.display_name
            FROM users u
            WHERE u.status = 'active'
              AND u.is_super_admin = 0
            ORDER BY u.display_name ASC, u.username ASC
            "#,
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String)>(
            r#"
            SELECT DISTINCT u.username, u.display_name
            FROM users u
            JOIN project_members pm ON pm.user_id = u.id
            JOIN project_members mine
              ON mine.project_id = pm.project_id
             AND mine.user_id = ?1
            WHERE u.status = 'active'
              AND u.is_super_admin = 0
            ORDER BY u.display_name ASC, u.username ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?
    };

    Ok(rows
        .into_iter()
        .map(|(username, display_name)| TimeAllocationMember {
            username,
            display_name,
        })
        .collect())
}

const TIME_ALLOCATION_SELECT: &str = r#"
SELECT
    pta.id,
    p.project_key,
    p.name AS project_name,
    u.username,
    u.display_name,
    pta.start_date,
    pta.end_date,
    pta.daily_hours,
    pta.phase_task_name,
    pta.note,
    pta.created_at,
    pta.updated_at
FROM project_time_allocations pta
JOIN projects p ON p.id = pta.project_id
JOIN users u ON u.id = pta.user_id
"#;

fn time_allocation_from_row(row: &SqliteRow) -> TimeAllocationDetail {
    TimeAllocationDetail {
        id: row.get("id"),
        project_key: row.get("project_key"),
        project_name: row.get("project_name"),
        username: row.get("username"),
        display_name: row.get("display_name"),
        start_date: row.get("start_date"),
        end_date: row.get("end_date"),
        daily_hours: row.get("daily_hours"),
        phase_task_name: row.get("phase_task_name"),
        note: row.get("note"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn validate_time_allocation_input(
    username: &str,
    start_date: &str,
    end_date: &str,
    daily_hours: f64,
    phase_task_name: &str,
    note: &str,
) -> AppResult<(String, String, String, f64, String, String)> {
    let username = validate_username_ref(username)?;
    let start_date = validate_optional_date(start_date, "开始日期")?;
    let end_date = validate_optional_date(end_date, "结束日期")?;
    if start_date.is_empty() {
        return Err(AppError::BadRequest("开始日期不能为空".to_string()));
    }
    if end_date.is_empty() {
        return Err(AppError::BadRequest("结束日期不能为空".to_string()));
    }
    validate_date_range(&start_date, &end_date, "结束日期不能早于开始日期")?;
    if daily_hours.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater) || daily_hours > 24.0 {
        return Err(AppError::BadRequest(
            "每天投入小时数必须在 0 到 24 之间".to_string(),
        ));
    }
    let phase_task_name = validate_optional_text(phase_task_name, "阶段任务名称", 200)?;
    let note = validate_optional_text(note, "排期备注", 500)?;
    Ok((
        username,
        start_date,
        end_date,
        daily_hours,
        phase_task_name,
        note,
    ))
}

pub async fn get_time_allocation(
    pool: &SqlitePool,
    allocation_id: i64,
) -> AppResult<TimeAllocationDetail> {
    if allocation_id <= 0 {
        return Err(AppError::BadRequest("排期 ID 无效".to_string()));
    }
    let row = sqlx::query(AssertSqlSafe(format!(
        "{TIME_ALLOCATION_SELECT} WHERE pta.id = ?1"
    )))
    .bind(allocation_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("时间排期不存在".to_string()))?;
    Ok(time_allocation_from_row(&row))
}

pub async fn list_project_time_allocations(
    pool: &SqlitePool,
    project_key: &str,
) -> AppResult<Vec<TimeAllocationDetail>> {
    let project_key = validate_project_key(project_key)?;
    let rows = sqlx::query(AssertSqlSafe(format!(
        "{TIME_ALLOCATION_SELECT}
         WHERE p.project_key = ?1
         ORDER BY u.display_name ASC, pta.start_date ASC, pta.id ASC"
    )))
    .bind(&project_key)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(time_allocation_from_row).collect())
}

pub async fn list_time_allocations(
    pool: &SqlitePool,
    filter: TimeAllocationListFilter,
) -> AppResult<Vec<TimeAllocationDetail>> {
    let project_key = filter.project_key.trim().to_string();
    let username = filter.username.trim().to_string();
    let start_date = filter.start_date.trim().to_string();
    let end_date = filter.end_date.trim().to_string();
    let user_id = filter.user_id;
    let rows = sqlx::query(AssertSqlSafe(format!(
        "{TIME_ALLOCATION_SELECT}
         WHERE (?1 = '' OR p.project_key = ?1)
           AND (?2 = '' OR u.username = ?2)
           AND (?3 = '' OR pta.start_date <= ?3)
           AND (?4 = '' OR pta.end_date >= ?4)
           AND (?5 = 0 OR EXISTS (
               SELECT 1
               FROM project_members pm
               WHERE pm.project_id = p.id AND pm.user_id = ?5
           ))
         ORDER BY u.display_name ASC, pta.start_date ASC, pta.id ASC"
    )))
    .bind(&project_key)
    .bind(&username)
    .bind(&end_date)
    .bind(&start_date)
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(time_allocation_from_row).collect())
}

fn time_allocation_snapshot(allocation: &TimeAllocationDetail) -> Value {
    json!({
        "project_key": allocation.project_key,
        "project_name": allocation.project_name,
        "username": allocation.username,
        "display_name": allocation.display_name,
        "start_date": allocation.start_date,
        "end_date": allocation.end_date,
        "daily_hours": allocation.daily_hours,
        "phase_task_name": allocation.phase_task_name,
        "note": allocation.note,
    })
}

fn time_allocation_field_value(allocation: &TimeAllocationDetail, field: &str) -> Value {
    match field {
        "username" => json!(allocation.username),
        "start_date" => json!(allocation.start_date),
        "end_date" => json!(allocation.end_date),
        "daily_hours" => json!(allocation.daily_hours),
        "phase_task_name" => json!(allocation.phase_task_name),
        "note" => json!(allocation.note),
        _ => Value::Null,
    }
}

fn time_allocation_changes(
    before: Option<&TimeAllocationDetail>,
    after: Option<&TimeAllocationDetail>,
) -> Vec<TimeAllocationFieldChange> {
    const FIELDS: [&str; 6] = [
        "username",
        "start_date",
        "end_date",
        "daily_hours",
        "phase_task_name",
        "note",
    ];
    FIELDS
        .iter()
        .filter_map(|field| {
            let before_value =
                before.map(|allocation| time_allocation_field_value(allocation, field));
            let after_value =
                after.map(|allocation| time_allocation_field_value(allocation, field));
            if before.is_some() && after.is_some() && before_value == after_value {
                return None;
            }
            Some(TimeAllocationFieldChange {
                field: (*field).to_string(),
                before: before_value,
                after: after_value,
            })
        })
        .collect()
}

fn time_allocation_change_metadata(
    before: Option<&TimeAllocationDetail>,
    after: Option<&TimeAllocationDetail>,
) -> Value {
    json!({
        "before": before.map(time_allocation_snapshot),
        "after": after.map(time_allocation_snapshot),
        "changes": time_allocation_changes(before, after)
            .iter()
            .map(|change| json!({
                "field": change.field,
                "before": change.before,
                "after": change.after,
            }))
            .collect::<Vec<_>>(),
    })
}

async fn insert_time_allocation_activity(
    pool: &SqlitePool,
    project_id: i64,
    actor_user_id: i64,
    action: &str,
    target_id: i64,
    summary: &str,
    metadata: Value,
) -> AppResult<()> {
    let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(
        r#"
        INSERT INTO project_activities (
            project_id,
            actor_user_id,
            action,
            target_type,
            target_id,
            summary,
            metadata,
            actor_display_name_snapshot
        )
        SELECT ?1, ?2, ?3, 'time_allocation', ?4, ?5, ?6,
            COALESCE((SELECT display_name FROM users WHERE id = ?2), '')
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(target_id.to_string())
    .bind(summary)
    .bind(metadata_json)
    .execute(pool)
    .await?;
    Ok(())
}

const TIME_ALLOCATION_CHANGE_RECORD_SELECT: &str = r#"
SELECT
    pa.id,
    CAST(pa.target_id AS INTEGER) AS allocation_id,
    p.project_key,
    p.name AS project_name,
    pa.action,
    COALESCE(u.username, '') AS actor_username,
    COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
    pa.summary,
    pa.metadata,
    pa.created_at
FROM project_activities pa
JOIN projects p ON p.id = pa.project_id
LEFT JOIN users u ON u.id = pa.actor_user_id
WHERE pa.target_type = 'time_allocation'
"#;

fn optional_json_value(value: Option<&Value>) -> Option<Value> {
    value.filter(|value| !value.is_null()).cloned()
}

fn time_allocation_change_record_from_row(row: &SqliteRow) -> TimeAllocationChangeRecord {
    let metadata_raw: String = row.get("metadata");
    let metadata: Value = serde_json::from_str(&metadata_raw).unwrap_or_else(|_| json!({}));
    let changes = metadata
        .get("changes")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    Some(TimeAllocationFieldChange {
                        field: item.get("field")?.as_str()?.to_string(),
                        before: item.get("before").cloned(),
                        after: item.get("after").cloned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    TimeAllocationChangeRecord {
        id: row.get("id"),
        allocation_id: row.get("allocation_id"),
        project_key: row.get("project_key"),
        project_name: row.get("project_name"),
        action: row.get("action"),
        actor_username: row.get("actor_username"),
        actor_display_name: row.get("actor_display_name"),
        summary: row.get("summary"),
        changes,
        before: optional_json_value(metadata.get("before")),
        after: optional_json_value(metadata.get("after")),
        created_at: row.get("created_at"),
    }
}

pub async fn list_time_allocation_change_records_paginated(
    pool: &SqlitePool,
    filter: TimeAllocationChangeFilter,
    pagination: Pagination,
) -> AppResult<Paginated<TimeAllocationChangeRecord>> {
    let project_key = filter.project_key.trim().to_string();
    let actor = filter.actor.trim().to_string();
    let scope_sql = r#"
        AND (?1 = '' OR p.project_key = ?1)
        AND (?2 = '' OR u.username = ?2 OR COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') = ?2)
        AND (?3 = 0 OR EXISTS (
            SELECT 1
            FROM project_members pm
            WHERE pm.project_id = p.id AND pm.user_id = ?3
        ))
    "#;
    let total_items = sqlx::query_scalar::<_, i64>(AssertSqlSafe(format!(
        "SELECT COUNT(*)
         FROM project_activities pa
         JOIN projects p ON p.id = pa.project_id
         LEFT JOIN users u ON u.id = pa.actor_user_id
         WHERE pa.target_type = 'time_allocation'
         {scope_sql}"
    )))
    .bind(&project_key)
    .bind(&actor)
    .bind(filter.user_id)
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query(AssertSqlSafe(format!(
        "{TIME_ALLOCATION_CHANGE_RECORD_SELECT}
         {scope_sql}
         ORDER BY pa.created_at DESC, pa.id DESC
         LIMIT ?4 OFFSET ?5"
    )))
    .bind(&project_key)
    .bind(&actor)
    .bind(filter.user_id)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    Ok(Paginated {
        items: rows
            .iter()
            .map(time_allocation_change_record_from_row)
            .collect(),
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
}

pub async fn get_time_allocation_change_record_meta(
    pool: &SqlitePool,
    record_id: i64,
) -> AppResult<Option<TimeAllocationChangeRecordMeta>> {
    let row = sqlx::query(
        r#"
        SELECT
            pa.id,
            pa.project_id,
            p.project_key,
            p.status AS project_status,
            CAST(pa.target_id AS INTEGER) AS allocation_id,
            pa.action,
            pa.metadata
        FROM project_activities pa
        JOIN projects p ON p.id = pa.project_id
        WHERE pa.id = ?1
          AND pa.target_type = 'time_allocation'
        "#,
    )
    .bind(record_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };
    let metadata_raw: String = row.get("metadata");
    let metadata: Value = serde_json::from_str(&metadata_raw).unwrap_or_else(|_| json!({}));
    Ok(Some(TimeAllocationChangeRecordMeta {
        record_id: row.get("id"),
        project_id: row.get("project_id"),
        project_key: row.get("project_key"),
        project_status: row.get("project_status"),
        allocation_id: row.get("allocation_id"),
        action: row.get("action"),
        before: optional_json_value(metadata.get("before")),
        after: optional_json_value(metadata.get("after")),
    }))
}

fn time_allocation_snapshot_fields(
    snapshot: &Value,
) -> AppResult<(String, String, String, f64, String, String)> {
    let missing = || AppError::BadRequest("修改记录回退快照不完整".to_string());
    let username = snapshot
        .get("username")
        .and_then(Value::as_str)
        .ok_or_else(missing)?
        .to_string();
    let start_date = snapshot
        .get("start_date")
        .and_then(Value::as_str)
        .ok_or_else(missing)?
        .to_string();
    let end_date = snapshot
        .get("end_date")
        .and_then(Value::as_str)
        .ok_or_else(missing)?
        .to_string();
    let daily_hours = snapshot
        .get("daily_hours")
        .and_then(Value::as_f64)
        .ok_or_else(missing)?;
    let phase_task_name = snapshot
        .get("phase_task_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let note = snapshot
        .get("note")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Ok((
        username,
        start_date,
        end_date,
        daily_hours,
        phase_task_name,
        note,
    ))
}

fn time_allocation_restore_metadata(
    before: Option<&TimeAllocationDetail>,
    after: Option<&TimeAllocationDetail>,
    source_activity_id: i64,
) -> Value {
    let mut metadata = time_allocation_change_metadata(before, after);
    if let Value::Object(ref mut map) = metadata {
        map.insert("source_activity_id".to_string(), json!(source_activity_id));
    }
    metadata
}

pub async fn restore_time_allocation_from_record(
    pool: &SqlitePool,
    actor_user_id: i64,
    meta: &TimeAllocationChangeRecordMeta,
) -> AppResult<Option<TimeAllocationDetail>> {
    ensure_project_accepts_writes(&meta.project_status)?;
    let already_restored = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM project_activities
        WHERE target_type = 'time_allocation'
          AND action = 'time_allocation.restored'
          AND json_extract(metadata, '$.source_activity_id') = ?1
        "#,
    )
    .bind(meta.record_id)
    .fetch_one(pool)
    .await?;
    if already_restored > 0 {
        return Err(AppError::Conflict(
            "该修改记录已回退，不能重复回退".to_string(),
        ));
    }

    match meta.action.as_str() {
        "time_allocation.created" => {
            let before = get_time_allocation(pool, meta.allocation_id).await?;
            sqlx::query("DELETE FROM project_time_allocations WHERE id = ?1")
                .bind(meta.allocation_id)
                .execute(pool)
                .await?;
            insert_time_allocation_activity(
                pool,
                meta.project_id,
                actor_user_id,
                "time_allocation.restored",
                meta.allocation_id,
                &format!(
                    "回退新增：删除成员 {} 的排期 {} ~ {}",
                    before.username, before.start_date, before.end_date
                ),
                time_allocation_restore_metadata(Some(&before), None, meta.record_id),
            )
            .await?;
            Ok(None)
        }
        "time_allocation.updated" => {
            let before = get_time_allocation(pool, meta.allocation_id).await?;
            let snapshot = meta
                .before
                .as_ref()
                .ok_or_else(|| AppError::BadRequest("该修改记录缺少回退快照".to_string()))?;
            let (username, start_date, end_date, daily_hours, phase_task_name, note) =
                time_allocation_snapshot_fields(snapshot)?;
            let (username, start_date, end_date, daily_hours, phase_task_name, note) =
                validate_time_allocation_input(
                    &username,
                    &start_date,
                    &end_date,
                    daily_hours,
                    &phase_task_name,
                    &note,
                )?;
            let user_id = resolve_active_user_id(pool, &username).await?;
            sqlx::query(
                r#"
                UPDATE project_time_allocations
                SET user_id = ?2,
                    start_date = ?3,
                    end_date = ?4,
                    daily_hours = ?5,
                    phase_task_name = ?6,
                    note = ?7,
                    updated_at = datetime('now')
                WHERE id = ?1
                "#,
            )
            .bind(meta.allocation_id)
            .bind(user_id)
            .bind(&start_date)
            .bind(&end_date)
            .bind(daily_hours)
            .bind(&phase_task_name)
            .bind(&note)
            .execute(pool)
            .await?;
            let after = get_time_allocation(pool, meta.allocation_id).await?;
            insert_time_allocation_activity(
                pool,
                meta.project_id,
                actor_user_id,
                "time_allocation.restored",
                meta.allocation_id,
                &format!(
                    "回退记录 #{}：恢复成员 {username} 的排期 {start_date} ~ {end_date}",
                    meta.record_id
                ),
                time_allocation_restore_metadata(Some(&before), Some(&after), meta.record_id),
            )
            .await?;
            Ok(Some(after))
        }
        "time_allocation.deleted" => {
            let snapshot = meta
                .before
                .as_ref()
                .ok_or_else(|| AppError::BadRequest("该修改记录缺少回退快照".to_string()))?;
            let (username, start_date, end_date, daily_hours, phase_task_name, note) =
                time_allocation_snapshot_fields(snapshot)?;
            let (username, start_date, end_date, daily_hours, phase_task_name, note) =
                validate_time_allocation_input(
                    &username,
                    &start_date,
                    &end_date,
                    daily_hours,
                    &phase_task_name,
                    &note,
                )?;
            let user_id = resolve_active_user_id(pool, &username).await?;
            let allocation_id = sqlx::query_scalar::<_, i64>(
                r#"
                INSERT INTO project_time_allocations (
                    project_id,
                    user_id,
                    start_date,
                    end_date,
                    daily_hours,
                    phase_task_name,
                    note,
                    created_by_user_id
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                RETURNING id
                "#,
            )
            .bind(meta.project_id)
            .bind(user_id)
            .bind(&start_date)
            .bind(&end_date)
            .bind(daily_hours)
            .bind(&phase_task_name)
            .bind(&note)
            .bind(actor_user_id)
            .fetch_one(pool)
            .await?;
            let after = get_time_allocation(pool, allocation_id).await?;
            insert_time_allocation_activity(
                pool,
                meta.project_id,
                actor_user_id,
                "time_allocation.restored",
                allocation_id,
                &format!("回退删除：恢复成员 {username} 的排期 {start_date} ~ {end_date}",),
                time_allocation_restore_metadata(None, Some(&after), meta.record_id),
            )
            .await?;
            Ok(Some(after))
        }
        _ => Err(AppError::BadRequest("该修改记录不支持回退".to_string())),
    }
}

pub async fn create_project_time_allocation(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    input: CreateTimeAllocationInput,
    allow_non_member_target: bool,
) -> AppResult<TimeAllocationDetail> {
    let project_key = validate_project_key(project_key)?;
    let (username, start_date, end_date, daily_hours, phase_task_name, note) =
        validate_time_allocation_input(
            &input.username,
            &input.start_date,
            &input.end_date,
            input.daily_hours,
            &input.phase_task_name,
            &input.note,
        )?;

    let (project_id, project_status) = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, status FROM projects WHERE project_key = ?1",
    )
    .bind(&project_key)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;
    let user_id = if allow_non_member_target {
        resolve_active_user_id(pool, &username).await?
    } else {
        resolve_project_member_user_id(pool, project_id, &username).await?
    };

    let allocation_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO project_time_allocations (
            project_id,
            user_id,
            start_date,
            end_date,
            daily_hours,
            phase_task_name,
            note,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .bind(&start_date)
    .bind(&end_date)
    .bind(daily_hours)
    .bind(&phase_task_name)
    .bind(&note)
    .bind(actor_user_id)
    .fetch_one(pool)
    .await?;

    let allocation = get_time_allocation(pool, allocation_id).await?;
    insert_time_allocation_activity(
        pool,
        project_id,
        actor_user_id,
        "time_allocation.created",
        allocation_id,
        &format!("创建成员 {username} 的排期 {start_date} ~ {end_date}"),
        time_allocation_change_metadata(None, Some(&allocation)),
    )
    .await?;

    Ok(allocation)
}

pub async fn update_project_time_allocation(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    allocation_id: i64,
    input: UpdateTimeAllocationInput,
    allow_non_member_target: bool,
) -> AppResult<TimeAllocationDetail> {
    let project_key = validate_project_key(project_key)?;
    if allocation_id <= 0 {
        return Err(AppError::BadRequest("排期 ID 无效".to_string()));
    }
    let (username, start_date, end_date, daily_hours, phase_task_name, note) =
        validate_time_allocation_input(
            &input.username,
            &input.start_date,
            &input.end_date,
            input.daily_hours,
            &input.phase_task_name,
            &input.note,
        )?;

    let (project_id, project_status) = sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT p.id, p.status
        FROM project_time_allocations pta
        JOIN projects p ON p.id = pta.project_id
        WHERE p.project_key = ?1 AND pta.id = ?2
        "#,
    )
    .bind(&project_key)
    .bind(allocation_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("时间排期不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;
    let user_id = if allow_non_member_target {
        resolve_active_user_id(pool, &username).await?
    } else {
        resolve_project_member_user_id(pool, project_id, &username).await?
    };
    let before = get_time_allocation(pool, allocation_id).await?;

    sqlx::query(
        r#"
        UPDATE project_time_allocations
        SET user_id = ?2,
            start_date = ?3,
            end_date = ?4,
            daily_hours = ?5,
            phase_task_name = ?6,
            note = ?7,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(allocation_id)
    .bind(user_id)
    .bind(&start_date)
    .bind(&end_date)
    .bind(daily_hours)
    .bind(&phase_task_name)
    .bind(&note)
    .execute(pool)
    .await?;

    let allocation = get_time_allocation(pool, allocation_id).await?;
    insert_time_allocation_activity(
        pool,
        project_id,
        actor_user_id,
        "time_allocation.updated",
        allocation_id,
        &format!("更新成员 {username} 的排期 {start_date} ~ {end_date}"),
        time_allocation_change_metadata(Some(&before), Some(&allocation)),
    )
    .await?;

    Ok(allocation)
}

pub async fn delete_project_time_allocation(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    allocation_id: i64,
) -> AppResult<()> {
    let project_key = validate_project_key(project_key)?;
    if allocation_id <= 0 {
        return Err(AppError::BadRequest("排期 ID 无效".to_string()));
    }

    let (project_id, project_status, username) = sqlx::query_as::<_, (i64, String, String)>(
        r#"
        SELECT p.id, p.status, u.username
        FROM project_time_allocations pta
        JOIN projects p ON p.id = pta.project_id
        JOIN users u ON u.id = pta.user_id
        WHERE p.project_key = ?1 AND pta.id = ?2
        "#,
    )
    .bind(&project_key)
    .bind(allocation_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("时间排期不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;
    let before = get_time_allocation(pool, allocation_id).await?;

    sqlx::query("DELETE FROM project_time_allocations WHERE id = ?1")
        .bind(allocation_id)
        .execute(pool)
        .await?;

    insert_time_allocation_activity(
        pool,
        project_id,
        actor_user_id,
        "time_allocation.deleted",
        allocation_id,
        &format!("删除成员 {username} 的时间排期"),
        time_allocation_change_metadata(Some(&before), None),
    )
    .await?;

    Ok(())
}

pub async fn user_can_manage_project_time(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<bool> {
    if is_super_admin {
        return Ok(true);
    }

    Ok(matches!(
        project_member_role(pool, project_id, user_id)
            .await?
            .as_deref(),
        Some("owner" | "maintainer")
    ))
}
