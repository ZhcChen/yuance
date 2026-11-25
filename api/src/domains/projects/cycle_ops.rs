//! 项目周期领域：创建、编辑、关闭与周期统计。

use super::*;

pub(super) fn project_cycle_detail_from_row(row: SqliteRow) -> ProjectCycleDetail {
    ProjectCycleDetail {
        id: row.get("id"),
        project_id: row.get("project_id"),
        name: row.get("name"),
        goal: row.get("goal"),
        description: row.get("description"),
        owner_username: row.get("owner_username"),
        owner_display_name: row.get("owner_display_name"),
        start_date: row.get("start_date"),
        end_date: row.get("end_date"),
        closed_at: row.get("closed_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        total_items: row.get("total_items"),
        requirement_count: row.get("requirement_count"),
        task_count: row.get("task_count"),
        bug_count: row.get("bug_count"),
        pending_count: row.get("pending_count"),
    }
}

pub async fn list_project_cycles(
    pool: &SqlitePool,
    project_id: i64,
) -> AppResult<Vec<ProjectCycleDetail>> {
    if project_id <= 0 {
        return Err(AppError::BadRequest("项目 ID 无效".to_string()));
    }

    let rows = sqlx::query(
        r#"
        SELECT
            pc.id,
            pc.project_id,
            pc.name,
            pc.goal,
            pc.description,
            COALESCE(owner.username, '') AS owner_username,
            COALESCE(owner.display_name, '') AS owner_display_name,
            pc.start_date,
            pc.end_date,
            COALESCE(pc.closed_at, '') AS closed_at,
            pc.created_at,
            pc.updated_at,
            COUNT(wi.id) AS total_items,
            COALESCE(SUM(CASE WHEN wi.item_type = 'requirement' THEN 1 ELSE 0 END), 0) AS requirement_count,
            COALESCE(SUM(CASE WHEN wi.item_type = 'task' THEN 1 ELSE 0 END), 0) AS task_count,
            COALESCE(SUM(CASE WHEN wi.item_type = 'bug' THEN 1 ELSE 0 END), 0) AS bug_count,
            COALESCE(
                SUM(
                    CASE
                        WHEN wi.status IN ('open', 'in_progress', 'pending_confirmation') THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS pending_count
        FROM project_cycles pc
        LEFT JOIN users owner ON owner.id = pc.owner_user_id
        LEFT JOIN work_items wi ON wi.cycle_id = pc.id
            AND wi.deleted_at IS NULL
        WHERE pc.project_id = ?1
        GROUP BY pc.id
        ORDER BY
            CASE
                WHEN COALESCE(pc.closed_at, '') = '' THEN 0
                ELSE 1
            END ASC,
            pc.end_date DESC,
            pc.start_date DESC,
            pc.sort_order ASC,
            pc.id DESC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(project_cycle_detail_from_row)
        .collect())
}

pub async fn get_project_cycle(
    pool: &SqlitePool,
    project_id: i64,
    cycle_id: i64,
) -> AppResult<ProjectCycleDetail> {
    if project_id <= 0 || cycle_id <= 0 {
        return Err(AppError::BadRequest("周期 ID 无效".to_string()));
    }

    let row = sqlx::query(
        r#"
        SELECT
            pc.id,
            pc.project_id,
            pc.name,
            pc.goal,
            pc.description,
            COALESCE(owner.username, '') AS owner_username,
            COALESCE(owner.display_name, '') AS owner_display_name,
            pc.start_date,
            pc.end_date,
            COALESCE(pc.closed_at, '') AS closed_at,
            pc.created_at,
            pc.updated_at,
            COUNT(wi.id) AS total_items,
            COALESCE(SUM(CASE WHEN wi.item_type = 'requirement' THEN 1 ELSE 0 END), 0) AS requirement_count,
            COALESCE(SUM(CASE WHEN wi.item_type = 'task' THEN 1 ELSE 0 END), 0) AS task_count,
            COALESCE(SUM(CASE WHEN wi.item_type = 'bug' THEN 1 ELSE 0 END), 0) AS bug_count,
            COALESCE(
                SUM(
                    CASE
                        WHEN wi.status IN ('open', 'in_progress', 'pending_confirmation') THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS pending_count
        FROM project_cycles pc
        LEFT JOIN users owner ON owner.id = pc.owner_user_id
        LEFT JOIN work_items wi ON wi.cycle_id = pc.id
            AND wi.deleted_at IS NULL
        WHERE pc.project_id = ?1
          AND pc.id = ?2
        GROUP BY pc.id
        "#,
    )
    .bind(project_id)
    .bind(cycle_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("周期不存在".to_string()))?;

    Ok(project_cycle_detail_from_row(row))
}

pub async fn create_project_cycle(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    input: CreateProjectCycleInput,
) -> AppResult<ProjectCycleDetail> {
    let project_key = validate_project_key(project_key)?;
    let name = validate_name(&input.name, "周期名称", 120)?;
    let goal = validate_optional_text(&input.goal, "周期目标", 240)?;
    let description = validate_optional_text(&input.description, "周期说明", 5000)?;
    let owner_username = input.owner_username.trim();
    let start_date = validate_optional_date(&input.start_date, "周期开始日期")?;
    let end_date = validate_optional_date(&input.end_date, "周期结束日期")?;
    if start_date.is_empty() {
        return Err(AppError::BadRequest("周期开始日期不能为空".to_string()));
    }
    if end_date.is_empty() {
        return Err(AppError::BadRequest("周期结束日期不能为空".to_string()));
    }
    validate_date_range(&start_date, &end_date, "周期结束日期不能早于开始日期")?;

    let (project_id, project_status) = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, status FROM projects WHERE project_key = ?1",
    )
    .bind(&project_key)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("项目不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;

    let owner_user_id = if owner_username.is_empty() {
        None
    } else {
        Some(resolve_project_member_user_id(pool, project_id, owner_username).await?)
    };

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let sort_order = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_cycles WHERE project_id = ?1",
    )
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;
    let cycle_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO project_cycles (
            project_id,
            name,
            goal,
            description,
            owner_user_id,
            start_date,
            end_date,
            sort_order
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(&name)
    .bind(&goal)
    .bind(&description)
    .bind(owner_user_id)
    .bind(&start_date)
    .bind(&end_date)
    .bind(sort_order)
    .fetch_one(&mut *tx)
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
        VALUES (?1, ?2, 'project_cycle.created', 'project_cycle', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(cycle_id.to_string())
    .bind(format!("创建周期 {name}"))
    .bind(format!(
        r#"{{"owner_username":"{}","start_date":"{}","end_date":"{}"}}"#,
        owner_username, start_date, end_date
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_cycle(pool, project_id, cycle_id).await
}

pub async fn update_project_cycle(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    cycle_id: i64,
    input: UpdateProjectCycleInput,
) -> AppResult<ProjectCycleDetail> {
    let project_key = validate_project_key(project_key)?;
    if cycle_id <= 0 {
        return Err(AppError::BadRequest("周期 ID 无效".to_string()));
    }
    let name = validate_name(&input.name, "周期名称", 120)?;
    let goal = validate_optional_text(&input.goal, "周期目标", 240)?;
    let description = validate_optional_text(&input.description, "周期说明", 5000)?;
    let owner_username = input.owner_username.trim();
    let start_date = validate_optional_date(&input.start_date, "周期开始日期")?;
    let end_date = validate_optional_date(&input.end_date, "周期结束日期")?;
    if start_date.is_empty() {
        return Err(AppError::BadRequest("周期开始日期不能为空".to_string()));
    }
    if end_date.is_empty() {
        return Err(AppError::BadRequest("周期结束日期不能为空".to_string()));
    }
    validate_date_range(&start_date, &end_date, "周期结束日期不能早于开始日期")?;

    let (project_id, project_status) = sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT p.id, p.status
        FROM project_cycles pc
        JOIN projects p ON p.id = pc.project_id
        WHERE p.project_key = ?1
          AND pc.id = ?2
        "#,
    )
    .bind(&project_key)
    .bind(cycle_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("周期不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;

    let owner_user_id = if owner_username.is_empty() {
        None
    } else {
        Some(resolve_project_member_user_id(pool, project_id, owner_username).await?)
    };

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query(
        r#"
        UPDATE project_cycles
        SET name = ?2,
            goal = ?3,
            description = ?4,
            owner_user_id = ?5,
            start_date = ?6,
            end_date = ?7,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(cycle_id)
    .bind(&name)
    .bind(&goal)
    .bind(&description)
    .bind(owner_user_id)
    .bind(&start_date)
    .bind(&end_date)
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
        VALUES (?1, ?2, 'project_cycle.updated', 'project_cycle', ?3, ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(cycle_id.to_string())
    .bind(format!("更新周期 {name}"))
    .bind(format!(
        r#"{{"owner_username":"{}","start_date":"{}","end_date":"{}"}}"#,
        owner_username, start_date, end_date
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_cycle(pool, project_id, cycle_id).await
}

pub async fn close_project_cycle(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    cycle_id: i64,
) -> AppResult<ProjectCycleDetail> {
    let project_key = validate_project_key(project_key)?;
    if cycle_id <= 0 {
        return Err(AppError::BadRequest("周期 ID 无效".to_string()));
    }

    let (project_id, project_status, cycle_name, closed_at) =
        sqlx::query_as::<_, (i64, String, String, String)>(
            r#"
            SELECT
                p.id,
                p.status,
                pc.name,
                COALESCE(pc.closed_at, '') AS closed_at
            FROM project_cycles pc
            JOIN projects p ON p.id = pc.project_id
            WHERE p.project_key = ?1
              AND pc.id = ?2
            "#,
        )
        .bind(&project_key)
        .bind(cycle_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("周期不存在".to_string()))?;
    ensure_project_accepts_writes(&project_status)?;
    if !closed_at.is_empty() {
        return get_project_cycle(pool, project_id, cycle_id).await;
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query(
        r#"
        UPDATE project_cycles
        SET closed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(cycle_id)
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
        VALUES (?1, ?2, 'project_cycle.closed', 'project_cycle', ?3, ?4)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(cycle_id.to_string())
    .bind(format!("关闭周期 {cycle_name}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_project_cycle(pool, project_id, cycle_id).await
}

pub(super) fn parse_saved_view_cycle_id(value: &str) -> AppResult<Option<i64>> {
    match value.trim() {
        "" => Ok(None),
        raw => {
            let parsed = raw
                .parse::<i64>()
                .map_err(|_| AppError::BadRequest("周期不能为空且必须是数字".to_string()))?;
            if parsed <= 0 {
                return Err(AppError::BadRequest("周期不能为空且必须是数字".to_string()));
            }
            Ok(Some(parsed))
        }
    }
}

pub(super) async fn resolve_project_cycle(
    pool: &SqlitePool,
    project_id: i64,
    cycle_id: Option<i64>,
) -> AppResult<Option<(i64, String)>> {
    let Some(cycle_id) = cycle_id else {
        return Ok(None);
    };
    if cycle_id <= 0 {
        return Err(AppError::BadRequest("周期 ID 无效".to_string()));
    }

    sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT id, name
        FROM project_cycles
        WHERE id = ?1
          AND project_id = ?2
        "#,
    )
    .bind(cycle_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("周期不存在或不属于当前项目".to_string()))
    .map(Some)
}
