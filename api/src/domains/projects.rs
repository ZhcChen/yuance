use sqlx::SqlitePool;

use crate::platform::error::{AppError, AppResult};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectDetail {
    pub id: i64,
    pub project_key: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub owner_display_name: String,
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
    pub assignee_display_name: String,
    pub reporter_display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkItemCommentSummary {
    pub id: i64,
    pub body: String,
    pub author_display_name: String,
    pub created_at: String,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateProjectInput {
    pub project_key: String,
    pub name: String,
    pub description: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateWorkItemInput {
    pub project_key: String,
    pub item_type: String,
    pub title: String,
    pub description: String,
    pub priority: String,
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
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
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
        .collect())
}

pub async fn list_project_summaries_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
) -> AppResult<Vec<ProjectSummary>> {
    if is_super_admin {
        return list_project_summaries(pool).await;
    }

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
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.id DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
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
        .collect())
}

pub async fn create_project(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateProjectInput,
) -> AppResult<ProjectDetail> {
    let project_key = validate_project_key(&input.project_key)?;
    let name = validate_name(&input.name, "项目名称", 120)?;
    let description = validate_optional_text(&input.description, "项目描述", 2000)?;
    let status = validate_project_status(&input.status)?;

    let mut tx = pool.begin().await?;
    let project_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO projects (
            project_key,
            name,
            description,
            status,
            owner_user_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        RETURNING id
        "#,
    )
    .bind(&project_key)
    .bind(&name)
    .bind(&description)
    .bind(status)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await?;

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

    get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目创建后未找到".to_string()))
}

pub async fn get_project_detail(
    pool: &SqlitePool,
    project_key: &str,
) -> AppResult<Option<ProjectDetail>> {
    let row = sqlx::query_as::<_, (i64, String, String, String, String, String, String, String)>(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.description,
            p.status,
            COALESCE(u.display_name, '') AS owner_display_name,
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
            owner_display_name,
            created_at,
            updated_at,
        )| ProjectDetail {
            id,
            project_key,
            name,
            description,
            status,
            owner_display_name,
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
                COALESCE(u.display_name, '') AS assignee_display_name,
                wi.updated_at
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            LEFT JOIN users u ON u.id = wi.assignee_user_id
            WHERE wi.project_id = ?1
              AND (?2 IS NULL OR wi.item_type = ?2)
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
            WHERE (?1 IS NULL OR wi.item_type = ?1)
            ORDER BY wi.updated_at DESC, wi.id DESC
            "#,
    )
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

pub async fn list_work_item_summaries_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    item_type: Option<&str>,
) -> AppResult<Vec<WorkItemSummary>> {
    if is_super_admin {
        return list_work_item_summaries(pool, item_type).await;
    }

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
            JOIN project_members pm ON pm.project_id = p.id
                AND pm.user_id = ?1
            LEFT JOIN users u ON u.id = wi.assignee_user_id
            WHERE (?2 IS NULL OR wi.item_type = ?2)
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
    let item_segment = work_item_key_segment(item_type);

    let mut tx = pool.begin().await?;
    let project_id = sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = ?1")
        .bind(&project_key)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;

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
        VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?7)
        "#,
    )
    .bind(project_id)
    .bind(&item_key)
    .bind(item_type)
    .bind(&title)
    .bind(&description)
    .bind(priority)
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
            wi.description,
            wi.status,
            wi.priority,
            p.project_key,
            p.name AS project_name,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            COALESCE(reporter.display_name, '') AS reporter_display_name,
            wi.created_at,
            wi.updated_at
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        LEFT JOIN users reporter ON reporter.id = wi.reporter_user_id
        WHERE wi.item_key = ?1
        "#,
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            project_key,
            project_name,
            assignee_display_name,
            reporter_display_name,
            created_at,
            updated_at,
        )| WorkItemDetail {
            id,
            item_key,
            item_type,
            title,
            description,
            status,
            priority,
            project_key,
            project_name,
            assignee_display_name,
            reporter_display_name,
            created_at,
            updated_at,
        },
    ))
}

pub async fn list_work_item_comments(
    pool: &SqlitePool,
    work_item_id: i64,
) -> AppResult<Vec<WorkItemCommentSummary>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String)>(
        r#"
        SELECT
            c.id,
            c.body,
            COALESCE(u.display_name, '') AS author_display_name,
            c.created_at
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.work_item_id = ?1
        ORDER BY c.created_at DESC, c.id DESC
        "#,
    )
    .bind(work_item_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, body, author_display_name, created_at)| WorkItemCommentSummary {
                id,
                body,
                author_display_name,
                created_at,
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
    let Some((work_item_id, project_id)) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, project_id FROM work_items WHERE item_key = ?1",
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
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
    .bind(format!(r#"{{"status":"{status}"}}"#))
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
    let body = validate_optional_text(body, "评论内容", 5000)?;
    if body.is_empty() {
        return Err(AppError::BadRequest("评论内容不能为空".to_string()));
    }
    let Some((work_item_id, project_id)) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, project_id FROM work_items WHERE item_key = ?1",
    )
    .bind(item_key)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };

    let mut tx = pool.begin().await?;
    let comment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            body
        )
        VALUES (?1, ?2, ?3)
        RETURNING id
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(&body)
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

    let row = sqlx::query_as::<_, (i64, String, String, String)>(
        r#"
        SELECT
            c.id,
            c.body,
            COALESCE(u.display_name, '') AS author_display_name,
            c.created_at
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        WHERE c.id = ?1
        "#,
    )
    .bind(comment_id)
    .fetch_one(pool)
    .await?;

    Ok(WorkItemCommentSummary {
        id: row.0,
        body: row.1,
        author_display_name: row.2,
        created_at: row.3,
    })
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
            WHERE wi.item_key LIKE ?1
               OR wi.title LIKE ?1
               OR wi.description LIKE ?1
               OR p.project_key LIKE ?1
               OR p.name LIKE ?1
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
            WHERE wi.item_key LIKE ?1
               OR wi.title LIKE ?1
               OR wi.description LIKE ?1
               OR p.project_key LIKE ?1
               OR p.name LIKE ?1
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

fn validate_project_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "" | "active" => Ok("active"),
        "planning" => Ok("planning"),
        "paused" => Ok("paused"),
        "archived" => Ok("archived"),
        _ => Err(AppError::BadRequest(
            "项目状态只能是 planning / active / paused / archived".to_string(),
        )),
    }
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
            "active",
        ),
        (
            "OPS",
            "交付运维台",
            "沉淀迁移、审计、配置和运行态验证能力。",
            "planning",
        ),
        (
            "CRM",
            "客户线索同步",
            "从 CRM 视角验证项目协作和外部集成边界。",
            "paused",
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
