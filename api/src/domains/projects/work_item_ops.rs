//! 工作项领域：创建、编辑、状态流转、转交、归档与查询。

use super::*;

pub async fn list_work_item_saved_views_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
    item_type: &str,
) -> AppResult<Vec<WorkItemSavedView>> {
    let scope =
        resolve_work_item_saved_view_scope(pool, user_id, is_super_admin, project_key, item_type)
            .await?;
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
            Option<i64>,
            String,
            i64,
            i64,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            id,
            name,
            keyword,
            status,
            priority,
            assignee_username,
            sort_by,
            cycle_id,
            COALESCE((
                SELECT pc.name
                FROM project_cycles pc
                WHERE pc.id = work_item_saved_views.cycle_id
            ), '') AS cycle_name,
            per_page,
            is_default,
            created_at,
            updated_at
        FROM work_item_saved_views
        WHERE user_id = ?1
          AND project_id = ?2
          AND item_type = ?3
        ORDER BY is_default DESC, updated_at DESC, id DESC
        "#,
    )
    .bind(user_id)
    .bind(scope.project_id)
    .bind(&scope.item_type)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                name,
                keyword,
                status,
                priority,
                assignee_username,
                sort_by,
                cycle_id,
                cycle_name,
                per_page,
                is_default,
                created_at,
                updated_at,
            )| WorkItemSavedView {
                id,
                project_id: scope.project_id,
                project_key: scope.project_key.clone(),
                item_type: scope.item_type.clone(),
                name,
                filter: WorkItemListFilter {
                    item_type: Some(scope.item_type.clone()),
                    keyword,
                    status,
                    priority,
                    project_key: scope.project_key.clone(),
                    assignee_username,
                    cycle_id: cycle_id.map(|value| value.to_string()).unwrap_or_default(),
                    sort_by,
                },
                per_page,
                is_default: is_default != 0,
                cycle_name,
                created_at,
                updated_at,
            },
        )
        .collect())
}

pub async fn get_default_work_item_saved_view_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
    item_type: &str,
) -> AppResult<Option<WorkItemSavedView>> {
    let views =
        list_work_item_saved_views_for_user(pool, user_id, is_super_admin, project_key, item_type)
            .await?;
    Ok(views.into_iter().find(|view| view.is_default))
}

pub async fn create_work_item_saved_view(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
    item_type: &str,
    input: CreateWorkItemSavedViewInput,
) -> AppResult<WorkItemSavedView> {
    let scope =
        resolve_work_item_saved_view_scope(pool, user_id, is_super_admin, project_key, item_type)
            .await?;
    let name = validate_name(&input.name, "视图名称", 40)?;
    let filter = canonicalize_work_item_saved_view_filter(
        scope.project_key.as_str(),
        &scope.item_type,
        input.filter,
    )?;
    let pagination = normalize_pagination(Pagination {
        page: 1,
        per_page: input.per_page,
    })?;
    ensure_work_item_saved_view_cycle_in_scope(pool, scope.project_id, &filter.cycle_id).await?;

    let existing_count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_item_saved_views
        WHERE user_id = ?1
          AND project_id = ?2
          AND item_type = ?3
        "#,
    )
    .bind(user_id)
    .bind(scope.project_id)
    .bind(&scope.item_type)
    .fetch_one(pool)
    .await?;
    if existing_count >= WORK_ITEM_SAVED_VIEW_LIMIT_PER_SCOPE {
        return Err(AppError::BadRequest(format!(
            "每个项目的每类工作项最多只能保存 {} 个视图",
            WORK_ITEM_SAVED_VIEW_LIMIT_PER_SCOPE
        )));
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    if input.is_default {
        clear_default_work_item_saved_views(&mut tx, user_id, scope.project_id, &scope.item_type)
            .await?;
    }
    let insert_result = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_item_saved_views (
            user_id,
            project_id,
            item_type,
            name,
            keyword,
            status,
            priority,
            assignee_username,
            cycle_id,
            sort_by,
            per_page,
            is_default,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))
        RETURNING id
        "#,
    )
    .bind(user_id)
    .bind(scope.project_id)
    .bind(&scope.item_type)
    .bind(&name)
    .bind(&filter.keyword)
    .bind(&filter.status)
    .bind(&filter.priority)
    .bind(&filter.assignee_username)
    .bind(parse_saved_view_cycle_id(&filter.cycle_id)?)
    .bind(&filter.sort_by)
    .bind(pagination.per_page)
    .bind(if input.is_default { 1 } else { 0 })
    .fetch_one(&mut *tx)
    .await;
    let saved_view_id = match insert_result {
        Ok(saved_view_id) => saved_view_id,
        Err(error) => {
            return Err(map_work_item_saved_view_write_error(error, &name));
        }
    };
    tx.commit().await?;

    get_work_item_saved_view_by_id(pool, user_id, saved_view_id)
        .await?
        .ok_or_else(|| AppError::NotFound("保存视图不存在".to_string()))
}

pub async fn rename_work_item_saved_view(
    pool: &SqlitePool,
    user_id: i64,
    saved_view_id: i64,
    name: &str,
) -> AppResult<WorkItemSavedView> {
    let current = get_work_item_saved_view_by_id(pool, user_id, saved_view_id)
        .await?
        .ok_or_else(|| AppError::NotFound("保存视图不存在".to_string()))?;
    let name = validate_name(name, "视图名称", 40)?;
    if name == current.name {
        return Ok(current);
    }

    let update_result = sqlx::query(
        r#"
        UPDATE work_item_saved_views
        SET name = ?2,
            updated_at = datetime('now')
        WHERE id = ?1
          AND user_id = ?3
        "#,
    )
    .bind(saved_view_id)
    .bind(&name)
    .bind(user_id)
    .execute(pool)
    .await;
    match update_result {
        Ok(result) => {
            if result.rows_affected() == 0 {
                return Err(AppError::NotFound("保存视图不存在".to_string()));
            }
        }
        Err(error) => return Err(map_work_item_saved_view_write_error(error, &name)),
    }

    get_work_item_saved_view_by_id(pool, user_id, saved_view_id)
        .await?
        .ok_or_else(|| AppError::NotFound("保存视图不存在".to_string()))
}

pub async fn set_default_work_item_saved_view(
    pool: &SqlitePool,
    user_id: i64,
    saved_view_id: i64,
) -> AppResult<WorkItemSavedView> {
    let current = get_work_item_saved_view_by_id(pool, user_id, saved_view_id)
        .await?
        .ok_or_else(|| AppError::NotFound("保存视图不存在".to_string()))?;
    if current.is_default {
        return Ok(current);
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    clear_default_work_item_saved_views(&mut tx, user_id, current.project_id, &current.item_type)
        .await?;
    sqlx::query(
        r#"
        UPDATE work_item_saved_views
        SET is_default = 1,
            updated_at = datetime('now')
        WHERE id = ?1
          AND user_id = ?2
        "#,
    )
    .bind(saved_view_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    get_work_item_saved_view_by_id(pool, user_id, saved_view_id)
        .await?
        .ok_or_else(|| AppError::NotFound("保存视图不存在".to_string()))
}

pub async fn delete_work_item_saved_view(
    pool: &SqlitePool,
    user_id: i64,
    saved_view_id: i64,
) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM work_item_saved_views WHERE id = ?1 AND user_id = ?2")
        .bind(saved_view_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("保存视图不存在".to_string()));
    }
    Ok(())
}

pub async fn list_project_cycle_work_item_snapshots(
    pool: &SqlitePool,
    project_id: i64,
    cycle_id: i64,
) -> AppResult<Vec<ProjectCycleWorkItemSnapshot>> {
    if project_id <= 0 || cycle_id <= 0 {
        return Err(AppError::BadRequest("周期 ID 无效".to_string()));
    }

    let rows = sqlx::query_as::<
        _,
        (
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
            wi.item_key,
            wi.item_type,
            wi.title,
            wi.status,
            wi.priority,
            COALESCE(assignee.username, '') AS assignee_username,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            COALESCE(wi.due_date, '') AS due_date,
            wi.updated_at
        FROM work_items wi
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        WHERE wi.project_id = ?1
          AND wi.cycle_id = ?2
          AND wi.deleted_at IS NULL
        ORDER BY
            CASE wi.status
                WHEN 'open' THEN 1
                WHEN 'in_progress' THEN 2
                WHEN 'pending_confirmation' THEN 3
                ELSE 4
            END ASC,
            CASE wi.priority
                WHEN 'P0' THEN 1
                WHEN 'P1' THEN 2
                WHEN 'P2' THEN 3
                WHEN 'P3' THEN 4
                ELSE 5
            END ASC,
            wi.updated_at DESC,
            wi.id DESC
        "#,
    )
    .bind(project_id)
    .bind(cycle_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                item_key,
                item_type,
                title,
                status,
                priority,
                assignee_username,
                assignee_display_name,
                due_date,
                updated_at,
            )| ProjectCycleWorkItemSnapshot {
                item_key,
                item_type,
                title,
                status,
                priority,
                assignee_username,
                assignee_display_name,
                due_date,
                updated_at,
            },
        )
        .collect())
}

pub(super) async fn count_active_work_items_assigned_to_user(
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

pub fn user_can_edit_work_item_post(reporter_user_id: Option<i64>, user_id: i64) -> bool {
    reporter_user_id == Some(user_id)
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
                COALESCE(wi.due_date, '') AS due_date,
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
                due_date,
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
                due_date,
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
    let order_sql = work_item_sort_order_sql(&normalized.sort_by);
    let query_sql = format!(
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
                COALESCE(wi.due_date, '') AS due_date,
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
              AND (?7 IS NULL OR wi.cycle_id = ?7)
              AND wi.deleted_at IS NULL
            ORDER BY {order_sql}
            LIMIT ?8 OFFSET ?9
            "#,
    );
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
            String,
        ),
    >(AssertSqlSafe(query_sql))
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(normalized.cycle_id)
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
                due_date,
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
                due_date,
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
    let order_sql = work_item_sort_order_sql(&normalized.sort_by);
    let query_sql = format!(
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
                COALESCE(wi.due_date, '') AS due_date,
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
              AND (?8 IS NULL OR wi.cycle_id = ?8)
              AND wi.deleted_at IS NULL
            ORDER BY {order_sql}
            LIMIT ?9 OFFSET ?10
            "#,
    );
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
            String,
        ),
    >(AssertSqlSafe(query_sql))
    .bind(user_id)
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(normalized.cycle_id)
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
                due_date,
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
                due_date,
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

pub async fn work_item_list_stats_filtered_for_user(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    filter: WorkItemListFilter,
) -> AppResult<WorkItemListStats> {
    if is_super_admin {
        return work_item_list_stats_filtered(pool, filter).await;
    }

    let normalized = normalize_work_item_filter(filter)?;
    let row = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        r#"
        SELECT
            COUNT(*) AS total_items,
            COALESCE(SUM(CASE WHEN wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled') THEN 1 ELSE 0 END), 0) AS active_items,
            COALESCE(SUM(CASE WHEN wi.priority IN ('P0', 'P1') THEN 1 ELSE 0 END), 0) AS high_priority_items,
            COALESCE(SUM(CASE WHEN wi.status IN ('done', 'verified') THEN 1 ELSE 0 END), 0) AS completed_items
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
          AND (?8 IS NULL OR wi.cycle_id = ?8)
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
    .bind(normalized.cycle_id)
    .fetch_one(pool)
    .await?;

    Ok(WorkItemListStats {
        total_items: row.0,
        active_items: row.1,
        high_priority_items: row.2,
        completed_items: row.3,
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
                COALESCE(wi.due_date, '') AS due_date,
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
                due_date,
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
                due_date,
                updated_at,
            },
        )
        .collect())
}

pub async fn count_pending_assigned_work_items(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
    project_key: Option<&str>,
) -> AppResult<WorkItemAssignmentCounts> {
    let project_key = project_key.unwrap_or("").trim().to_ascii_uppercase();
    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT wi.item_type, COUNT(*)
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN project_members pm ON pm.project_id = wi.project_id
            AND pm.user_id = ?1
        WHERE wi.assignee_user_id = ?1
          AND (?2 = 1 OR pm.user_id IS NOT NULL)
          AND (?3 = '' OR p.project_key = ?3)
          AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
          AND wi.deleted_at IS NULL
        GROUP BY wi.item_type
        "#,
    )
    .bind(user_id)
    .bind(if can_access_all_projects { 1 } else { 0 })
    .bind(project_key)
    .fetch_all(pool)
    .await?;

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

pub async fn count_pending_assigned_work_items_by_project(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
) -> AppResult<Vec<ProjectAssignedPendingCount>> {
    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT p.project_key, COUNT(*)
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN project_members pm ON pm.project_id = wi.project_id
            AND pm.user_id = ?1
        WHERE wi.assignee_user_id = ?1
          AND (?2 = 1 OR pm.user_id IS NOT NULL)
          AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
          AND wi.deleted_at IS NULL
        GROUP BY p.project_key
        "#,
    )
    .bind(user_id)
    .bind(if can_access_all_projects { 1 } else { 0 })
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(project_key, total)| ProjectAssignedPendingCount { project_key, total })
        .collect())
}

pub async fn count_pending_visible_work_items(
    pool: &SqlitePool,
    user_id: i64,
    can_access_all_projects: bool,
    project_key: Option<&str>,
) -> AppResult<WorkItemAssignmentCounts> {
    let project_key = project_key.unwrap_or("").trim().to_ascii_uppercase();
    let rows = sqlx::query_as::<_, (String, i64)>(
        r#"
        SELECT wi.item_type, COUNT(*)
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN project_members pm ON pm.project_id = wi.project_id
            AND pm.user_id = ?1
        WHERE (?2 = 1 OR pm.user_id IS NOT NULL)
          AND (?3 = '' OR p.project_key = ?3)
          AND wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled')
          AND wi.deleted_at IS NULL
        GROUP BY wi.item_type
        "#,
    )
    .bind(user_id)
    .bind(if can_access_all_projects { 1 } else { 0 })
    .bind(project_key)
    .fetch_all(pool)
    .await?;

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

pub async fn create_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateWorkItemInput,
) -> AppResult<WorkItemDetail> {
    create_work_item_with_cycle(pool, actor_user_id, input, None).await
}

pub async fn create_work_item_with_cycle(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: CreateWorkItemInput,
    cycle_id: Option<i64>,
) -> AppResult<WorkItemDetail> {
    let project_key = validate_project_key(&input.project_key)?;
    let item_type = validate_work_item_type(&input.item_type)?;
    let title = validate_name(&input.title, "工作项标题", 160)?;
    let description = validate_optional_text(&input.description, "工作项描述", 5000)?;
    let priority = validate_priority(&input.priority)?;
    let due_date = validate_optional_date(&input.due_date, "工作项截止日期")?;
    let parent_item_key = input.parent_item_key.trim();
    let assignee_username = input.assignee_username.trim();
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(&input.actor_display_name_snapshot);
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
    let cycle = resolve_project_cycle(pool, project_id, cycle_id).await?;
    let cycle_id = cycle.as_ref().map(|(id, _)| *id);
    let assignee_user_id = if assignee_username.is_empty() {
        actor_user_id
    } else {
        resolve_project_member_user_id(pool, project_id, assignee_username).await?
    };

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
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
            reporter_display_name_snapshot,
            parent_work_item_id,
            cycle_id,
            due_date
        )
        VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?8, ?9, ?10, ?11, NULLIF(?12, ''))
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
    .bind(&actor_display_name_snapshot)
    .bind(parent_work_item_id)
    .bind(cycle_id)
    .bind(&due_date)
    .fetch_one(&mut *tx)
    .await?;

    notifications::create_in_transaction(
        &mut tx,
        CreateNotification {
            recipient_user_id: assignee_user_id,
            actor_user_id,
            actor_display_name_snapshot: &actor_display_name_snapshot,
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
            actor_display_name_snapshot,
            action,
            target_type,
            target_id,
            summary
        )
        VALUES (?1, ?2, ?3, 'work_item.created', 'work_item', ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(&item_key)
    .bind(format!("创建工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    if let Some((_, cycle_name)) = cycle {
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
            VALUES (?1, ?2, ?3, 'work_item.cycle.linked', 'work_item', ?4, ?5)
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
        .bind(&actor_display_name_snapshot)
        .bind(&item_key)
        .bind(format!("将工作项 {item_key} 关联到周期 {cycle_name}"))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    realtime::publish_topbar_refresh_for_user(assignee_user_id);

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
            wi.primary_post_comment_id AS primary_post_comment_id,
            wi.status AS status,
            wi.priority AS priority,
            p.project_key AS project_key,
            p.name AS project_name,
            COALESCE(parent.item_key, '') AS parent_item_key,
            COALESCE(parent.title, '') AS parent_title,
            wi.cycle_id AS cycle_id,
            COALESCE(cycle.name, '') AS cycle_name,
            COALESCE(cycle.start_date, '') AS cycle_start_date,
            COALESCE(cycle.end_date, '') AS cycle_end_date,
            COALESCE(assignee.username, '') AS assignee_username,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            wi.reporter_user_id AS reporter_user_id,
            COALESCE(reporter.username, '') AS reporter_username,
            COALESCE(NULLIF(wi.reporter_display_name_snapshot, ''), reporter.display_name, '') AS reporter_display_name,
            COALESCE(wi.due_date, '') AS due_date,
            wi.created_at,
            wi.updated_at,
            COALESCE(wi.deleted_at, '') AS deleted_at
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN work_items parent ON parent.id = wi.parent_work_item_id
        LEFT JOIN project_cycles cycle ON cycle.id = wi.cycle_id
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
        primary_post_comment_id: row.get("primary_post_comment_id"),
        status: row.get("status"),
        priority: row.get("priority"),
        project_key: row.get("project_key"),
        project_name: row.get("project_name"),
        parent_item_key: row.get("parent_item_key"),
        parent_title: row.get("parent_title"),
        cycle_id: row.get("cycle_id"),
        cycle_name: row.get("cycle_name"),
        cycle_start_date: row.get("cycle_start_date"),
        cycle_end_date: row.get("cycle_end_date"),
        assignee_username: row.get("assignee_username"),
        assignee_display_name: row.get("assignee_display_name"),
        reporter_user_id: row.get("reporter_user_id"),
        reporter_username: row.get("reporter_username"),
        reporter_display_name: row.get("reporter_display_name"),
        due_date: row.get("due_date"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        deleted_at: row.get("deleted_at"),
    }))
}

pub async fn list_work_item_operation_records_paginated(
    pool: &SqlitePool,
    work_item_id: i64,
    item_key: &str,
    pagination: Pagination,
) -> AppResult<Paginated<WorkItemOperationSummary>> {
    let body_prefix = format!("{WORK_ITEM_FLOW_COMMENT_PREFIX}%");
    let flow_total = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM work_item_comments c
        WHERE c.work_item_id = ?1
          AND c.deleted_at IS NULL
          AND c.is_draft = 0
          AND c.body LIKE ?2
        "#,
    )
    .bind(work_item_id)
    .bind(&body_prefix)
    .fetch_one(pool)
    .await?;
    let edit_total = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM project_activities pa
        WHERE pa.target_type = 'work_item'
          AND pa.target_id = ?1
          AND pa.action = 'work_item.updated'
        "#,
    )
    .bind(item_key)
    .fetch_one(pool)
    .await?;

    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        r#"
        SELECT
            source_kind,
            actor_display_name,
            created_at,
            body
        FROM (
            SELECT
                'flow' AS source_kind,
                c.id AS sort_id,
                COALESCE(NULLIF(c.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
                c.created_at AS created_at,
                c.body AS body
            FROM work_item_comments c
            LEFT JOIN users u ON u.id = c.author_user_id
            WHERE c.work_item_id = ?1
              AND c.deleted_at IS NULL
              AND c.is_draft = 0
              AND c.body LIKE ?2

            UNION ALL

            SELECT
                'edit' AS source_kind,
                pa.id AS sort_id,
                COALESCE(NULLIF(pa.actor_display_name_snapshot, ''), u.display_name, '') AS actor_display_name,
                pa.created_at AS created_at,
                '' AS body
            FROM project_activities pa
            LEFT JOIN users u ON u.id = pa.actor_user_id
            WHERE pa.target_type = 'work_item'
              AND pa.target_id = ?3
              AND pa.action = 'work_item.updated'
        ) records
        ORDER BY created_at DESC, sort_id DESC
        LIMIT ?4 OFFSET ?5
        "#,
    )
    .bind(work_item_id)
    .bind(&body_prefix)
    .bind(item_key)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    Ok(Paginated {
        items: rows
            .into_iter()
            .map(
                |(source_kind, actor_display_name, created_at, body)| WorkItemOperationSummary {
                    source_kind,
                    actor_display_name,
                    created_at,
                    body,
                },
            )
            .collect(),
        page: pagination.page,
        per_page: pagination.per_page,
        total_items: flow_total + edit_total,
    })
}

pub async fn update_work_item_status(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    status: &str,
) -> AppResult<WorkItemDetail> {
    let status = validate_work_item_status(status)?;
    let Some((
        work_item_id,
        project_id,
        project_status,
        current_status,
        assignee_user_id,
        assignee_display_name,
    )) = sqlx::query_as::<_, (i64, i64, String, String, Option<i64>, String)>(
        r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                wi.status,
                wi.assignee_user_id,
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
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    // 状态校验基于事务外读取的 current_status：带前置条件更新，状态已被并发修改时拒绝而非覆盖。
    let updated = sqlx::query(
        r#"
        UPDATE work_items
        SET status = ?2,
            completed_at = CASE
                WHEN ?2 IN ('done', 'closed', 'resolved', 'verified') THEN datetime('now')
                ELSE NULL
            END,
            updated_at = datetime('now')
        WHERE id = ?1
          AND status = ?3
          AND deleted_at IS NULL
        "#,
    )
    .bind(work_item_id)
    .bind(status)
    .bind(&current_status)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

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
    if let Some(assignee_user_id) = assignee_user_id {
        realtime::publish_topbar_refresh_for_user(assignee_user_id);
    }

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn close_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
) -> AppResult<WorkItemDetail> {
    update_work_item_status(pool, actor_user_id, item_key, "closed").await
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
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(&input.actor_display_name_snapshot);
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
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated = sqlx::query(
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
          AND status = ?4
          AND assignee_user_id IS ?5
          AND deleted_at IS NULL
        "#,
    )
    .bind(work_item_id)
    .bind(status)
    .bind(next_assignee_user_id)
    .bind(&current_status)
    .bind(current_assignee_user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

    let should_notify_assignment = current_assignee_user_id != next_assignee_user_id
        || input.source_comment_id.is_some()
        || !actor_display_name_snapshot.is_empty();
    if should_notify_assignment && let Some(recipient_user_id) = next_assignee_user_id {
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
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
            actor_display_name_snapshot,
            body
        )
        VALUES (?1, ?2, ?3, ?4)
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(encode_flow_comment_body(&flow_summary))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO project_activities (
            project_id,
            actor_user_id,
            actor_display_name_snapshot,
            action,
            target_type,
            target_id,
            summary,
            metadata
        )
        VALUES (?1, ?2, ?3, 'work_item.handoff', 'work_item', ?4, ?5, ?6)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(item_key)
    .bind(format!("推进工作项 {item_key}"))
    .bind(format!(
        r#"{{"status":"{status}","previous_status":"{current_status}","assignee_username":"{next_assignee_username}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    realtime::publish_topbar_refresh_for_users(
        [current_assignee_user_id, next_assignee_user_id]
            .into_iter()
            .flatten(),
    );

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
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(&input.actor_display_name_snapshot);

    let Some((
        work_item_id,
        project_id,
        project_status,
        item_type,
        current_status,
        current_assignee_user_id,
        reporter_user_id,
        current_cycle_id,
    )) = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            String,
            Option<i64>,
            Option<i64>,
            Option<i64>,
        ),
    >(
        r#"
        SELECT
            wi.id,
            wi.project_id,
            p.status,
            wi.item_type,
            wi.status,
            wi.assignee_user_id,
            wi.reporter_user_id,
            wi.cycle_id
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
    if !user_can_edit_work_item_post(reporter_user_id, actor_user_id) {
        return Err(AppError::Forbidden(
            "只有发布人本人可以编辑该工作项。".to_string(),
        ));
    }
    ensure_project_accepts_writes(&project_status)?;
    ensure_work_item_status_transition(&current_status, status)?;
    let parent_work_item_id =
        resolve_parent_work_item_id(pool, project_id, &item_type, parent_item_key).await?;

    let assignee_user_id = if assignee_username.is_empty() {
        None
    } else {
        Some(resolve_project_member_user_id(pool, project_id, assignee_username).await?)
    };
    let cycle = resolve_project_cycle(pool, project_id, input.cycle_id).await?;
    let cycle_id = cycle.as_ref().map(|(cycle_id, _)| *cycle_id);
    let cycle_name = cycle
        .as_ref()
        .map(|(_, name)| name.clone())
        .unwrap_or_default();
    let cycle_changed = current_cycle_id != cycle_id;

    let expected_updated_at = input.expected_updated_at.trim().to_string();
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated = sqlx::query(
        r#"
        UPDATE work_items
        SET title = ?2,
            description = ?3,
            status = ?4,
            priority = ?5,
            assignee_user_id = ?6,
            due_date = NULLIF(?7, ''),
            parent_work_item_id = ?8,
            cycle_id = ?9,
            completed_at = CASE
                WHEN ?4 IN ('done', 'closed', 'resolved', 'verified') THEN datetime('now')
                ELSE NULL
            END,
            updated_at = datetime('now')
        WHERE id = ?1
          AND deleted_at IS NULL
          AND (?10 = '' OR updated_at = ?10)
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
    .bind(cycle_id)
    .bind(&expected_updated_at)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

    if cycle_changed {
        let (cycle_action, cycle_summary) = if current_cycle_id.is_none() && cycle_id.is_some() {
            (
                "work_item.cycle.linked",
                format!("将工作项 {item_key} 关联到周期 {cycle_name}"),
            )
        } else if current_cycle_id.is_some() && cycle_id.is_none() {
            (
                "work_item.cycle.unlinked",
                format!("取消工作项 {item_key} 的周期关联"),
            )
        } else {
            (
                "work_item.cycle.updated",
                format!("调整工作项 {item_key} 的所属周期"),
            )
        };
        sqlx::query(
            r#"
            INSERT INTO project_activities (
                project_id,
                actor_user_id,
                actor_display_name_snapshot,
                action,
                target_type,
                target_id,
                summary,
                metadata
            )
            VALUES (?1, ?2, ?3, ?4, 'work_item', ?5, ?6, ?7)
            "#,
        )
        .bind(project_id)
        .bind(actor_user_id)
        .bind(&actor_display_name_snapshot)
        .bind(cycle_action)
        .bind(item_key)
        .bind(cycle_summary)
        .bind(format!(
            r#"{{"previous_cycle_id":{},"cycle_id":{},"cycle_name":"{}"}}"#,
            current_cycle_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "null".to_string()),
            cycle_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "null".to_string()),
            cycle_name.replace('"', "'"),
        ))
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO project_activities (
            project_id,
            actor_user_id,
            actor_display_name_snapshot,
            action,
            target_type,
            target_id,
            summary,
            metadata
        )
        VALUES (?1, ?2, ?3, 'work_item.updated', 'work_item', ?4, ?5, ?6)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(item_key)
    .bind(format!("更新工作项 {item_key}"))
    .bind(format!(
        r#"{{"status":"{status}","previous_status":"{current_status}","priority":"{priority}","assignee_username":"{assignee_username}","due_date":"{due_date}","parent_item_key":"{parent_item_key}"}}"#
    ))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    realtime::publish_topbar_refresh_for_users(
        [current_assignee_user_id, assignee_user_id]
            .into_iter()
            .flatten(),
    );

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn set_work_item_cycle(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    cycle_id: Option<i64>,
    actor_display_name_snapshot: &str,
) -> AppResult<WorkItemDetail> {
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(actor_display_name_snapshot);
    let Some((work_item_id, project_id, project_status, current_cycle_id, current_cycle_name)) =
        sqlx::query_as::<_, (i64, i64, String, Option<i64>, String)>(
            r#"
        SELECT
            wi.id,
            wi.project_id,
            p.status,
            wi.cycle_id,
            COALESCE(pc.name, '') AS current_cycle_name
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN project_cycles pc ON pc.id = wi.cycle_id
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

    let next_cycle = resolve_project_cycle(pool, project_id, cycle_id).await?;
    let next_cycle_id = next_cycle.as_ref().map(|(id, _)| *id);
    let next_cycle_name = next_cycle
        .as_ref()
        .map(|(_, name)| name.clone())
        .unwrap_or_default();
    if current_cycle_id == next_cycle_id {
        return get_work_item_detail(pool, item_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()));
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated = sqlx::query(
        r#"
        UPDATE work_items
        SET cycle_id = ?2,
            updated_at = datetime('now')
        WHERE id = ?1
          AND cycle_id IS ?3
          AND deleted_at IS NULL
        "#,
    )
    .bind(work_item_id)
    .bind(next_cycle_id)
    .bind(current_cycle_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

    let action = if current_cycle_id.is_none() && next_cycle_id.is_some() {
        "work_item.cycle.linked"
    } else if current_cycle_id.is_some() && next_cycle_id.is_none() {
        "work_item.cycle.unlinked"
    } else {
        "work_item.cycle.updated"
    };
    let summary = if current_cycle_id.is_none() && next_cycle_id.is_some() {
        format!("将工作项 {item_key} 关联到周期 {next_cycle_name}")
    } else if current_cycle_id.is_some() && next_cycle_id.is_none() {
        format!("取消工作项 {item_key} 的周期关联")
    } else {
        format!("调整工作项 {item_key} 的所属周期")
    };
    sqlx::query(
        r#"
        INSERT INTO project_activities (
            project_id,
            actor_user_id,
            actor_display_name_snapshot,
            action,
            target_type,
            target_id,
            summary,
            metadata
        )
        VALUES (?1, ?2, ?3, ?4, 'work_item', ?5, ?6, ?7)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(action)
    .bind(item_key)
    .bind(summary)
    .bind(format!(
        r#"{{"previous_cycle_id":{},"previous_cycle_name":"{}","cycle_id":{},"cycle_name":"{}"}}"#,
        current_cycle_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "null".to_string()),
        current_cycle_name.replace('"', "'"),
        next_cycle_id
            .map(|value| value.to_string())
            .unwrap_or_else(|| "null".to_string()),
        next_cycle_name.replace('"', "'"),
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
    let Some((work_item_id, project_id, project_status, deleted_at, assignee_user_id)) =
        sqlx::query_as::<_, (i64, i64, String, String, Option<i64>)>(
            r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                COALESCE(wi.deleted_at, '') AS deleted_at,
                wi.assignee_user_id
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

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated = sqlx::query(
        r#"
        UPDATE work_items
        SET deleted_at = datetime('now'),
            deleted_by_user_id = ?2,
            updated_at = datetime('now')
        WHERE id = ?1
          AND deleted_at IS NULL
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

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
    if let Some(assignee_user_id) = assignee_user_id {
        realtime::publish_topbar_refresh_for_user(assignee_user_id);
    }

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub async fn restore_work_item(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
) -> AppResult<WorkItemDetail> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let Some((work_item_id, project_id, project_status, deleted_at, assignee_user_id)) =
        sqlx::query_as::<_, (i64, i64, String, String, Option<i64>)>(
            r#"
            SELECT
                wi.id,
                wi.project_id,
                p.status,
                COALESCE(wi.deleted_at, '') AS deleted_at,
                wi.assignee_user_id
            FROM work_items wi
            JOIN projects p ON p.id = wi.project_id
            WHERE wi.item_key = ?1
            "#,
        )
        .bind(item_key)
        .fetch_optional(&mut *tx)
        .await?
    else {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    };
    ensure_project_accepts_writes(&project_status)?;
    if deleted_at.is_empty() {
        tx.rollback().await?;
        return get_work_item_detail(pool, item_key)
            .await?
            .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()));
    }

    let has_unavailable_attachment = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM file_attachments fa
            JOIN file_objects fo ON fo.id = fa.file_object_id
            WHERE fa.target_type = 'work_item'
              AND fa.target_id = ?1
              AND (
                  fo.status = 'deleted'
                  OR EXISTS (
                      SELECT 1
                      FROM file_object_deletion_jobs j
                      WHERE j.file_object_id = fo.id
                        AND j.status <> 'completed'
                  )
              )
        )
        "#,
    )
    .bind(work_item_id)
    .fetch_one(&mut *tx)
    .await?;
    if has_unavailable_attachment {
        return Err(AppError::Conflict(
            "工作项关联的附件已进入删除流程，不能恢复该工作项".to_string(),
        ));
    }

    let updated = sqlx::query(
        r#"
        UPDATE work_items
        SET deleted_at = NULL,
            deleted_by_user_id = NULL,
            updated_at = datetime('now')
        WHERE id = ?1
          AND deleted_at IS NOT NULL
        "#,
    )
    .bind(work_item_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    ensure_work_item_unchanged(updated)?;

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
    if let Some(assignee_user_id) = assignee_user_id {
        realtime::publish_topbar_refresh_for_user(assignee_user_id);
    }

    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub(super) fn normalize_work_item_filter(
    filter: WorkItemListFilter,
) -> AppResult<NormalizedWorkItemFilter> {
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
    let cycle_id = match filter.cycle_id.trim() {
        "" => None,
        value => Some(
            value
                .parse::<i64>()
                .map_err(|_| AppError::BadRequest("周期不能为空且必须是数字".to_string()))
                .and_then(|parsed| {
                    if parsed <= 0 {
                        Err(AppError::BadRequest("周期不能为空且必须是数字".to_string()))
                    } else {
                        Ok(parsed)
                    }
                })?,
        ),
    };
    let sort_by = validate_work_item_sort(&filter.sort_by)?.to_string();

    Ok(NormalizedWorkItemFilter {
        item_type,
        keyword,
        keyword_like,
        status,
        priority,
        project_key,
        assignee_username,
        cycle_id,
        sort_by,
    })
}

pub(super) async fn count_work_item_summaries_filtered(
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
          AND (?7 IS NULL OR wi.cycle_id = ?7)
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(normalized.cycle_id)
    .fetch_one(pool)
    .await?)
}

pub(super) async fn work_item_list_stats_filtered(
    pool: &SqlitePool,
    filter: WorkItemListFilter,
) -> AppResult<WorkItemListStats> {
    let normalized = normalize_work_item_filter(filter)?;
    let row = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        r#"
        SELECT
            COUNT(*) AS total_items,
            COALESCE(SUM(CASE WHEN wi.status NOT IN ('done', 'closed', 'resolved', 'verified', 'cancelled') THEN 1 ELSE 0 END), 0) AS active_items,
            COALESCE(SUM(CASE WHEN wi.priority IN ('P0', 'P1') THEN 1 ELSE 0 END), 0) AS high_priority_items,
            COALESCE(SUM(CASE WHEN wi.status IN ('done', 'verified') THEN 1 ELSE 0 END), 0) AS completed_items
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
          AND (?7 IS NULL OR wi.cycle_id = ?7)
          AND wi.deleted_at IS NULL
        "#,
    )
    .bind(&normalized.item_type)
    .bind(&normalized.keyword_like)
    .bind(&normalized.status)
    .bind(&normalized.priority)
    .bind(&normalized.project_key)
    .bind(&normalized.assignee_username)
    .bind(normalized.cycle_id)
    .fetch_one(pool)
    .await?;

    Ok(WorkItemListStats {
        total_items: row.0,
        active_items: row.1,
        high_priority_items: row.2,
        completed_items: row.3,
    })
}

pub(super) async fn count_work_item_summaries_filtered_for_user(
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
          AND (?8 IS NULL OR wi.cycle_id = ?8)
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
    .bind(normalized.cycle_id)
    .fetch_one(pool)
    .await?)
}

pub(super) fn work_item_sort_order_sql(sort_by: &str) -> &'static str {
    match sort_by {
        WORK_ITEM_SORT_CREATED_DESC => "wi.created_at DESC, wi.id DESC",
        WORK_ITEM_SORT_PRIORITY_DESC => {
            "CASE wi.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END ASC, wi.updated_at DESC, wi.id DESC"
        }
        WORK_ITEM_SORT_DUE_DATE_ASC => {
            "CASE WHEN wi.due_date IS NULL OR wi.due_date = '' THEN 1 ELSE 0 END ASC, wi.due_date ASC, wi.updated_at DESC, wi.id DESC"
        }
        _ => "wi.updated_at DESC, wi.id DESC",
    }
}

pub(super) fn validate_work_item_sort(sort_by: &str) -> AppResult<&'static str> {
    match sort_by.trim() {
        "" | WORK_ITEM_SORT_UPDATED_DESC => Ok(WORK_ITEM_SORT_UPDATED_DESC),
        WORK_ITEM_SORT_CREATED_DESC => Ok(WORK_ITEM_SORT_CREATED_DESC),
        WORK_ITEM_SORT_PRIORITY_DESC => Ok(WORK_ITEM_SORT_PRIORITY_DESC),
        WORK_ITEM_SORT_DUE_DATE_ASC => Ok(WORK_ITEM_SORT_DUE_DATE_ASC),
        _ => Err(AppError::BadRequest("工作项排序方式不合法".to_string())),
    }
}

pub(super) async fn resolve_work_item_saved_view_scope(
    pool: &SqlitePool,
    user_id: i64,
    is_super_admin: bool,
    project_key: &str,
    item_type: &str,
) -> AppResult<WorkItemSavedViewScope> {
    let project_key = validate_project_key(project_key)?;
    let item_type = validate_work_item_type(item_type)?.to_string();
    let project = get_project_detail(pool, &project_key)
        .await?
        .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;
    if !is_super_admin && !is_project_member(pool, project.id, user_id).await? {
        return Err(AppError::Forbidden("无权访问该项目".to_string()));
    }
    Ok(WorkItemSavedViewScope {
        project_id: project.id,
        project_key: project.project_key,
        item_type,
    })
}

pub(super) fn canonicalize_work_item_saved_view_filter(
    project_key: &str,
    item_type: &str,
    mut filter: WorkItemListFilter,
) -> AppResult<WorkItemListFilter> {
    filter.project_key = project_key.to_string();
    filter.item_type = Some(item_type.to_string());
    let normalized = normalize_work_item_filter(filter)?;
    Ok(WorkItemListFilter {
        item_type: (!normalized.item_type.is_empty()).then_some(normalized.item_type),
        keyword: normalized.keyword,
        status: normalized.status,
        priority: normalized.priority,
        project_key: normalized.project_key,
        assignee_username: normalized.assignee_username,
        cycle_id: normalized
            .cycle_id
            .map(|value| value.to_string())
            .unwrap_or_default(),
        sort_by: normalized.sort_by,
    })
}

pub(super) async fn ensure_work_item_saved_view_cycle_in_scope(
    pool: &SqlitePool,
    project_id: i64,
    cycle_id: &str,
) -> AppResult<()> {
    let Some(cycle_id) = parse_saved_view_cycle_id(cycle_id)? else {
        return Ok(());
    };
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_cycles WHERE id = ?1 AND project_id = ?2",
    )
    .bind(cycle_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;
    if count == 0 {
        return Err(AppError::BadRequest(
            "周期不存在或不属于当前项目".to_string(),
        ));
    }
    Ok(())
}

pub(super) async fn clear_default_work_item_saved_views(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    user_id: i64,
    project_id: i64,
    item_type: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE work_item_saved_views
        SET is_default = 0,
            updated_at = datetime('now')
        WHERE user_id = ?1
          AND project_id = ?2
          AND item_type = ?3
        "#,
    )
    .bind(user_id)
    .bind(project_id)
    .bind(item_type)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(super) async fn get_work_item_saved_view_by_id(
    pool: &SqlitePool,
    user_id: i64,
    saved_view_id: i64,
) -> AppResult<Option<WorkItemSavedView>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            String,
            String,
            String,
            String,
            Option<i64>,
            String,
            String,
            i64,
            i64,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            wsv.id,
            wsv.project_id,
            p.project_key,
            wsv.item_type,
            wsv.name,
            wsv.keyword,
            wsv.status,
            wsv.priority,
            wsv.cycle_id,
            wsv.assignee_username,
            wsv.sort_by,
            wsv.per_page,
            wsv.is_default,
            wsv.created_at,
            wsv.updated_at
        FROM work_item_saved_views wsv
        JOIN projects p ON p.id = wsv.project_id
        WHERE wsv.id = ?1
          AND wsv.user_id = ?2
        "#,
    )
    .bind(saved_view_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let Some((
        id,
        project_id,
        project_key,
        item_type,
        name,
        keyword,
        status,
        priority,
        cycle_id,
        assignee_username,
        sort_by,
        per_page,
        is_default,
        created_at,
        updated_at,
    )) = row
    else {
        return Ok(None);
    };
    let cycle_name = match cycle_id {
        Some(cycle_id) => {
            sqlx::query_scalar::<_, String>("SELECT name FROM project_cycles WHERE id = ?1")
                .bind(cycle_id)
                .fetch_optional(pool)
                .await?
                .unwrap_or_default()
        }
        None => String::new(),
    };

    Ok(Some(WorkItemSavedView {
        id,
        project_id,
        project_key: project_key.clone(),
        item_type: item_type.clone(),
        name,
        filter: WorkItemListFilter {
            item_type: Some(item_type),
            keyword,
            status,
            priority,
            project_key,
            assignee_username,
            cycle_id: cycle_id.map(|value| value.to_string()).unwrap_or_default(),
            sort_by,
        },
        per_page,
        is_default: is_default != 0,
        cycle_name,
        created_at,
        updated_at,
    }))
}

pub(super) fn map_work_item_saved_view_write_error(error: sqlx::Error, name: &str) -> AppError {
    let message = error.to_string();
    if message.contains("UNIQUE constraint failed") {
        return AppError::BadRequest(format!("保存视图“{name}”已存在，请更换名称"));
    }
    AppError::Database(error)
}

pub fn work_item_description_html_for_display(description: &str, item_key: &str) -> String {
    if !looks_like_rich_work_item_description(description) {
        return plain_text_to_html(description);
    }

    sanitize_work_item_description_html(description, item_key)
}

pub fn work_item_description_summary(description: &str) -> String {
    let body_format = if looks_like_rich_work_item_description(description) {
        COMMENT_BODY_FORMAT_HTML
    } else {
        COMMENT_BODY_FORMAT_PLAIN
    };
    work_item_primary_post_summary(description, body_format)
}

pub(super) fn sanitize_work_item_description_html(body: &str, item_key: &str) -> String {
    let item_key = item_key.to_string();
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
            "span",
            "video",
        ])
        .add_tag_attributes("img", &["src", "alt", "title", "loading"])
        .add_tag_attributes("video", &["src", "controls", "preload", "playsinline"])
        .add_tag_attributes("a", &["href", "title"])
        .add_tag_attributes("span", &["style"])
        .add_generic_attributes(&[
            "data-yuance-attachment-id",
            "data-yuance-attachment-kind",
            "data-yuance-align",
            "data-yuance-file-kind",
            "data-yuance-file-ext",
            "data-yuance-mention-display-name",
            "data-yuance-mention-username",
        ])
        .filter_style_properties(std::collections::HashSet::from(["color", "font-size"]))
        .attribute_filter(
            move |element, attribute, value| match (element, attribute) {
                ("img", "src") | ("source", "src") | ("video", "src")
                    if !comment_attachment_url_like(value)
                        && !work_item_attachment_url_like(value, &item_key) =>
                {
                    None
                }
                _ => Some(Cow::Borrowed(value)),
            },
        )
        .clean(body)
        .to_string()
}

pub(super) fn looks_like_rich_work_item_description(description: &str) -> bool {
    let lower = description.trim().to_ascii_lowercase();
    [
        "<blockquote",
        "<code",
        "<del",
        "<p",
        "<br",
        "<h1",
        "<h2",
        "<h3",
        "<h4",
        "<h5",
        "<h6",
        "<hr",
        "<ul",
        "<ol",
        "<li",
        "<pre",
        "<figure",
        "<figcaption",
        "<img",
        "<video",
        "<table",
        "<thead",
        "<tbody",
        "<tr",
        "<th",
        "<td",
        "<strong",
        "<em",
        "<a ",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

pub(super) fn work_item_attachment_url_like(value: &str, item_key: &str) -> bool {
    let value = value.trim();
    let path = value.split('?').next().unwrap_or(value);
    path.starts_with(&format!("/web/work-items/{item_key}/attachments/"))
        && path.ends_with("/download")
}

pub(super) fn work_item_status_label(status: &str) -> &'static str {
    match status {
        "open" => "待处理",
        "in_progress" => "进行中",
        "pending_confirmation" => "待确认",
        "done" => "已完成",
        "resolved" => "已解决",
        "verified" => "已验证",
        "closed" => "已关闭",
        "cancelled" => "已取消",
        _ => "未知",
    }
}

pub(super) fn work_item_priority_label(priority: &str) -> &'static str {
    match priority {
        "P0" => "紧急",
        "P1" => "高",
        "P2" => "中",
        "P3" => "低",
        _ => "未知",
    }
}

pub(super) fn work_item_type_label(item_type: &str) -> &'static str {
    match item_type {
        "requirement" => "需求",
        "task" => "任务",
        "bug" => "Bug",
        _ => "工作项",
    }
}

pub(super) fn work_item_cycle_label(cycle_name: &str) -> &str {
    let cycle_name = cycle_name.trim();
    if cycle_name.is_empty() {
        "未关联"
    } else {
        cycle_name
    }
}

pub(super) fn format_work_item_flow_summary(
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

pub(crate) fn validate_work_item_type(item_type: &str) -> AppResult<&'static str> {
    match item_type.trim() {
        "requirement" => Ok("requirement"),
        "task" => Ok("task"),
        "bug" => Ok("bug"),
        _ => Err(AppError::BadRequest(
            "工作项类型只能是 requirement / task / bug".to_string(),
        )),
    }
}

pub(super) async fn resolve_parent_work_item_id(
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

pub(super) fn validate_work_item_key_ref(item_key: &str) -> AppResult<String> {
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

pub(super) fn validate_work_item_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "open" => Ok("open"),
        "in_progress" => Ok("in_progress"),
        "pending_confirmation" => Ok("pending_confirmation"),
        "done" => Ok("done"),
        "verified" => Ok("verified"),
        "resolved" => Ok("resolved"),
        "closed" => Ok("closed"),
        "cancelled" => Ok("cancelled"),
        _ => Err(AppError::BadRequest(
            "工作项状态只能是 open / in_progress / pending_confirmation / done / verified / resolved / closed / cancelled"
                .to_string(),
        )),
    }
}

pub fn normalize_work_item_status(status: &str) -> AppResult<&'static str> {
    validate_work_item_status(status)
}

pub(super) fn ensure_work_item_status_supported_for_type(
    item_type: &str,
    status: &str,
) -> AppResult<()> {
    let item_type = validate_work_item_type(item_type)?;
    let status = validate_work_item_status(status)?;
    let allowed = match item_type {
        "bug" => matches!(
            status,
            "open" | "in_progress" | "pending_confirmation" | "resolved" | "verified" | "closed"
        ),
        "requirement" | "task" => matches!(
            status,
            "open" | "in_progress" | "pending_confirmation" | "done" | "closed"
        ),
        _ => false,
    };
    if allowed {
        return Ok(());
    }

    Err(AppError::BadRequest(format!(
        "{} 不支持状态 {}",
        work_item_type_label(item_type),
        work_item_status_label(status)
    )))
}

pub fn allowed_work_item_status_transitions(
    current_status: &str,
) -> AppResult<&'static [&'static str]> {
    match validate_work_item_status(current_status)? {
        "open" => Ok(&["in_progress", "pending_confirmation", "closed"]),
        "in_progress" => Ok(&["open", "pending_confirmation", "done", "resolved", "closed"]),
        "pending_confirmation" => Ok(&["in_progress", "done", "resolved", "verified", "closed"]),
        "done" => Ok(&["in_progress", "verified", "closed"]),
        "resolved" => Ok(&["in_progress", "verified", "closed"]),
        "verified" => Ok(&["in_progress", "closed"]),
        "closed" | "cancelled" => Ok(&["in_progress"]),
        _ => unreachable!("validated work item status should be exhaustive"),
    }
}

/// 带前置条件的工作项更新未命中任何行：说明读取后已被他人修改（或已删除），返回 409 让调用方刷新重试。
pub(super) fn ensure_work_item_unchanged(rows_affected: u64) -> AppResult<()> {
    if rows_affected == 0 {
        return Err(AppError::Conflict(
            "工作项已被其他人修改，请刷新后重试".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn ensure_work_item_status_transition(
    current_status: &str,
    next_status: &str,
) -> AppResult<()> {
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

pub(super) fn work_item_key_segment(item_type: &str) -> &'static str {
    match item_type {
        "requirement" => "REQ",
        "task" => "TASK",
        "bug" => "BUG",
        _ => "ITEM",
    }
}

pub(super) async fn seed_demo_work_items(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
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
