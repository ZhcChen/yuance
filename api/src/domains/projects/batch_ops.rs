//! 工作项批量操作领域：批量指派、流转、优先级与周期调整。

use super::*;

pub async fn batch_update_work_items(
    pool: &SqlitePool,
    actor_user_id: i64,
    input: BatchUpdateWorkItemsInput,
) -> AppResult<BatchUpdateWorkItemsResult> {
    let project_key = validate_project_key(&input.project_key)?;
    let item_type = validate_work_item_type(&input.item_type)?.to_string();
    let action = validate_work_item_batch_action(&input.action)?.to_string();
    let item_keys = normalize_batch_work_item_keys(input.item_keys)?;
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(&input.actor_display_name_snapshot);
    let Some(project) = get_project_detail(pool, &project_key).await? else {
        return Err(AppError::NotFound("项目不存在".to_string()));
    };
    ensure_project_accepts_writes(&project.status)?;

    let mut query = sqlx::QueryBuilder::<Sqlite>::new(
        r#"
        SELECT
            wi.id,
            wi.item_key,
            wi.item_type,
            wi.project_id,
            p.project_key,
            p.status,
            wi.title,
            wi.status,
            wi.priority,
            wi.assignee_user_id,
            COALESCE(assignee.username, '') AS assignee_username,
            COALESCE(assignee.display_name, '') AS assignee_display_name,
            wi.cycle_id,
            COALESCE(pc.name, '') AS cycle_name
        FROM work_items wi
        JOIN projects p ON p.id = wi.project_id
        LEFT JOIN users assignee ON assignee.id = wi.assignee_user_id
        LEFT JOIN project_cycles pc ON pc.id = wi.cycle_id
        WHERE wi.deleted_at IS NULL
          AND wi.item_key IN (
        "#,
    );
    {
        let mut separated = query.separated(", ");
        for item_key in &item_keys {
            separated.push_bind(item_key);
        }
        separated.push_unseparated(")");
    }
    let rows = query
        .build_query_as::<(
            i64,
            String,
            String,
            i64,
            String,
            String,
            String,
            String,
            String,
            Option<i64>,
            String,
            String,
            Option<i64>,
            String,
        )>()
        .fetch_all(pool)
        .await?;
    if rows.len() != item_keys.len() {
        let missing = item_keys
            .iter()
            .filter(|item_key| {
                !rows
                    .iter()
                    .any(|(_, row_key, ..)| row_key.eq_ignore_ascii_case(item_key))
            })
            .cloned()
            .collect::<Vec<_>>();
        return Err(AppError::BadRequest(format!(
            "以下工作项不存在或不可批量处理：{}",
            missing.join("、")
        )));
    }

    #[derive(Debug, Clone)]
    struct BatchWorkItemRow {
        id: i64,
        item_key: String,
        item_type: String,
        project_id: i64,
        project_key: String,
        project_status: String,
        title: String,
        status: String,
        priority: String,
        assignee_user_id: Option<i64>,
        assignee_username: String,
        assignee_display_name: String,
        cycle_id: Option<i64>,
        cycle_name: String,
    }

    let items = rows
        .into_iter()
        .map(
            |(
                id,
                item_key,
                item_type,
                project_id,
                project_key,
                project_status,
                title,
                status,
                priority,
                assignee_user_id,
                assignee_username,
                assignee_display_name,
                cycle_id,
                cycle_name,
            )| BatchWorkItemRow {
                id,
                item_key,
                item_type,
                project_id,
                project_key,
                project_status,
                title,
                status,
                priority,
                assignee_user_id,
                assignee_username,
                assignee_display_name,
                cycle_id,
                cycle_name,
            },
        )
        .collect::<Vec<_>>();

    for item in &items {
        if item.project_id != project.id || item.project_key != project_key {
            return Err(AppError::BadRequest(format!(
                "工作项 {} 不属于当前项目 {}",
                item.item_key, project_key
            )));
        }
        if item.item_type != item_type {
            return Err(AppError::BadRequest(format!(
                "工作项 {} 不属于当前列表类型",
                item.item_key
            )));
        }
        ensure_project_accepts_writes(&item.project_status)?;
    }

    enum BatchActionTarget {
        Assignee {
            assignee_user_id: i64,
            assignee_username: String,
            assignee_display_name: String,
        },
        Status {
            status: String,
        },
        Priority {
            priority: String,
        },
        Cycle {
            cycle_id: Option<i64>,
            cycle_name: String,
        },
    }

    let target = match action.as_str() {
        "assignee" => {
            let assignee_user_id =
                resolve_project_member_user_id(pool, project.id, &input.assignee_username).await?;
            let (assignee_username, assignee_display_name) = sqlx::query_as::<_, (String, String)>(
                r#"
                    SELECT u.username, u.display_name
                    FROM users u
                    WHERE u.id = ?1
                    "#,
            )
            .bind(assignee_user_id)
            .fetch_one(pool)
            .await?;
            for item in &items {
                if item.assignee_user_id == Some(assignee_user_id) {
                    return Err(AppError::BadRequest(format!(
                        "工作项 {} 已指派给 {}",
                        item.item_key, assignee_display_name
                    )));
                }
            }
            BatchActionTarget::Assignee {
                assignee_user_id,
                assignee_username,
                assignee_display_name,
            }
        }
        "status" => {
            let status = validate_work_item_status(&input.status)?.to_string();
            ensure_work_item_status_supported_for_type(&item_type, &status)?;
            for item in &items {
                if item.status == status {
                    return Err(AppError::BadRequest(format!(
                        "工作项 {} 已经是 {}",
                        item.item_key,
                        work_item_status_label(&status)
                    )));
                }
                ensure_work_item_status_transition(&item.status, &status)?;
            }
            BatchActionTarget::Status { status }
        }
        "priority" => {
            let priority = validate_priority(&input.priority)?.to_string();
            for item in &items {
                if item.priority == priority {
                    return Err(AppError::BadRequest(format!(
                        "工作项 {} 已经是优先级 {}",
                        item.item_key,
                        work_item_priority_label(&priority)
                    )));
                }
            }
            BatchActionTarget::Priority { priority }
        }
        "cycle" => {
            let target_cycle = resolve_project_cycle(pool, project.id, input.cycle_id).await?;
            let cycle_id = target_cycle.as_ref().map(|(cycle_id, _)| *cycle_id);
            let cycle_name = target_cycle
                .as_ref()
                .map(|(_, cycle_name)| cycle_name.clone())
                .unwrap_or_default();
            for item in &items {
                if item.cycle_id == cycle_id {
                    return Err(AppError::BadRequest(format!(
                        "工作项 {} 的周期未发生变化",
                        item.item_key
                    )));
                }
            }
            BatchActionTarget::Cycle {
                cycle_id,
                cycle_name,
            }
        }
        _ => unreachable!("validated batch action should be exhaustive"),
    };

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut refresh_user_ids = Vec::new();
    for item in &items {
        match &target {
            BatchActionTarget::Assignee {
                assignee_user_id,
                assignee_username,
                assignee_display_name,
            } => {
                let updated = sqlx::query(
                    r#"
                    UPDATE work_items
                    SET assignee_user_id = ?2,
                        updated_at = datetime('now')
                    WHERE id = ?1
                      AND assignee_user_id IS ?3
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(item.id)
                .bind(assignee_user_id)
                .bind(item.assignee_user_id)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                ensure_work_item_unchanged(updated)?;

                let flow_summary = format_work_item_flow_summary(
                    &item.status,
                    &item.status,
                    &item.assignee_display_name,
                    assignee_display_name,
                    "",
                );
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
                .bind(item.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(encode_flow_comment_body(&flow_summary))
                .execute(&mut *tx)
                .await?;

                notifications::create_in_transaction(
                    &mut tx,
                    CreateNotification {
                        recipient_user_id: *assignee_user_id,
                        actor_user_id,
                        actor_display_name_snapshot: &actor_display_name_snapshot,
                        kind: "work_item_assigned",
                        work_item_id: item.id,
                        comment_id: None,
                        title: &format!("你被批量指派处理 {}", item.item_key),
                        body: &item.title,
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
                        summary,
                        metadata
                    )
                    VALUES (?1, ?2, ?3, 'work_item.handoff', 'work_item', ?4, ?5, ?6)
                    "#,
                )
                .bind(project.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(&item.item_key)
                .bind(format!("批量指派工作项 {}", item.item_key))
                .bind(format!(
                    r#"{{"status":"{}","previous_status":"{}","assignee_username":"{}","previous_assignee_username":"{}"}}"#,
                    item.status,
                    item.status,
                    assignee_username,
                    item.assignee_username
                ))
                .execute(&mut *tx)
                .await?;

                if let Some(current_assignee_user_id) = item.assignee_user_id {
                    refresh_user_ids.push(current_assignee_user_id);
                }
                refresh_user_ids.push(*assignee_user_id);
            }
            BatchActionTarget::Status { status } => {
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
                .bind(item.id)
                .bind(status)
                .bind(&item.status)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                ensure_work_item_unchanged(updated)?;

                let flow_summary = format_work_item_flow_summary(
                    &item.status,
                    status,
                    &item.assignee_display_name,
                    &item.assignee_display_name,
                    "",
                );
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
                .bind(item.id)
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
                    VALUES (?1, ?2, ?3, 'work_item.status.updated', 'work_item', ?4, ?5, ?6)
                    "#,
                )
                .bind(project.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(&item.item_key)
                .bind(format!("批量更新工作项 {} 状态", item.item_key))
                .bind(format!(
                    r#"{{"status":"{}","previous_status":"{}"}}"#,
                    status, item.status
                ))
                .execute(&mut *tx)
                .await?;

                if let Some(assignee_user_id) = item.assignee_user_id {
                    refresh_user_ids.push(assignee_user_id);
                }
            }
            BatchActionTarget::Priority { priority } => {
                let updated = sqlx::query(
                    r#"
                    UPDATE work_items
                    SET priority = ?2,
                        updated_at = datetime('now')
                    WHERE id = ?1
                      AND priority = ?3
                      AND deleted_at IS NULL
                    "#,
                )
                .bind(item.id)
                .bind(priority)
                .bind(&item.priority)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                ensure_work_item_unchanged(updated)?;

                let flow_summary = format!(
                    "优先级：{} → {}",
                    work_item_priority_label(&item.priority),
                    work_item_priority_label(priority)
                );
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
                .bind(item.id)
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
                    VALUES (?1, ?2, ?3, 'work_item.priority.updated', 'work_item', ?4, ?5, ?6)
                    "#,
                )
                .bind(project.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(&item.item_key)
                .bind(format!("批量更新工作项 {} 优先级", item.item_key))
                .bind(format!(
                    r#"{{"priority":"{}","previous_priority":"{}"}}"#,
                    priority, item.priority
                ))
                .execute(&mut *tx)
                .await?;
            }
            BatchActionTarget::Cycle {
                cycle_id,
                cycle_name,
            } => {
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
                .bind(item.id)
                .bind(cycle_id)
                .bind(item.cycle_id)
                .execute(&mut *tx)
                .await?
                .rows_affected();
                ensure_work_item_unchanged(updated)?;

                let previous_cycle_label = work_item_cycle_label(&item.cycle_name);
                let next_cycle_label = work_item_cycle_label(cycle_name);
                let flow_summary = format!("周期：{previous_cycle_label} → {next_cycle_label}");
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
                .bind(item.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(encode_flow_comment_body(&flow_summary))
                .execute(&mut *tx)
                .await?;

                let (activity_action, activity_summary) =
                    if item.cycle_id.is_none() && cycle_id.is_some() {
                        (
                            "work_item.cycle.linked",
                            format!("批量将工作项 {} 关联到周期 {}", item.item_key, cycle_name),
                        )
                    } else if item.cycle_id.is_some() && cycle_id.is_none() {
                        (
                            "work_item.cycle.unlinked",
                            format!("批量取消工作项 {} 的周期关联", item.item_key),
                        )
                    } else {
                        (
                            "work_item.cycle.updated",
                            format!("批量调整工作项 {} 的所属周期", item.item_key),
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
                .bind(project.id)
                .bind(actor_user_id)
                .bind(&actor_display_name_snapshot)
                .bind(activity_action)
                .bind(&item.item_key)
                .bind(activity_summary)
                .bind(format!(
                    r#"{{"previous_cycle_id":{},"previous_cycle_name":"{}","cycle_id":{},"cycle_name":"{}"}}"#,
                    item.cycle_id
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "null".to_string()),
                    item.cycle_name.replace('"', "'"),
                    cycle_id
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "null".to_string()),
                    cycle_name.replace('"', "'"),
                ))
                .execute(&mut *tx)
                .await?;
            }
        }
    }
    tx.commit().await?;

    refresh_user_ids.sort_unstable();
    refresh_user_ids.dedup();
    realtime::publish_topbar_refresh_for_users(refresh_user_ids);

    Ok(BatchUpdateWorkItemsResult {
        project_id: project.id,
        project_key,
        item_type,
        action,
        updated_count: item_keys.len(),
        item_keys,
    })
}

pub(super) fn validate_work_item_batch_action(action: &str) -> AppResult<&'static str> {
    match action.trim() {
        "assignee" => Ok("assignee"),
        "status" => Ok("status"),
        "priority" => Ok("priority"),
        "cycle" => Ok("cycle"),
        _ => Err(AppError::BadRequest(
            "批量操作类型只能是 assignee / status / priority / cycle".to_string(),
        )),
    }
}

pub(super) fn normalize_batch_work_item_keys(item_keys: Vec<String>) -> AppResult<Vec<String>> {
    let mut normalized = Vec::new();
    for item_key in item_keys {
        let item_key = validate_work_item_key_ref(&item_key)?;
        if !normalized.contains(&item_key) {
            normalized.push(item_key);
        }
    }
    if normalized.is_empty() {
        return Err(AppError::BadRequest("请至少选择一个工作项".to_string()));
    }
    if normalized.len() > 100 {
        return Err(AppError::BadRequest(
            "单次最多只能批量操作 100 个工作项".to_string(),
        ));
    }
    Ok(normalized)
}
