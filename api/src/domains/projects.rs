use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use sqlx::{Row, SqlitePool};

use crate::{
    domains::notifications::{self, CreateNotification},
    platform::error::{AppError, AppResult},
};

const PROJECT_KEY_GENERATE_MAX_ATTEMPTS: usize = 5;
const PROJECT_STATUS_NOT_STARTED: &str = "not_started";
const PROJECT_STATUS_IN_PROGRESS: &str = "in_progress";
const PROJECT_STATUS_ACCEPTANCE: &str = "acceptance";
const PROJECT_STATUS_COMPLETED: &str = "completed";
const PROJECT_STATUS_ON_HOLD: &str = "on_hold";
const PROJECT_STATUS_CANCELLED: &str = "cancelled";
const PROJECT_STATUS_ARCHIVED: &str = "archived";
const WORK_ITEM_FLOW_COMMENT_PREFIX: &str = "[yuance-flow] ";

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
    pub work_item_count: i64,
    pub open_work_item_count: i64,
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
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemDetail {
    pub id: i64,
    pub item_key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub project_name: String,
    pub parent_item_key: String,
    pub parent_title: String,
    pub assignee_username: String,
    pub assignee_display_name: String,
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
    pub author_user_id: Option<i64>,
    pub author_username: String,
    pub author_display_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_flow: bool,
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
pub struct CreateWorkItemInput {
    pub project_key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub assignee_username: String,
    pub due_date: String,
    pub parent_item_key: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProjectListFilter {
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NormalizedProjectFilter {
    status: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkItemListFilter {
    pub item_type: Option<String>,
    pub keyword: String,
    pub status: String,
    pub priority: String,
    pub project_key: String,
    pub assignee_username: String,
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
    keyword_like: String,
    status: String,
    priority: String,
    project_key: String,
    assignee_username: String,
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandoffWorkItemInput {
    pub status: String,
    pub assignee_username: String,
    pub body: String,
    pub source_comment_id: Option<i64>,
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
    let rows = sqlx::query_as::<_, (i64, String, String, String, String, i64, i64, String)>(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.status,
            COALESCE(u.display_name, '') AS owner_display_name,
            COUNT(wi.id) AS work_item_count,
            COALESCE(SUM(CASE
                WHEN wi.id IS NOT NULL
                 AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
                THEN 1
                ELSE 0
            END), 0) AS open_work_item_count,
            p.updated_at
        FROM projects p
        LEFT JOIN users u ON u.id = p.owner_user_id
        LEFT JOIN work_items wi ON wi.project_id = p.id
            AND wi.deleted_at IS NULL
        WHERE (?1 = '' OR p.status = ?1)
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.id DESC
        LIMIT ?2 OFFSET ?3
        "#,
    )
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
                work_item_count,
                open_work_item_count,
                updated_at,
            )| ProjectSummary {
                id,
                project_key,
                name,
                status,
                owner_display_name,
                work_item_count,
                open_work_item_count,
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
    let rows = sqlx::query_as::<_, (i64, String, String, String, String, i64, i64, String)>(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.status,
            COALESCE(u.display_name, '') AS owner_display_name,
            COUNT(wi.id) AS work_item_count,
            COALESCE(SUM(CASE
                WHEN wi.id IS NOT NULL
                 AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
                THEN 1
                ELSE 0
            END), 0) AS open_work_item_count,
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
                work_item_count,
                open_work_item_count,
                updated_at,
            )| ProjectSummary {
                id,
                project_key,
                name,
                status,
                owner_display_name,
                work_item_count,
                open_work_item_count,
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
        let mut tx = pool.begin().await?;
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

    let mut tx = pool.begin().await?;
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

pub async fn list_project_members(
    pool: &SqlitePool,
    project_id: i64,
) -> AppResult<Vec<ProjectMemberSummary>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            u.id,
            u.display_name,
            u.username,
            pm.member_role,
            pm.joined_at
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?1
        ORDER BY
            CASE pm.member_role
                WHEN 'owner' THEN 1
                WHEN 'maintainer' THEN 2
                WHEN 'member' THEN 3
                ELSE 4
            END,
            pm.id ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(user_id, display_name, username, member_role, joined_at)| ProjectMemberSummary {
                user_id,
                display_name,
                username,
                member_role,
                joined_at,
            },
        )
        .collect())
}

pub async fn add_project_member(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    username: &str,
    member_role: &str,
) -> AppResult<ProjectMemberDetail> {
    let project_key = validate_project_key(project_key)?;
    let username = validate_username_ref(username)?;
    let member_role = validate_member_role(member_role)?;

    let Some((project_id, project_name, project_status)) =
        sqlx::query_as::<_, (i64, String, String)>(
            "SELECT id, name, status FROM projects WHERE project_key = ?1",
        )
        .bind(&project_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("项目不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    let Some((user_id, display_name)) = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, display_name FROM users WHERE username = ?1 AND status = 'active'",
    )
    .bind(&username)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::BadRequest("用户不存在或未启用".to_string()));
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO project_members (
            project_id,
            user_id,
            member_role
        )
        VALUES (?1, ?2, ?3)
        ON CONFLICT(project_id, user_id) DO UPDATE SET
            member_role = excluded.member_role,
            updated_at = datetime('now')
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .bind(member_role)
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'project.member.added', 'user', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&username)
    .bind(format!("将 {display_name} 加入项目 {project_name}"))
    .bind(format!(r#"{{"member_role":"{member_role}"}}"#))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_member(pool, project_id, &username)
        .await?
        .ok_or_else(|| AppError::NotFound("项目成员添加后未找到".to_string()))
}

pub async fn remove_project_member(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    username: &str,
) -> AppResult<()> {
    let project_key = validate_project_key(project_key)?;
    let username = validate_username_ref(username)?;

    let Some((project_id, owner_user_id, project_name, project_status)) =
        sqlx::query_as::<_, (i64, Option<i64>, String, String)>(
            "SELECT id, owner_user_id, name, status FROM projects WHERE project_key = ?1",
        )
        .bind(&project_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("项目不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    let Some((user_id, display_name)) = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, display_name FROM users WHERE username = ?1",
    )
    .bind(&username)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::BadRequest("用户不存在".to_string()));
    };
    if owner_user_id == Some(user_id) {
        return Err(AppError::BadRequest(
            "项目负责人不能从项目成员中移除".to_string(),
        ));
    }
    let assigned_open_count =
        count_open_work_items_assigned_to_user(pool, project_id, user_id).await?;
    if assigned_open_count > 0 {
        return Err(AppError::BadRequest(format!(
            "该成员仍负责 {assigned_open_count} 个未关闭工作项，请先转交处理人"
        )));
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        DELETE FROM project_members
        WHERE project_id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(project_id)
    .bind(user_id)
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
        VALUES (?1, ?2, 'project.member.removed', 'user', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&username)
    .bind(format!("将 {display_name} 移出项目 {project_name}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

async fn count_open_work_items_assigned_to_user(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
) -> AppResult<i64> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_items
        WHERE project_id = ?1
          AND assignee_user_id = ?2
          AND deleted_at IS NULL
          AND status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn update_project_member_role(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    username: &str,
    member_role: &str,
) -> AppResult<ProjectMemberDetail> {
    let project_key = validate_project_key(project_key)?;
    let username = validate_username_ref(username)?;
    let member_role = validate_member_role(member_role)?;
    if member_role == "owner" {
        return Err(AppError::BadRequest(
            "项目负责人请通过编辑项目转移".to_string(),
        ));
    }

    let Some((project_id, owner_user_id, project_name, project_status)) =
        sqlx::query_as::<_, (i64, Option<i64>, String, String)>(
            "SELECT id, owner_user_id, name, status FROM projects WHERE project_key = ?1",
        )
        .bind(&project_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("项目不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    let Some((user_id, display_name, current_role)) = sqlx::query_as::<_, (i64, String, String)>(
        r#"
        SELECT u.id, u.display_name, pm.member_role
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?1
          AND u.username = ?2
        "#,
    )
    .bind(project_id)
    .bind(&username)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("项目成员不存在".to_string()));
    };
    if owner_user_id == Some(user_id) {
        return Err(AppError::BadRequest(
            "项目负责人角色请通过编辑项目转移".to_string(),
        ));
    }
    if current_role == member_role {
        return get_project_member(pool, project_id, &username)
            .await?
            .ok_or_else(|| AppError::NotFound("项目成员不存在".to_string()));
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE project_members
        SET member_role = ?3,
            updated_at = datetime('now')
        WHERE project_id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .bind(member_role)
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'project.member.role.updated', 'user', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&username)
    .bind(format!("调整 {display_name} 在项目 {project_name} 的角色"))
    .bind(format!(
        r#"{{"old_member_role":"{current_role}","member_role":"{member_role}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_member(pool, project_id, &username)
        .await?
        .ok_or_else(|| AppError::NotFound("项目成员不存在".to_string()))
}

pub async fn is_project_member(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
) -> AppResult<bool> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM project_members
        WHERE project_id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(count > 0)
}

pub async fn project_member_role(
    pool: &SqlitePool,
    project_id: i64,
    user_id: i64,
) -> AppResult<Option<String>> {
    sqlx::query_scalar::<_, String>(
        r#"
        SELECT member_role
        FROM project_members
        WHERE project_id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

pub async fn user_can_manage_project_members(
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

pub async fn user_can_manage_work_item_comment(
    pool: &SqlitePool,
    project_id: i64,
    comment_author_user_id: Option<i64>,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<bool> {
    if is_super_admin || comment_author_user_id == Some(user_id) {
        return Ok(true);
    }

    Ok(matches!(
        project_member_role(pool, project_id, user_id)
            .await?
            .as_deref(),
        Some("owner" | "maintainer")
    ))
}

async fn get_project_member(
    pool: &SqlitePool,
    project_id: i64,
    username: &str,
) -> AppResult<Option<ProjectMemberDetail>> {
    let row = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            u.id,
            u.display_name,
            u.username,
            pm.member_role,
            pm.joined_at
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = ?1
          AND u.username = ?2
        "#,
    )
    .bind(project_id)
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(user_id, display_name, username, member_role, joined_at)| ProjectMemberDetail {
            user_id,
            display_name,
            username,
            member_role,
            joined_at,
        },
    ))
}

pub async fn list_project_work_items(
    pool: &SqlitePool,
    project_id: i64,
    item_type: Option<&str>,
) -> AppResult<Vec<WorkItemSummary>> {
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
                wi.id,
                wi.item_key,
                wi.item_type,
                wi.title,
                wi.status,
                wi.priority,
                p.project_key,
                p.name AS project_name,
                COALESCE(assignee.display_name, '') AS assignee_display_name,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
            WHERE wi.project_id = ?1
              AND (?2 IS NULL OR wi.item_type = ?2)
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            "#,
    )
    .bind(project_id)
    .bind(item_type)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            )| WorkItemSummary {
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            },
        )
        .collect())
}

pub async fn list_work_item_summaries(
    pool: &SqlitePool,
    item_type: Option<&str>,
) -> AppResult<Vec<WorkItemSummary>> {
    list_work_item_summaries_filtered(
        pool,
        WorkItemListFilter {
            item_type: item_type.map(ToOwned::to_owned),
            ..WorkItemListFilter::default()
        },
    )
    .await
}

pub async fn list_work_item_summaries_filtered(
    pool: &SqlitePool,
    filter: WorkItemListFilter,
) -> AppResult<Vec<WorkItemSummary>> {
    let page = list_work_item_summaries_filtered_paginated(
        pool,
        filter,
        Pagination {
            page: 1,
            per_page: i64::MAX,
        },
    )
    .await?;
    Ok(page.items)
}

pub async fn list_work_item_summaries_filtered_paginated(
    pool: &SqlitePool,
    filter: WorkItemListFilter,
    pagination: Pagination,
) -> AppResult<Paginated<WorkItemSummary>> {
    let normalized = normalize_work_item_filter(filter)?;
    let pagination = normalize_pagination(pagination)?;
    let total_items = count_work_item_summaries_filtered(pool, &normalized).await?;
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
                wi.id,
                wi.item_key,
                wi.item_type,
                wi.title,
                wi.status,
                wi.priority,
                p.project_key,
                p.name AS project_name,
                COALESCE(assignee.display_name, '') AS assignee_display_name,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
            WHERE (?1 = '' OR wi.item_type = ?1)
              AND (
                ?2 = ''
                OR wi.item_key LIKE ?2
                OR wi.title LIKE ?2
                OR wi.description LIKE ?2
                OR p.project_key LIKE ?2
                OR p.name LIKE ?2
              )
              AND (?3 = '' OR (?3 = 'pending' AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')) OR wi.status = ?3)
              AND (?4 = '' OR wi.priority = ?4)
              AND (?5 = '' OR p.project_key = ?5)
              AND (?6 = '' OR assignee.username = ?6)
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            LIMIT ?7 OFFSET ?8
            "#,
    )
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            )| WorkItemSummary {
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
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

pub async fn list_work_item_summaries_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    item_type: Option<&str>,
) -> AppResult<Vec<WorkItemSummary>> {
    list_work_item_summaries_filtered_for_user(
        pool,
        user_id,
        is_super_admin,
        WorkItemListFilter {
            item_type: item_type.map(ToOwned::to_owned),
            ..WorkItemListFilter::default()
        },
    )
    .await
}

pub async fn list_work_item_summaries_filtered_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    filter: WorkItemListFilter,
) -> AppResult<Vec<WorkItemSummary>> {
    let page = list_work_item_summaries_filtered_for_user_paginated(
        pool,
        user_id,
        is_super_admin,
        filter,
        Pagination {
            page: 1,
            per_page: i64::MAX,
        },
    )
    .await?;
    Ok(page.items)
}

pub async fn list_work_item_summaries_filtered_for_user_paginated(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    filter: WorkItemListFilter,
    pagination: Pagination,
) -> AppResult<Paginated<WorkItemSummary>> {
    if is_super_admin {
        return list_work_item_summaries_filtered_paginated(pool, filter, pagination).await;
    }

    let normalized = normalize_work_item_filter(filter)?;
    let pagination = normalize_pagination(pagination)?;
    let total_items =
        count_work_item_summaries_filtered_for_user(pool, user_id, &normalized).await?;
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
                wi.id,
                wi.item_key,
                wi.item_type,
                wi.title,
                wi.status,
                wi.priority,
                p.project_key,
                p.name AS project_name,
                COALESCE(assignee.display_name, '') AS assignee_display_name,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = ?1
            LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
            WHERE (?2 = '' OR wi.item_type = ?2)
              AND (
                ?3 = ''
                OR wi.item_key LIKE ?3
                OR wi.title LIKE ?3
                OR wi.description LIKE ?3
                OR p.project_key LIKE ?3
                OR p.name LIKE ?3
              )
              AND (?4 = '' OR (?4 = 'pending' AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')) OR wi.status = ?4)
              AND (?5 = '' OR wi.priority = ?5)
              AND (?6 = '' OR p.project_key = ?6)
              AND (?7 = '' OR assignee.username = ?7)
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            LIMIT ?8 OFFSET ?9
            "#,
    )
    .bind(user_id)
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            )| WorkItemSummary {
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
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

pub async fn list_assigned_work_item_summaries(
    pool: &SqlitePool,
    user_id: i64,
    item_type: Option<&str>,
) -> AppResult<Vec<WorkItemSummary>> {
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
                wi.id,
                wi.item_key,
                wi.item_type,
                wi.title,
                wi.status,
                wi.priority,
                p.project_key,
                p.name AS project_name,
                COALESCE(u.display_name, '') AS assignee_display_name,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            LEFT JOIN users u ON u.id = wi.assignee_user_id
            WHERE wi.assignee_user_id = ?1
              AND (?2 IS NULL OR wi.item_type = ?2)
              AND wi.deleted_at IS NULL
            ORDER BY wi.updated_at DESC, wi.id DESC
            "#,
    )
    .bind(user_id)
    .bind(item_type)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            )| WorkItemSummary {
                id,
                item_key,
                item_type,
                title,
                status,
                priority,
                project_key,
                project_name,
                assignee_display_name,
                updated_at,
            },
        )
        .collect())
}

pub async fn count_pending_assigned_work_items(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<WorkItemAssignmentCounts> {
    let rows = if is_super_admin {
        sqlx::query_as::<_, (String, i64)>(
            r#"
            SELECT wi.item_type, COUNT(*)
            FROM work_items wi
            WHERE wi.assignee_user_id = ?1
              AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
              AND wi.deleted_at IS NULL
            GROUP BY wi.item_type
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, i64)>(
            r#"
            SELECT wi.item_type, COUNT(*)
            FROM work_items wi
            JOIN project_members pm ON pm.project_id = wi.project_id
                AND pm.user_id = ?1
            WHERE wi.assignee_user_id = ?1
              AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
              AND wi.deleted_at IS NULL
            GROUP BY wi.item_type
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?
    };

    let mut counts = WorkItemAssignmentCounts::default();
    for (item_type, count) in rows {
        match item_type.as_str() {
            "requirement" => counts.requirements = count,
            "task" => counts.tasks = count,
            "bug" => counts.bugs = count,
            _ => {}
        }
    }
    Ok(counts)
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
        SELECT MAX(1.0,
            (CAST(strftime('%Y', 'now') AS INTEGER) - CAST(strftime('%Y', ?1) AS INTEGER)) * 12
            + CAST(strftime('%m', 'now') AS INTEGER) - CAST(strftime('%m', ?1) AS INTEGER) + 1
        )
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

pub async fn create_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateWorkItemInput,
) -> AppResult<WorkItemDetail> {
    let project_key = validate_project_key(&input.project_key)?;
    let item_type = validate_work_item_type(&input.item_type)?;
    let title = validate_name(&input.title, "工作项标题", 160)?;
    let description = validate_optional_text(&input.description, "工作项描述", 5000)?;
    let priority = validate_priority(&input.priority)?;
    let due_date = validate_optional_date(&input.due_date, "工作项截止日期")?;
    let parent_item_key = input.parent_item_key.trim();
    let assignee_username = input.assignee_username.trim();
    let item_segment = work_item_key_segment(item_type);

    let (project_id, project_status) = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, status FROM projects WHERE project_key = ?1",
    )
    .bind(&project_key)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;
    let parent_work_item_id =
        resolve_parent_work_item_id(pool, project_id, item_type, parent_item_key).await?;
    let assignee_user_id = if assignee_username.is_empty() {
        actor_user_id
    } else {
        resolve_project_member_user_id(pool, project_id, assignee_username).await?
    };

    let mut tx = pool.begin().await?;
    let prefix = format!("{project_key}-{item_segment}-");
    let next_number = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(MAX(CAST(SUBSTR(item_key, ?2) AS INTEGER)), 0) + 1
        FROM work_items
        WHERE project_id = ?1
          AND item_type = ?3
          AND item_key LIKE ?4
        "#,
    )
    .bind(project_id)
    .bind(prefix.len() as i64 + 1)
    .bind(item_type)
    .bind(format!("{prefix}%"))
    .fetch_one(&mut *tx)
    .await?;
    let item_key = format!("{prefix}{next_number}");

    let work_item_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_items (
            project_id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            assignee_user_id,
            reporter_user_id,
            parent_work_item_id,
            due_date
        )
        VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?8, ?9, NULLIF(?10, ''))
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(&item_key)
    .bind(item_type)
    .bind(&title)
    .bind(&description)
    .bind(priority)
    .bind(assignee_user_id)
    .bind(actor_user_id)
    .bind(parent_work_item_id)
    .bind(&due_date)
    .fetch_one(&mut *tx)
    .await?;

    notifications::create_in_transaction(
        &mut tx,
        CreateNotification {
            recipient_user_id: assignee_user_id,
            actor_user_id,
            kind: "work_item_assigned",
            work_item_id,
            comment_id: None,
            title: &format!("你被指派处理 {item_key}"),
            body: &title,
        },
    )
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
        VALUES (?1, ?2, 'work_item.created', 'work_item', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&item_key)
    .bind(format!("创建工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, &item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项创建后未找到".to_string()))
}

pub async fn get_work_item_detail(
    pool: &SqlitePool,
    item_key: &str,
) -> AppResult<Option<WorkItemDetail>> {
    let row = sqlx::query(
        r#"
        SELECT
            wi.id AS id,
            wi.item_key AS item_key,
            wi.item_type AS item_type,
            wi.title AS title,
            wi.description AS description,
            wi.status AS status,
            wi.priority AS priority,
            p.project_key AS project_key,
            p.name AS project_name,
            COALESCE(parent.item_key, '') AS parent_item_key,
            COALESCE(parent.title, '') AS parent_title,
            COALESCE(assignee.username, '') AS assignee_username,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            COALESCE(reporter.username, '') AS reporter_username,
            COALESCE(reporter.display_name, '') AS reporter_display_name,
            COALESCE(wi.due_date, '') AS due_date,
            wi.created_at,
            wi.updated_at,
            COALESCE(wi.deleted_at, '') AS deleted_at
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN work_items parent ON parent.id = wi.parent_work_item_id
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        LEFT JOIN users reporter ON reporter.id = wi.reporter_user_id
        WHERE wi.item_key = ?1
        "#,
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| WorkItemDetail {
        id: row.get("id"),
        item_key: row.get("item_key"),
        item_type: row.get("item_type"),
        title: row.get("title"),
        description: row.get("description"),
        status: row.get("status"),
        priority: row.get("priority"),
        project_key: row.get("project_key"),
        project_name: row.get("project_name"),
        parent_item_key: row.get("parent_item_key"),
        parent_title: row.get("parent_title"),
        assignee_username: row.get("assignee_username"),
        assignee_display_name: row.get("assignee_display_name"),
        reporter_username: row.get("reporter_username"),
        reporter_display_name: row.get("reporter_display_name"),
        due_date: row.get("due_date"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        deleted_at: row.get("deleted_at"),
    }))
}

pub async fn list_work_item_comments(
    pool: &SqlitePool,
    work_item_id: i64,
) -> AppResult<Vec<WorkItemCommentSummary>> {
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            String,
            Option<i64>,
            String,
            String,
            String,
            String,
            Option<i64>,
            String,
        ),
    >(
        r#"
        SELECT
            c.id,
            c.body,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.work_item_id = ?1
          AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC, c.id ASC
        "#,
    )
    .bind(work_item_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                body,
                author_user_id,
                author_username,
                author_display_name,
                created_at,
                updated_at,
                parent_comment_id,
                parent_author_display_name,
            )| {
                let (body, is_flow) = normalize_work_item_comment_body(body);
                WorkItemCommentSummary {
                    id,
                    parent_comment_id,
                    parent_author_display_name,
                    body,
                    author_user_id,
                    author_username,
                    author_display_name,
                    created_at,
                    updated_at,
                    is_flow,
                }
            },
        )
        .collect())
}

pub async fn update_work_item_status(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    status: &str,
) -> AppResult<WorkItemDetail> {
    let status = validate_work_item_status(status)?;
    let Some((work_item_id, project_id, project_status, current_status, assignee_display_name)) =
        sqlx::query_as::<_, (i64, i64, String, String, String)>(
            r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                wi.status,
                COALESCE(assignee.display_name, '') AS assignee_display_name
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
            WHERE wi.item_key = ?1
              AND wi.deleted_at IS NULL
            "#,
        )
        .bind(item_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    ensure_work_item_status_transition(&current_status, status)?;
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE work_items
        SET status = ?2,
            completed_at = CASE
                WHEN ?2 IN ('done', 'closed', 'resolved', 'verified') THEN datetime('now')
                ELSE NULL
            END,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .bind(status)
    .execute(&mut *tx)
    .await?;

    let flow_summary = format_work_item_flow_summary(
        &current_status,
        status,
        &assignee_display_name,
        &assignee_display_name,
        "",
    );
    sqlx::query(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            body
        )
        VALUES (?1, ?2, ?3)
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(encode_flow_comment_body(&flow_summary))
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'work_item.status.updated', 'work_item', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("更新工作项 {item_key} 状态"))
    .bind(format!(
        r#"{{"status":"{status}","previous_status":"{current_status}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn handoff_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    input: HandoffWorkItemInput,
) -> AppResult<WorkItemDetail> {
    let status = validate_work_item_status(&input.status)?;
    let assignee_username = input.assignee_username.trim();
    let body = validate_optional_text(&input.body, "处理说明", 5000)?;
    let Some((
        work_item_id,
        project_id,
        project_status,
        current_status,
        current_assignee_user_id,
        current_assignee_username,
        current_assignee_display_name,
        work_item_title,
    )) = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            Option<i64>,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            wi.id,
            wi.project_id,
            p.status,
            wi.status,
            wi.assignee_user_id,
            COALESCE(assignee.username, '') AS assignee_username,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            wi.title
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        WHERE wi.item_key = ?1
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    ensure_work_item_status_transition(&current_status, status)?;
    if let Some(comment_id) = input.source_comment_id {
        get_work_item_comment(pool, work_item_id, comment_id).await?;
    }

    let (next_assignee_user_id, next_assignee_username, next_assignee_display_name) =
        if assignee_username.is_empty() {
            (
                current_assignee_user_id,
                current_assignee_username,
                current_assignee_display_name.clone(),
            )
        } else {
            let assignee_username = validate_username_ref(assignee_username)?;
            let assignee = sqlx::query_as::<_, (i64, String, String)>(
                r#"
                SELECT u.id, u.username, u.display_name
                FROM users u
                JOIN project_members pm ON pm.user_id = u.id
                    AND pm.project_id = ?1
                WHERE u.username = ?2
                  AND u.status = 'active'
                "#,
            )
            .bind(project_id)
            .bind(&assignee_username)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("处理人必须是已启用的项目成员".to_string()))?;
            (Some(assignee.0), assignee.1, assignee.2)
        };

    if current_status == status
        && current_assignee_user_id == next_assignee_user_id
        && body.is_empty()
    {
        return Err(AppError::BadRequest(
            "请至少修改状态、处理人或填写处理说明".to_string(),
        ));
    }

    let flow_summary = format_work_item_flow_summary(
        &current_status,
        status,
        &current_assignee_display_name,
        &next_assignee_display_name,
        &body,
    );
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE work_items
        SET status = ?2,
            assignee_user_id = ?3,
            completed_at = CASE
                WHEN ?2 IN ('done', 'closed', 'resolved', 'verified') THEN datetime('now')
                ELSE NULL
            END,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .bind(status)
    .bind(next_assignee_user_id)
    .execute(&mut *tx)
    .await?;

    let should_notify_assignment =
        current_assignee_user_id != next_assignee_user_id || input.source_comment_id.is_some();
    if should_notify_assignment && let Some(recipient_user_id) = next_assignee_user_id {
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id,
                actor_user_id,
                kind: "work_item_assigned",
                work_item_id,
                comment_id: input.source_comment_id,
                title: &format!("你被指派处理 {item_key}"),
                body: &work_item_title,
            },
        )
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            body
        )
        VALUES (?1, ?2, ?3)
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(encode_flow_comment_body(&flow_summary))
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'work_item.handoff', 'work_item', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("推进工作项 {item_key}"))
    .bind(format!(
        r#"{{"status":"{status}","previous_status":"{current_status}","assignee_username":"{next_assignee_username}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn update_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    input: UpdateWorkItemInput,
) -> AppResult<WorkItemDetail> {
    let title = validate_name(&input.title, "工作项标题", 160)?;
    let description = validate_optional_text(&input.description, "工作项描述", 5000)?;
    let status = validate_work_item_status(&input.status)?;
    let priority = validate_priority(&input.priority)?;
    let assignee_username = input.assignee_username.trim();
    let due_date = validate_optional_date(&input.due_date, "工作项截止日期")?;
    let parent_item_key = input.parent_item_key.trim();

    let Some((work_item_id, project_id, project_status, item_type, current_status)) =
        sqlx::query_as::<_, (i64, i64, String, String, String)>(
            r#"
        SELECT wi.id, wi.project_id, p.status, wi.item_type, wi.status
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        WHERE wi.item_key = ?1
          AND wi.deleted_at IS NULL
        "#,
        )
        .bind(item_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    ensure_work_item_status_transition(&current_status, status)?;
    let parent_work_item_id =
        resolve_parent_work_item_id(pool, project_id, &item_type, parent_item_key).await?;

    let assignee_user_id = if assignee_username.is_empty() {
        None
    } else {
        Some(resolve_project_member_user_id(pool, project_id, assignee_username).await?)
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE work_items
        SET title = ?2,
            description = ?3,
            status = ?4,
            priority = ?5,
            assignee_user_id = ?6,
            due_date = NULLIF(?7, ''),
            parent_work_item_id = ?8,
            completed_at = CASE
                WHEN ?4 IN ('done', 'closed', 'resolved', 'verified') THEN datetime('now')
                ELSE NULL
            END,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .bind(&title)
    .bind(&description)
    .bind(status)
    .bind(priority)
    .bind(assignee_user_id)
    .bind(&due_date)
    .bind(parent_work_item_id)
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'work_item.updated', 'work_item', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("更新工作项 {item_key}"))
    .bind(format!(
        r#"{{"status":"{status}","previous_status":"{current_status}","priority":"{priority}","assignee_username":"{assignee_username}","due_date":"{due_date}","parent_item_key":"{parent_item_key}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

/// 仅用于维护历史工作项；用户可见的关闭流程应走状态流转。
pub async fn archive_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
) -> AppResult<WorkItemDetail> {
    let Some((work_item_id, project_id, project_status, deleted_at)) =
        sqlx::query_as::<_, (i64, i64, String, String)>(
            r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                COALESCE(wi.deleted_at, '') AS deleted_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            WHERE wi.item_key = ?1
            "#,
        )
        .bind(item_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    if !deleted_at.is_empty() {
        return get_work_item_detail(pool, item_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()));
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE work_items
        SET deleted_at = datetime('now'),
            deleted_by_user_id = ?2,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
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
        VALUES (?1, ?2, 'work_item.archived', 'work_item', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("归档工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn restore_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
) -> AppResult<WorkItemDetail> {
    let Some((work_item_id, project_id, project_status, deleted_at)) =
        sqlx::query_as::<_, (i64, i64, String, String)>(
            r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                COALESCE(wi.deleted_at, '') AS deleted_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            WHERE wi.item_key = ?1
            "#,
        )
        .bind(item_key)
        .fetch_optional(pool)
        .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    if deleted_at.is_empty() {
        return get_work_item_detail(pool, item_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()));
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE work_items
        SET deleted_at = NULL,
            deleted_by_user_id = NULL,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
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
        VALUES (?1, ?2, 'work_item.restored', 'work_item', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("恢复工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn add_work_item_comment(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    body: &str,
) -> AppResult<WorkItemCommentSummary> {
    add_work_item_comment_reply(pool, actor_user_id, item_key, body, None).await
}

pub async fn add_work_item_comment_reply(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    body: &str,
    parent_comment_id: Option<i64>,
) -> AppResult<WorkItemCommentSummary> {
    let body = validate_optional_text(body, "评论内容", 5000)?;
    if body.is_empty() {
        return Err(AppError::BadRequest("评论内容不能为空".to_string()));
    }
    ensure_plain_work_item_comment_body(&body)?;
    let Some((work_item_id, project_id, project_status)) = sqlx::query_as::<_, (i64, i64, String)>(
        r#"
        SELECT wi.id, wi.project_id, p.status
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        WHERE wi.item_key = ?1
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    let mut reply_recipient = None;
    if let Some(parent_comment_id) = parent_comment_id {
        let parent = get_work_item_comment(pool, work_item_id, parent_comment_id).await?;
        if parent.is_flow {
            return Err(AppError::BadRequest("不能回复系统流程记录".to_string()));
        }
        reply_recipient = parent.author_user_id;
    }

    let mut tx = pool.begin().await?;
    let comment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            body,
            parent_comment_id
        )
        VALUES (?1, ?2, ?3, ?4)
        RETURNING id
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(&body)
    .bind(parent_comment_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE work_items
        SET updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .execute(&mut *tx)
    .await?;

    if let Some(recipient_user_id) = reply_recipient {
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id,
                actor_user_id,
                kind: "comment_replied",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 的内容收到回复"),
                body: &body,
            },
        )
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
            summary
        )
        VALUES (?1, ?2, 'work_item.commented', 'work_item', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(item_key)
    .bind(format!("评论工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            Option<i64>,
            String,
            String,
            String,
            String,
            Option<i64>,
            String,
        ),
    >(
        r#"
        SELECT
            c.id,
            c.body,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.id = ?1
        "#,
    )
    .bind(comment_id)
    .fetch_one(pool)
    .await?;

    let (body, is_flow) = normalize_work_item_comment_body(row.1);
    Ok(WorkItemCommentSummary {
        id: row.0,
        parent_comment_id: row.7,
        parent_author_display_name: row.8,
        body,
        author_user_id: row.2,
        author_username: row.3,
        author_display_name: row.4,
        created_at: row.5,
        updated_at: row.6,
        is_flow,
    })
}

pub async fn get_work_item_comment(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
) -> AppResult<WorkItemCommentSummary> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            Option<i64>,
            String,
            String,
            String,
            String,
            Option<i64>,
            String,
        ),
    >(
        r#"
        SELECT
            c.id,
            c.body,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.id = ?1
          AND c.work_item_id = ?2
          AND c.deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("评论不存在".to_string()))?;

    let (body, is_flow) = normalize_work_item_comment_body(row.1);
    Ok(WorkItemCommentSummary {
        id: row.0,
        parent_comment_id: row.7,
        parent_author_display_name: row.8,
        body,
        author_user_id: row.2,
        author_username: row.3,
        author_display_name: row.4,
        created_at: row.5,
        updated_at: row.6,
        is_flow,
    })
}

pub async fn update_work_item_comment(
    pool: &SqlitePool,
    actor_user_id: i64,
    actor_is_super_admin: bool,
    item_key: &str,
    comment_id: i64,
    body: &str,
) -> AppResult<WorkItemCommentSummary> {
    let body = validate_optional_text(body, "评论内容", 5000)?;
    if body.is_empty() {
        return Err(AppError::BadRequest("评论内容不能为空".to_string()));
    }
    ensure_plain_work_item_comment_body(&body)?;
    let Some((work_item_id, project_id, project_status)) = sqlx::query_as::<_, (i64, i64, String)>(
        r#"
        SELECT wi.id, wi.project_id, p.status
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        WHERE wi.item_key = ?1
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    let comment = get_work_item_comment(pool, work_item_id, comment_id).await?;
    if comment.is_flow {
        return Err(AppError::Forbidden("流程记录不能修改".to_string()));
    }
    if !user_can_manage_work_item_comment(
        pool,
        project_id,
        comment.author_user_id,
        actor_user_id,
        actor_is_super_admin,
    )
    .await?
    {
        return Err(AppError::Forbidden("无权修改该评论".to_string()));
    }

    let mut tx = pool.begin().await?;
    let updated_count = sqlx::query(
        r#"
        UPDATE work_item_comments
        SET body = ?3,
            updated_at = datetime('now')
        WHERE id = ?1
          AND work_item_id = ?2
          AND deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .bind(&body)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if updated_count == 0 {
        return Err(AppError::NotFound("评论不存在".to_string()));
    }

    sqlx::query(
        r#"
        UPDATE work_items
        SET updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
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
            summary,
            metadata
        )
        VALUES (?1, ?2, 'work_item.comment.updated', 'comment', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(comment_id.to_string())
    .bind(format!("编辑工作项 {item_key} 评论"))
    .bind(format!(r#"{{"work_item":"{item_key}"}}"#))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_work_item_comment(pool, work_item_id, comment_id).await
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
            COALESCE(u.display_name, '') AS actor_display_name,
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
            COALESCE(u.display_name, '') AS actor_display_name,
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
            COALESCE(u.display_name, '') AS actor_display_name,
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

    let mut hits = project_hits
        .into_iter()
        .chain(work_item_hits.into_iter())
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
    let total_items = if is_super_admin {
        let (total_items,) = sqlx::query_as::<_, (i64,)>(
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
            ) hits
            "#,
        )
        .bind(&like)
        .bind(include_projects)
        .bind(include_work_items)
        .fetch_one(pool)
        .await?;
        total_items
    } else {
        let (total_items,) = sqlx::query_as::<_, (i64,)>(
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
            ) hits
            "#,
        )
        .bind(&like)
        .bind(user_id)
        .bind(include_projects)
        .bind(include_work_items)
        .fetch_one(pool)
        .await?;
        total_items
    };

    let rows = if is_super_admin {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
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
            ) hits
            ORDER BY updated_at DESC, hit_key DESC
            LIMIT ?4 OFFSET ?5
            "#,
        )
        .bind(&like)
        .bind(include_projects)
        .bind(include_work_items)
        .bind(pagination.per_page)
        .bind(pagination.offset())
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, String, String, String)>(
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
            ) hits
            ORDER BY updated_at DESC, hit_key DESC
            LIMIT ?5 OFFSET ?6
            "#,
        )
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

fn normalize_project_filter(filter: ProjectListFilter) -> AppResult<NormalizedProjectFilter> {
    let status = match filter.status.trim() {
        "" => String::new(),
        value => validate_project_status(value)?.to_string(),
    };

    Ok(NormalizedProjectFilter { status })
}

fn normalize_work_item_filter(filter: WorkItemListFilter) -> AppResult<NormalizedWorkItemFilter> {
    let item_type = match filter.item_type.as_deref().map(str::trim) {
        None | Some("") => String::new(),
        Some(value) => validate_work_item_type(value)?.to_string(),
    };
    let keyword = validate_optional_text(&filter.keyword, "关键词", 120)?;
    let keyword_like = if keyword.is_empty() {
        String::new()
    } else {
        format!("%{keyword}%")
    };
    let status = match filter.status.trim() {
        "" => String::new(),
        "pending" => "pending".to_string(),
        value => validate_work_item_status(value)?.to_string(),
    };
    let priority = match filter.priority.trim() {
        "" => String::new(),
        value => validate_priority(value)?.to_string(),
    };
    let project_key = match filter.project_key.trim() {
        "" => String::new(),
        value => validate_project_key(value)?,
    };
    let assignee_username = match filter.assignee_username.trim() {
        "" => String::new(),
        value => validate_username_ref(value)?,
    };

    Ok(NormalizedWorkItemFilter {
        item_type,
        keyword_like,
        status,
        priority,
        project_key,
        assignee_username,
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
        "#,
    )
    .bind(&normalized.status)
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
        "#,
    )
    .bind(user_id)
    .bind(&normalized.status)
    .fetch_one(pool)
    .await?)
}

async fn count_work_item_summaries_filtered(
    pool: &SqlitePool,
    normalized: &NormalizedWorkItemFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        WHERE (?1 = '' OR wi.item_type = ?1)
          AND (
            ?2 = ''
            OR wi.item_key LIKE ?2
            OR wi.title LIKE ?2
            OR wi.description LIKE ?2
            OR p.project_key LIKE ?2
            OR p.name LIKE ?2
          )
          AND (?3 = '' OR (?3 = 'pending' AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')) OR wi.status = ?3)
          AND (?4 = '' OR wi.priority = ?4)
          AND (?5 = '' OR p.project_key = ?5)
          AND (?6 = '' OR assignee.username = ?6)
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .fetch_one(pool)
    .await?)
}

async fn count_work_item_summaries_filtered_for_user(
    pool: &SqlitePool,
    user_id: i64,
    normalized: &NormalizedWorkItemFilter,
) -> AppResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        JOIN project_members pm ON pm.project_id = p.id
            AND pm.user_id = ?1
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        WHERE (?2 = '' OR wi.item_type = ?2)
          AND (
            ?3 = ''
            OR wi.item_key LIKE ?3
            OR wi.title LIKE ?3
            OR wi.description LIKE ?3
            OR p.project_key LIKE ?3
            OR p.name LIKE ?3
          )
          AND (?4 = '' OR (?4 = 'pending' AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')) OR wi.status = ?4)
          AND (?5 = '' OR wi.priority = ?5)
          AND (?6 = '' OR p.project_key = ?6)
          AND (?7 = '' OR assignee.username = ?7)
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(user_id)
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .fetch_one(pool)
    .await?)
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

fn work_item_status_label(status: &str) -> &'static str {
    match status {
        "open" => "待处理",
        "in_progress" => "进行中",
        "done" => "已完成",
        "resolved" => "已解决",
        "verified" => "已验证",
        "closed" => "已关闭",
        "cancelled" => "已取消",
        _ => "未知",
    }
}

fn assignee_label(display_name: &str) -> &str {
    let display_name = display_name.trim();
    if display_name.is_empty() {
        "未分配"
    } else {
        display_name
    }
}

fn format_work_item_flow_summary(
    previous_status: &str,
    next_status: &str,
    previous_assignee: &str,
    next_assignee: &str,
    body: &str,
) -> String {
    let mut parts = Vec::new();
    if previous_status != next_status {
        parts.push(format!(
            "状态：{} → {}",
            work_item_status_label(previous_status),
            work_item_status_label(next_status)
        ));
    }
    if previous_assignee.trim() != next_assignee.trim() {
        parts.push(format!(
            "处理人：{} → {}",
            assignee_label(previous_assignee),
            assignee_label(next_assignee)
        ));
    }
    let body = body.trim();
    if !body.is_empty() {
        parts.push(format!("说明：{body}"));
    }
    if parts.is_empty() {
        parts.push("记录了一次处理进展".to_string());
    }
    parts.join("；")
}

fn validate_work_item_type(item_type: &str) -> AppResult<&'static str> {
    match item_type.trim() {
        "requirement" => Ok("requirement"),
        "task" => Ok("task"),
        "bug" => Ok("bug"),
        _ => Err(AppError::BadRequest(
            "工作项类型只能是 requirement / task / bug".to_string(),
        )),
    }
}

fn normalize_work_item_comment_body(body: String) -> (String, bool) {
    match body.strip_prefix(WORK_ITEM_FLOW_COMMENT_PREFIX) {
        Some(flow_body) => (flow_body.to_string(), true),
        None => (body, false),
    }
}

fn encode_flow_comment_body(body: &str) -> String {
    format!("{WORK_ITEM_FLOW_COMMENT_PREFIX}{body}")
}

fn ensure_plain_work_item_comment_body(body: &str) -> AppResult<()> {
    if body.starts_with(WORK_ITEM_FLOW_COMMENT_PREFIX) {
        return Err(AppError::BadRequest(
            "评论内容不能使用系统流程前缀".to_string(),
        ));
    }

    Ok(())
}

async fn resolve_project_member_user_id(
    pool: &SqlitePool,
    project_id: i64,
    username: &str,
) -> AppResult<i64> {
    let username = validate_username_ref(username)?;
    sqlx::query_scalar::<_, i64>(
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
    .bind(&username)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("处理人必须是已启用的项目成员".to_string()))
}

async fn resolve_parent_work_item_id(
    pool: &SqlitePool,
    project_id: i64,
    item_type: &str,
    parent_item_key: &str,
) -> AppResult<Option<i64>> {
    let parent_item_key = parent_item_key.trim();
    if parent_item_key.is_empty() {
        return Ok(None);
    }
    if item_type != "task" {
        return Err(AppError::BadRequest("只有任务可以关联父级需求".to_string()));
    }
    let parent_item_key = validate_work_item_key_ref(parent_item_key)?;
    let parent_id = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT id
        FROM work_items
        WHERE project_id = ?1
          AND item_key = ?2
          AND item_type = 'requirement'
          AND deleted_at IS NULL
        "#,
    )
    .bind(project_id)
    .bind(&parent_item_key)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("父级需求必须是同项目内未删除需求".to_string()))?;

    Ok(Some(parent_id))
}

fn validate_work_item_key_ref(item_key: &str) -> AppResult<String> {
    let item_key = item_key.trim().to_ascii_uppercase();
    if item_key.len() < 5 || item_key.len() > 64 {
        return Err(AppError::BadRequest("工作项编号无效".to_string()));
    }
    if !item_key
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || matches!(c, '_' | '-'))
    {
        return Err(AppError::BadRequest("工作项编号无效".to_string()));
    }
    Ok(item_key)
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

fn validate_work_item_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "open" => Ok("open"),
        "in_progress" => Ok("in_progress"),
        "done" => Ok("done"),
        "verified" => Ok("verified"),
        "resolved" => Ok("resolved"),
        "closed" => Ok("closed"),
        "cancelled" => Ok("cancelled"),
        _ => Err(AppError::BadRequest(
            "工作项状态只能是 open / in_progress / done / verified / resolved / closed / cancelled"
                .to_string(),
        )),
    }
}

pub fn normalize_work_item_status(status: &str) -> AppResult<&'static str> {
    validate_work_item_status(status)
}

pub fn allowed_work_item_status_transitions(
    current_status: &str,
) -> AppResult<&'static [&'static str]> {
    match validate_work_item_status(current_status)? {
        "open" => Ok(&["in_progress", "closed"]),
        "in_progress" => Ok(&["open", "done", "resolved", "closed"]),
        "done" => Ok(&["in_progress", "verified", "closed"]),
        "resolved" => Ok(&["in_progress", "verified", "closed"]),
        "verified" => Ok(&["in_progress", "closed"]),
        "closed" | "cancelled" => Ok(&["in_progress"]),
        _ => unreachable!("validated work item status should be exhaustive"),
    }
}

fn ensure_work_item_status_transition(current_status: &str, next_status: &str) -> AppResult<()> {
    let current_status = validate_work_item_status(current_status)?;
    let next_status = validate_work_item_status(next_status)?;
    if current_status == next_status
        || allowed_work_item_status_transitions(current_status)?.contains(&next_status)
    {
        return Ok(());
    }

    Err(AppError::BadRequest(format!(
        "工作项状态不能从 {current_status} 流转到 {next_status}"
    )))
}

fn validate_member_role(member_role: &str) -> AppResult<&'static str> {
    match member_role.trim() {
        "" | "member" => Ok("member"),
        "owner" => Ok("owner"),
        "maintainer" => Ok("maintainer"),
        "viewer" => Ok("viewer"),
        _ => Err(AppError::BadRequest(
            "项目成员角色只能是 owner / maintainer / member / viewer".to_string(),
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

fn work_item_key_segment(item_type: &str) -> &'static str {
    match item_type {
        "requirement" => "REQ",
        "task" => "TASK",
        "bug" => "BUG",
        _ => "ITEM",
    }
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

async fn seed_demo_members(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO project_members (
            project_id,
            user_id,
            member_role
        )
        SELECT id, ?1, 'owner'
        FROM projects
        WHERE project_key IN ('YCE', 'OPS', 'CRM')
        ON CONFLICT(project_id, user_id) DO UPDATE SET
            member_role = excluded.member_role,
            updated_at = datetime('now')
        "#,
    )
    .bind(owner_user_id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_demo_work_items(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    let items = [
        (
            "YCE",
            "YCE-REQ-1",
            "requirement",
            "统一 /web 用户工作台与系统管理入口",
            "设计统一入口、导航和权限菜单，不再建设独立后台。",
            "in_progress",
            "P0",
        ),
        (
            "YCE",
            "YCE-TASK-1",
            "task",
            "初始化 Rust API 模块和路由冒烟测试",
            "建立 Axum、Askama、SQLx、SQLite、htmx 的基础工程骨架。",
            "done",
            "P0",
        ),
        (
            "YCE",
            "YCE-BUG-1",
            "bug",
            "首次初始化完成后禁止重复开放入口",
            "初始化状态必须独立持久化，不能依赖管理员数量推断。",
            "verified",
            "P1",
        ),
        (
            "YCE",
            "YCE-TASK-2",
            "task",
            "设计项目与工作项数据模型",
            "落地项目、成员、需求、任务、Bug、评论和动态表。",
            "in_progress",
            "P0",
        ),
        (
            "OPS",
            "OPS-TASK-1",
            "task",
            "补齐迁移运行手册",
            "明确 SQLite 备份、显式迁移、seed 边界和生产验证流程。",
            "open",
            "P2",
        ),
        (
            "CRM",
            "CRM-BUG-1",
            "bug",
            "外部线索状态映射需要人工确认",
            "CRM 状态与元策项目工作项状态存在口径差异。",
            "open",
            "P1",
        ),
    ];

    for (project_key, item_key, item_type, title, description, status, priority) in items {
        sqlx::query(
            r#"
            INSERT INTO work_items (
                project_id,
                item_key,
                item_type,
                title,
                description,
                status,
                priority,
                assignee_user_id,
                reporter_user_id
            )
            SELECT
                p.id,
                ?2,
                ?3,
                ?4,
                ?5,
                ?6,
                ?7,
                ?8,
                ?8
            FROM projects p
            WHERE p.project_key = ?1
            ON CONFLICT(item_key) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                status = excluded.status,
                priority = excluded.priority,
                assignee_user_id = excluded.assignee_user_id,
                reporter_user_id = excluded.reporter_user_id,
                updated_at = datetime('now')
            "#,
        )
        .bind(project_key)
        .bind(item_key)
        .bind(item_type)
        .bind(title)
        .bind(description)
        .bind(status)
        .bind(priority)
        .bind(owner_user_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn seed_demo_comments(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    let comments = [
        (
            "YCE-TASK-2",
            "先统一项目与工作项查询模型，再继续补页面交互。",
        ),
        (
            "YCE-REQ-1",
            "系统管理入口已经合并到 /web，后续只通过权限控制可见性。",
        ),
    ];

    for (item_key, body) in comments {
        sqlx::query(
            r#"
            INSERT INTO work_item_comments (
                work_item_id,
                author_user_id,
                body
            )
            SELECT wi.id, ?2, ?3
            FROM work_items wi
            WHERE wi.item_key = ?1
              AND NOT EXISTS (
                SELECT 1
                FROM work_item_comments existing
                WHERE existing.work_item_id = wi.id
                  AND existing.body = ?3
              )
            "#,
        )
        .bind(item_key)
        .bind(owner_user_id)
        .bind(body)
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
