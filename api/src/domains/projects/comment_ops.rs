//! 工作项讨论领域：评论、回复、草稿与主内容（正文）发布。

use super::*;

pub async fn user_can_manage_work_item_comment(
    pool: &SqlitePool,
    _project_id: i64,
    comment_author_user_id: Option<i64>,
    user_id: i64,
    _is_super_admin: bool,
) -> AppResult<bool> {
    let _ = pool;
    Ok(comment_author_user_id == Some(user_id))
}

pub async fn list_work_item_comments(
    pool: &SqlitePool,
    work_item_id: i64,
) -> AppResult<Vec<WorkItemCommentSummary>> {
    let rows = sqlx::query_as::<_, WorkItemCommentRow>(
        r#"
        SELECT
            c.id,
            c.body,
            c.body_format,
            c.is_draft,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(NULLIF(c.actor_display_name_snapshot, ''), u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(NULLIF(parent.actor_display_name_snapshot, ''), parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.work_item_id = ?1
          AND c.deleted_at IS NULL
          AND c.is_draft = 0
        ORDER BY c.created_at ASC, c.id ASC
        "#,
    )
    .bind(work_item_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(work_item_comment_summary_from_row)
        .collect())
}

pub async fn list_work_item_flow_comments_paginated(
    pool: &SqlitePool,
    work_item_id: i64,
    pagination: Pagination,
) -> AppResult<Paginated<WorkItemCommentSummary>> {
    let body_prefix = format!("{WORK_ITEM_FLOW_COMMENT_PREFIX}%");
    let total_items = sqlx::query_scalar::<_, i64>(
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

    let rows = sqlx::query_as::<_, WorkItemCommentRow>(
        r#"
        SELECT
            c.id,
            c.body,
            c.body_format,
            c.is_draft,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(NULLIF(c.actor_display_name_snapshot, ''), u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(NULLIF(parent.actor_display_name_snapshot, ''), parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.work_item_id = ?1
          AND c.deleted_at IS NULL
          AND c.is_draft = 0
          AND c.body LIKE ?2
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ?3 OFFSET ?4
        "#,
    )
    .bind(work_item_id)
    .bind(&body_prefix)
    .bind(pagination.per_page)
    .bind(pagination.offset())
    .fetch_all(pool)
    .await?;

    Ok(Paginated {
        items: rows
            .into_iter()
            .map(work_item_comment_summary_from_row)
            .collect(),
        page: pagination.page,
        per_page: pagination.per_page,
        total_items,
    })
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
    add_work_item_comment_reply_with_format(
        pool,
        actor_user_id,
        item_key,
        body,
        COMMENT_BODY_FORMAT_PLAIN,
        parent_comment_id,
    )
    .await
}

pub async fn add_work_item_comment_reply_with_format(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    body: &str,
    body_format: &str,
    parent_comment_id: Option<i64>,
) -> AppResult<WorkItemCommentSummary> {
    add_work_item_comment_reply_with_format_and_actor(
        pool,
        actor_user_id,
        item_key,
        body,
        body_format,
        parent_comment_id,
        "",
    )
    .await
}

pub async fn add_work_item_comment_reply_with_format_and_actor(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    body: &str,
    body_format: &str,
    parent_comment_id: Option<i64>,
    actor_display_name_snapshot: &str,
) -> AppResult<WorkItemCommentSummary> {
    let prepared = prepare_work_item_comment_body(body, body_format, "评论")?;
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(actor_display_name_snapshot);
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
    let mention_usernames =
        extract_comment_mention_usernames(&prepared.body, &prepared.body_format)?;
    let mention_targets =
        resolve_project_mention_targets(pool, project_id, &mention_usernames).await?;
    let mention_target_user_ids = mention_targets
        .iter()
        .map(|target| target.user_id)
        .collect::<HashSet<_>>();

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let comment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            actor_display_name_snapshot,
            body,
            body_format,
            parent_comment_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        RETURNING id
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(&prepared.body)
    .bind(&prepared.body_format)
    .bind(parent_comment_id)
    .fetch_one(&mut *tx)
    .await?;

    ensure_comment_body_attachment_references(pool, comment_id, &prepared.body).await?;

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

    if let Some(recipient_user_id) = reply_recipient
        && !mention_target_user_ids.contains(&recipient_user_id)
    {
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
                kind: "comment_replied",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 的内容收到回复"),
                body: &prepared.plain_text,
            },
        )
        .await?;
    }

    for target in &mention_targets {
        if target.user_id == actor_user_id {
            continue;
        }
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id: target.user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
                kind: "comment_mentioned",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 中被提及"),
                body: &prepared.plain_text,
            },
        )
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
            summary
        )
        VALUES (?1, ?2, ?3, 'work_item.commented', 'work_item', ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(item_key)
    .bind(format!("评论工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    if let Some(recipient_user_id) = reply_recipient
        && !mention_target_user_ids.contains(&recipient_user_id)
    {
        realtime::publish_topbar_refresh_for_user(recipient_user_id);
    }
    for target in &mention_targets {
        if target.user_id != actor_user_id {
            realtime::publish_topbar_refresh_for_user(target.user_id);
        }
    }
    realtime::publish_work_item_discussion_refresh(item_key);

    get_work_item_comment(pool, work_item_id, comment_id).await
}

pub async fn create_work_item_comment_draft(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    parent_comment_id: Option<i64>,
    actor_display_name_snapshot: &str,
) -> AppResult<WorkItemCommentSummary> {
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(actor_display_name_snapshot);
    let Some((work_item_id, project_status)) = sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT wi.id, p.status
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
    if let Some(parent_comment_id) = parent_comment_id {
        let parent = get_work_item_comment(pool, work_item_id, parent_comment_id).await?;
        if parent.is_flow {
            return Err(AppError::BadRequest("不能回复系统流程记录".to_string()));
        }
    }

    let comment_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO work_item_comments (
            work_item_id,
            author_user_id,
            actor_display_name_snapshot,
            body,
            body_format,
            parent_comment_id,
            is_draft
        )
        VALUES (?1, ?2, ?3, '', 'html', ?4, 1)
        RETURNING id
        "#,
    )
    .bind(work_item_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(parent_comment_id)
    .fetch_one(pool)
    .await?;

    get_work_item_comment_including_drafts(pool, work_item_id, comment_id).await
}

pub async fn publish_work_item_comment_draft(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    comment_id: i64,
    body: &str,
    body_format: &str,
    actor_display_name_snapshot: &str,
) -> AppResult<WorkItemCommentSummary> {
    let prepared = prepare_work_item_comment_body(body, body_format, "评论")?;
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(actor_display_name_snapshot);
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
    let draft = get_work_item_comment_including_drafts(pool, work_item_id, comment_id).await?;
    if !draft.is_draft {
        return Err(AppError::BadRequest("该评论不是草稿".to_string()));
    }
    if draft.is_flow {
        return Err(AppError::Forbidden("流程记录不能作为草稿发布".to_string()));
    }
    if draft.author_user_id != Some(actor_user_id) {
        return Err(AppError::Forbidden("只能发布自己的草稿评论".to_string()));
    }
    ensure_comment_body_attachment_references(pool, comment_id, &prepared.body).await?;

    let mut reply_recipient = None;
    if let Some(parent_comment_id) = draft.parent_comment_id {
        let parent = get_work_item_comment(pool, work_item_id, parent_comment_id).await?;
        if parent.is_flow {
            return Err(AppError::BadRequest("不能回复系统流程记录".to_string()));
        }
        reply_recipient = parent.author_user_id;
    }
    let mention_usernames =
        extract_comment_mention_usernames(&prepared.body, &prepared.body_format)?;
    let mention_targets =
        resolve_project_mention_targets(pool, project_id, &mention_usernames).await?;
    let mention_target_user_ids = mention_targets
        .iter()
        .map(|target| target.user_id)
        .collect::<HashSet<_>>();

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated_count = sqlx::query(
        r#"
        UPDATE work_item_comments
        SET body = ?3,
            body_format = ?4,
            actor_display_name_snapshot = ?5,
            is_draft = 0,
            created_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?1
          AND work_item_id = ?2
          AND is_draft = 1
          AND deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .bind(&prepared.body)
    .bind(&prepared.body_format)
    .bind(&actor_display_name_snapshot)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if updated_count == 0 {
        return Err(AppError::NotFound("草稿评论不存在".to_string()));
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

    if let Some(recipient_user_id) = reply_recipient
        && !mention_target_user_ids.contains(&recipient_user_id)
    {
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
                kind: "comment_replied",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 的内容收到回复"),
                body: &prepared.plain_text,
            },
        )
        .await?;
    }

    for target in &mention_targets {
        if target.user_id == actor_user_id {
            continue;
        }
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id: target.user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
                kind: "comment_mentioned",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 中被提及"),
                body: &prepared.plain_text,
            },
        )
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
            summary
        )
        VALUES (?1, ?2, ?3, 'work_item.commented', 'work_item', ?4, ?5)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(item_key)
    .bind(format!("评论工作项 {item_key}"))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    if let Some(recipient_user_id) = reply_recipient
        && !mention_target_user_ids.contains(&recipient_user_id)
    {
        realtime::publish_topbar_refresh_for_user(recipient_user_id);
    }
    for target in &mention_targets {
        if target.user_id != actor_user_id {
            realtime::publish_topbar_refresh_for_user(target.user_id);
        }
    }
    realtime::publish_work_item_discussion_refresh(item_key);

    get_work_item_comment(pool, work_item_id, comment_id).await
}

pub async fn cancel_work_item_comment_draft(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    comment_id: i64,
) -> AppResult<WorkItemCommentSummary> {
    let Some((work_item_id, project_status)) = sqlx::query_as::<_, (i64, String)>(
        r#"
        SELECT wi.id, p.status
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
    let draft = get_work_item_comment_including_drafts(pool, work_item_id, comment_id).await?;
    if !draft.is_draft {
        return Err(AppError::BadRequest("该评论不是草稿".to_string()));
    }
    if draft.is_flow {
        return Err(AppError::Forbidden("流程记录不能作为草稿取消".to_string()));
    }
    if draft.author_user_id != Some(actor_user_id) {
        return Err(AppError::Forbidden("只能取消自己的草稿评论".to_string()));
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let affected = sqlx::query(
        r#"
        UPDATE work_item_comments
        SET deleted_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?1
          AND work_item_id = ?2
          AND author_user_id = ?3
          AND is_draft = 1
          AND deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("草稿评论不存在".to_string()));
    }
    let file_object_ids = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT DISTINCT fa.file_object_id
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        WHERE fa.target_type = 'comment'
          AND fa.target_id = ?1
          AND fo.status <> 'deleted'
        ORDER BY fa.file_object_id
        "#,
    )
    .bind(comment_id)
    .fetch_all(&mut *tx)
    .await?;
    for file_object_id in file_object_ids {
        if !crate::domains::files::file_object_has_protecting_references_in_tx(
            &mut tx,
            file_object_id,
            None,
        )
        .await?
        {
            crate::domains::files::enqueue_deleted_file_object_in_tx(&mut tx, file_object_id)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(draft)
}

pub async fn get_work_item_comment(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
) -> AppResult<WorkItemCommentSummary> {
    get_work_item_comment_by_visibility(pool, work_item_id, comment_id, false).await
}

pub async fn get_work_item_comment_including_drafts(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
) -> AppResult<WorkItemCommentSummary> {
    get_work_item_comment_by_visibility(pool, work_item_id, comment_id, true).await
}

pub(super) async fn get_work_item_comment_by_visibility(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
    include_drafts: bool,
) -> AppResult<WorkItemCommentSummary> {
    let row = sqlx::query_as::<
        _,
        (
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
        ),
    >(
        r#"
        SELECT
            c.id,
            c.body,
            c.body_format,
            c.is_draft,
            c.author_user_id,
            COALESCE(u.username, '') AS author_username,
            COALESCE(NULLIF(c.actor_display_name_snapshot, ''), u.display_name, '') AS author_display_name,
            c.created_at,
            c.updated_at,
            c.parent_comment_id,
            COALESCE(NULLIF(parent.actor_display_name_snapshot, ''), parent_author.display_name, '') AS parent_author_display_name
        FROM work_item_comments c
        LEFT JOIN users u ON u.id = c.author_user_id
        LEFT JOIN work_item_comments parent ON parent.id = c.parent_comment_id
        LEFT JOIN users parent_author ON parent_author.id = parent.author_user_id
        WHERE c.id = ?1
          AND c.work_item_id = ?2
          AND c.deleted_at IS NULL
          AND (?3 OR c.is_draft = 0)
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .bind(if include_drafts { 1_i64 } else { 0_i64 })
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("评论不存在".to_string()))?;

    let (body, is_flow) = normalize_work_item_comment_body(row.1);
    Ok(WorkItemCommentSummary {
        id: row.0,
        parent_comment_id: row.9,
        parent_author_display_name: row.10,
        body,
        body_format: row.2,
        author_user_id: row.4,
        author_username: row.5,
        author_display_name: row.6,
        created_at: row.7,
        updated_at: row.8,
        is_flow,
        is_draft: row.3 != 0,
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
    update_work_item_comment_with_format(
        pool,
        actor_user_id,
        actor_is_super_admin,
        item_key,
        comment_id,
        body,
        COMMENT_BODY_FORMAT_PLAIN,
    )
    .await
}

pub async fn update_work_item_comment_with_format(
    pool: &SqlitePool,
    actor_user_id: i64,
    actor_is_super_admin: bool,
    item_key: &str,
    comment_id: i64,
    body: &str,
    body_format: &str,
) -> AppResult<WorkItemCommentSummary> {
    update_work_item_comment_with_format_internal(
        pool,
        actor_user_id,
        actor_is_super_admin,
        item_key,
        comment_id,
        CommentBodyInput { body, body_format },
        false,
    )
    .await
}

pub async fn update_work_item_comment_with_format_for_project_editor(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    comment_id: i64,
    body: &str,
    body_format: &str,
) -> AppResult<WorkItemCommentSummary> {
    update_work_item_comment_with_format_internal(
        pool,
        actor_user_id,
        false,
        item_key,
        comment_id,
        CommentBodyInput { body, body_format },
        true,
    )
    .await
}

pub(super) async fn update_work_item_comment_with_format_internal(
    pool: &SqlitePool,
    actor_user_id: i64,
    actor_is_super_admin: bool,
    item_key: &str,
    comment_id: i64,
    input: CommentBodyInput<'_>,
    bypass_manage_permission: bool,
) -> AppResult<WorkItemCommentSummary> {
    let CommentBodyInput { body, body_format } = input;
    let prepared = prepare_work_item_comment_body(body, body_format, "评论")?;
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
    if comment.is_draft {
        return Err(AppError::BadRequest(
            "草稿评论不能通过编辑入口修改".to_string(),
        ));
    }
    if !bypass_manage_permission
        && !user_can_manage_work_item_comment(
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
    let previous_mentions = extract_comment_mention_usernames(&comment.body, &comment.body_format)?
        .into_iter()
        .collect::<HashSet<_>>();
    let mention_usernames =
        extract_comment_mention_usernames(&prepared.body, &prepared.body_format)?;
    let mention_targets =
        resolve_project_mention_targets(pool, project_id, &mention_usernames).await?;
    ensure_comment_body_attachment_references(pool, comment_id, &prepared.body).await?;

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let updated_count = sqlx::query(
        r#"
        UPDATE work_item_comments
        SET body = ?3,
            body_format = ?4,
            updated_at = datetime('now')
        WHERE id = ?1
          AND work_item_id = ?2
          AND deleted_at IS NULL
          AND is_draft = 0
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .bind(&prepared.body)
    .bind(&prepared.body_format)
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

    for target in &mention_targets {
        if target.user_id == actor_user_id || previous_mentions.contains(&target.username) {
            continue;
        }
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id: target.user_id,
                actor_user_id,
                actor_display_name_snapshot: "",
                kind: "comment_mentioned",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 中被提及"),
                body: &prepared.plain_text,
            },
        )
        .await?;
    }

    tx.commit().await?;
    for target in &mention_targets {
        if target.user_id != actor_user_id && !previous_mentions.contains(&target.username) {
            realtime::publish_topbar_refresh_for_user(target.user_id);
        }
    }
    realtime::publish_work_item_discussion_refresh(item_key);

    get_work_item_comment(pool, work_item_id, comment_id).await
}

pub(super) fn prepare_work_item_comment_body(
    body: &str,
    body_format: &str,
    subject: &str,
) -> AppResult<PreparedWorkItemCommentBody> {
    let body_format = normalize_comment_body_format(body_format)?;
    match body_format.as_str() {
        COMMENT_BODY_FORMAT_HTML => {
            let raw_body = validate_optional_text(body, "评论内容", 20000)?;
            ensure_plain_work_item_comment_body(&html_to_plain_text(&raw_body))?;
            ensure_comment_html_media_sources_are_controlled(&raw_body)?;
            ensure_comment_html_attachment_links_are_controlled(&raw_body)?;
            let body = sanitize_comment_html(&raw_body);
            let plain_text = html_to_plain_text(&body);
            if plain_text.is_empty() && !comment_html_has_media_reference(&body) {
                return Err(AppError::BadRequest(format!(
                    "{subject}不能为空：请输入文字或上传图片/附件"
                )));
            }
            Ok(PreparedWorkItemCommentBody {
                body,
                body_format,
                plain_text,
            })
        }
        _ => {
            let body = validate_optional_text(body, "评论内容", 5000)?;
            if body.is_empty() {
                return Err(AppError::BadRequest(format!(
                    "{subject}不能为空：请输入文字"
                )));
            }
            ensure_plain_work_item_comment_body(&body)?;
            Ok(PreparedWorkItemCommentBody {
                plain_text: body.clone(),
                body,
                body_format,
            })
        }
    }
}

pub(super) fn normalize_comment_body_format(body_format: &str) -> AppResult<String> {
    match body_format.trim() {
        "" | COMMENT_BODY_FORMAT_PLAIN => Ok(COMMENT_BODY_FORMAT_PLAIN.to_string()),
        COMMENT_BODY_FORMAT_HTML => Ok(COMMENT_BODY_FORMAT_HTML.to_string()),
        _ => Err(AppError::BadRequest(
            "评论格式只能是 plain / html".to_string(),
        )),
    }
}

pub fn work_item_comment_body_html_for_display(
    body: &str,
    body_format: &str,
    is_flow: bool,
) -> String {
    if is_flow || body_format != COMMENT_BODY_FORMAT_HTML {
        return plain_text_to_html(body);
    }

    sanitize_comment_html(body)
}

pub fn work_item_comment_plain_text(body: &str, body_format: &str) -> String {
    if body_format == COMMENT_BODY_FORMAT_HTML {
        let sanitized = sanitize_comment_html(body);
        let without_attachments = strip_inline_attachment_nodes(&sanitized);
        let plain_text = html_to_plain_text(&without_attachments);
        if plain_text.is_empty() {
            html_to_plain_text(&sanitized)
        } else {
            plain_text
        }
    } else {
        body.trim().to_string()
    }
}

pub fn work_item_primary_post<'a>(
    comments: &'a [WorkItemCommentSummary],
    primary_post_comment_id: Option<i64>,
    reporter_username: &str,
    description: &str,
) -> Option<&'a WorkItemCommentSummary> {
    if let Some(primary_post_comment_id) = primary_post_comment_id {
        return comments
            .iter()
            .find(|comment| comment.id == primary_post_comment_id);
    }
    let description = normalized_plain_summary(description);
    comments.iter().find(|comment| {
        !comment.is_flow
            && !comment.is_draft
            && comment.parent_comment_id.is_none()
            && comment.body_format == COMMENT_BODY_FORMAT_HTML
            && comment.author_username == reporter_username
            && (description == normalized_plain_summary("见首条图文说明")
                || (!description.is_empty()
                    && normalized_plain_summary(&work_item_primary_post_summary(
                        &comment.body,
                        &comment.body_format,
                    )) == description))
    })
}

pub fn work_item_has_linkable_primary_post(
    primary_post: Option<&WorkItemCommentSummary>,
    primary_post_comment_id: Option<i64>,
    description: &str,
) -> bool {
    primary_post.is_some() || (primary_post_comment_id.is_none() && !description.trim().is_empty())
}

pub fn work_item_primary_post_summary(body: &str, body_format: &str) -> String {
    let plain = work_item_comment_plain_text(body, body_format);
    if plain.trim().is_empty() {
        return "见首条图文说明".to_string();
    }
    plain.chars().take(5000).collect()
}

pub async fn upsert_work_item_primary_post(
    pool: &SqlitePool,
    actor_user_id: i64,
    item_key: &str,
    legacy_comment_id: Option<i64>,
    body: &str,
    actor_display_name_snapshot: &str,
) -> AppResult<WorkItemCommentSummary> {
    // 正文可能引用新建弹窗上传的草稿附件；评论 id 确定前先以占位 id 改写，用于提前校验与提及解析。
    let (preview_body, draft_attachment_ids) = rewrite_draft_attachment_urls(body, item_key, 0)?;
    let prepared =
        prepare_work_item_comment_body(&preview_body, COMMENT_BODY_FORMAT_HTML, "主内容")?;
    let actor_display_name_snapshot =
        normalize_actor_display_name_snapshot(actor_display_name_snapshot);
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
    let mention_usernames =
        extract_comment_mention_usernames(&prepared.body, &prepared.body_format)?;
    let mention_targets =
        resolve_project_mention_targets(pool, project_id, &mention_usernames).await?;

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let locked = sqlx::query(
        "UPDATE work_items SET updated_at = updated_at WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(work_item_id)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if locked == 0 {
        return Err(AppError::NotFound("工作项不存在".to_string()));
    }
    let persisted_comment_id = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT primary_post_comment_id FROM work_items WHERE id = ?1",
    )
    .bind(work_item_id)
    .fetch_one(&mut *tx)
    .await?;
    let candidate_comment_id = persisted_comment_id.or(legacy_comment_id);
    let existing = if let Some(comment_id) = candidate_comment_id {
        sqlx::query_as::<_, (i64, String, String)>(
            r#"
            SELECT c.id, c.body, c.body_format
            FROM work_item_comments c
            WHERE c.id = ?1
              AND c.work_item_id = ?2
              AND c.author_user_id = ?3
              AND c.parent_comment_id IS NULL
              AND c.body NOT LIKE ?4
              AND c.is_draft = 0
              AND c.deleted_at IS NULL
            "#,
        )
        .bind(comment_id)
        .bind(work_item_id)
        .bind(actor_user_id)
        .bind(format!("{WORK_ITEM_FLOW_COMMENT_PREFIX}%"))
        .fetch_optional(&mut *tx)
        .await?
    } else {
        None
    };
    let previous_mentions = existing
        .as_ref()
        .map(|(_, body, body_format)| extract_comment_mention_usernames(body, body_format))
        .transpose()?
        .unwrap_or_default()
        .into_iter()
        .collect::<HashSet<_>>();
    let created = existing.is_none();
    let comment_id = if let Some((comment_id, _, _)) = existing {
        sqlx::query(
            r#"
            UPDATE work_item_comments
            SET body = ?2,
                body_format = ?3,
                updated_at = datetime('now')
            WHERE id = ?1
            "#,
        )
        .bind(comment_id)
        .bind(&prepared.body)
        .bind(&prepared.body_format)
        .execute(&mut *tx)
        .await?;
        comment_id
    } else {
        sqlx::query_scalar::<_, i64>(
            r#"
            INSERT INTO work_item_comments (
                work_item_id,
                author_user_id,
                actor_display_name_snapshot,
                body,
                body_format
            )
            VALUES (?1, ?2, ?3, ?4, ?5)
            RETURNING id
            "#,
        )
        .bind(work_item_id)
        .bind(actor_user_id)
        .bind(&actor_display_name_snapshot)
        .bind(&prepared.body)
        .bind(&prepared.body_format)
        .fetch_one(&mut *tx)
        .await?
    };
    let prepared = if draft_attachment_ids.is_empty() {
        prepared
    } else {
        // 评论 id 已确定：改写为主帖附件 URL，并在同一事务内把草稿附件原地改绑到主帖（附件 id 不变）。
        let (final_body, _) = rewrite_draft_attachment_urls(body, item_key, comment_id)?;
        let final_prepared =
            prepare_work_item_comment_body(&final_body, COMMENT_BODY_FORMAT_HTML, "主内容")?;
        bind_draft_attachments_in_transaction(
            &mut tx,
            &draft_attachment_ids,
            project_id,
            actor_user_id,
            comment_id,
        )
        .await?;
        sqlx::query(
            "UPDATE work_item_comments SET body = ?2, body_format = ?3, updated_at = datetime('now') WHERE id = ?1",
        )
        .bind(comment_id)
        .bind(&final_prepared.body)
        .bind(&final_prepared.body_format)
        .execute(&mut *tx)
        .await?;
        final_prepared
    };
    ensure_comment_body_attachment_references_in_transaction(&mut tx, comment_id, &prepared.body)
        .await?;
    let summary = work_item_primary_post_summary(&prepared.body, &prepared.body_format);
    sqlx::query(
        r#"
        UPDATE work_items
        SET description = ?2,
            primary_post_comment_id = ?3,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .bind(&summary)
    .bind(comment_id)
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
            summary
        )
        VALUES (?1, ?2, ?3, ?4, 'comment', ?5, ?6)
        "#,
    )
    .bind(project_id)
    .bind(actor_user_id)
    .bind(&actor_display_name_snapshot)
    .bind(if created {
        "work_item.commented"
    } else {
        "work_item.comment.updated"
    })
    .bind(comment_id.to_string())
    .bind(if created {
        format!("评论工作项 {item_key}")
    } else {
        format!("编辑工作项 {item_key} 评论")
    })
    .execute(&mut *tx)
    .await?;
    for target in &mention_targets {
        if target.user_id == actor_user_id || previous_mentions.contains(&target.username) {
            continue;
        }
        notifications::create_in_transaction(
            &mut tx,
            CreateNotification {
                recipient_user_id: target.user_id,
                actor_user_id,
                actor_display_name_snapshot: &actor_display_name_snapshot,
                kind: "comment_mentioned",
                work_item_id,
                comment_id: Some(comment_id),
                title: &format!("你在 {item_key} 中被提及"),
                body: &prepared.plain_text,
            },
        )
        .await?;
    }
    tx.commit().await?;
    for target in &mention_targets {
        if target.user_id != actor_user_id && !previous_mentions.contains(&target.username) {
            realtime::publish_topbar_refresh_for_user(target.user_id);
        }
    }
    realtime::publish_work_item_discussion_refresh(item_key);
    get_work_item_comment(pool, work_item_id, comment_id).await
}

pub async fn bind_work_item_primary_post(
    pool: &SqlitePool,
    item_key: &str,
    comment_id: i64,
    description: &str,
) -> AppResult<WorkItemDetail> {
    let result = sqlx::query(
        r#"
        UPDATE work_items
        SET description = ?2,
            primary_post_comment_id = ?3,
            updated_at = datetime('now')
        WHERE item_key = ?1
          AND EXISTS (
              SELECT 1
              FROM work_item_comments c
              WHERE c.id = ?3
                AND c.work_item_id = work_items.id
                AND c.deleted_at IS NULL
                AND c.is_draft = 0
          )
        "#,
    )
    .bind(item_key)
    .bind(description)
    .bind(comment_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("工作项或所属主帖不存在".to_string()));
    }
    get_work_item_detail(pool, item_key)
        .await?
        .ok_or_else(|| AppError::NotFound("工作项不存在".to_string()))
}

pub fn work_item_comment_inline_attachment_ids(
    comment_id: i64,
    body: &str,
    body_format: &str,
) -> Vec<i64> {
    if body_format != COMMENT_BODY_FORMAT_HTML {
        return Vec::new();
    }

    extract_comment_attachment_references(body)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(referenced_comment_id, attachment_id)| {
            (referenced_comment_id == comment_id).then_some(attachment_id)
        })
        .collect()
}

pub async fn archive_work_item_comment_inline_attachment(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
    attachment_id: i64,
    expected_is_draft: bool,
) -> AppResult<()> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let Some((body, body_format, is_draft)) = sqlx::query_as::<_, (String, String, i64)>(
        r#"
        SELECT body, body_format, is_draft
        FROM work_item_comments
        WHERE id = ?1
          AND work_item_id = ?2
          AND deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Err(AppError::NotFound("评论不存在".to_string()));
    };
    if (is_draft != 0) != expected_is_draft {
        return Err(AppError::Conflict(
            "评论状态已变化，请刷新后重试".to_string(),
        ));
    }

    let file_object_id = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT fa.file_object_id
        FROM file_attachments fa
        JOIN file_objects fo ON fo.id = fa.file_object_id
        WHERE fa.id = ?1
          AND fa.target_type = 'comment'
          AND fa.target_id = ?2
          AND fo.status <> 'deleted'
        "#,
    )
    .bind(attachment_id)
    .bind(comment_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("附件不存在".to_string()))?;
    let prepared = prepare_work_item_comment_body_without_attachment(
        &body,
        &body_format,
        attachment_id,
        "内容",
    )?;
    if let Some(prepared) = &prepared {
        sqlx::query(
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
        .bind(&prepared.body)
        .execute(&mut *tx)
        .await?;
    }
    let has_other_reference = crate::domains::files::file_object_has_protecting_references_in_tx(
        &mut tx,
        file_object_id,
        Some(attachment_id),
    )
    .await?;
    if has_other_reference {
        return Err(AppError::Conflict(
            "文件对象仍被其他受保护的附件关系引用，不能删除".to_string(),
        ));
    }
    crate::domains::files::enqueue_deleted_file_object_in_tx(&mut tx, file_object_id).await?;
    let primary_post_summary = prepared
        .as_ref()
        .map(|prepared| work_item_primary_post_summary(&prepared.body, &prepared.body_format));
    sqlx::query(
        r#"
        UPDATE work_items
        SET description = CASE
                WHEN primary_post_comment_id = ?2 AND ?3 IS NOT NULL THEN ?3
                ELSE description
            END,
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(work_item_id)
    .bind(comment_id)
    .bind(primary_post_summary)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn ensure_work_item_comment_inline_attachment_can_be_removed(
    pool: &SqlitePool,
    work_item_id: i64,
    comment_id: i64,
    attachment_id: i64,
) -> AppResult<()> {
    let Some((body, body_format)) = sqlx::query_as::<_, (String, String)>(
        r#"
        SELECT body, body_format
        FROM work_item_comments
        WHERE id = ?1
          AND work_item_id = ?2
          AND deleted_at IS NULL
        "#,
    )
    .bind(comment_id)
    .bind(work_item_id)
    .fetch_optional(pool)
    .await?
    else {
        return Err(AppError::NotFound("评论不存在".to_string()));
    };
    prepare_work_item_comment_body_without_attachment(&body, &body_format, attachment_id, "内容")?;
    Ok(())
}

pub(super) fn prepare_work_item_comment_body_without_attachment(
    body: &str,
    body_format: &str,
    attachment_id: i64,
    subject: &str,
) -> AppResult<Option<PreparedWorkItemCommentBody>> {
    if body_format != COMMENT_BODY_FORMAT_HTML {
        return Ok(None);
    }
    let next_body = strip_inline_attachment_node(body, attachment_id);
    (next_body != body)
        .then(|| prepare_work_item_comment_body(&next_body, body_format, subject))
        .transpose()
}

pub(super) fn sanitize_comment_html(body: &str) -> String {
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
        .attribute_filter(|element, attribute, value| match (element, attribute) {
            ("img", "src") | ("source", "src") | ("video", "src")
                if !comment_attachment_url_like(value) =>
            {
                None
            }
            _ => Some(Cow::Borrowed(value)),
        })
        .clean(body)
        .to_string()
}

pub(super) fn extract_comment_mention_usernames(
    body: &str,
    body_format: &str,
) -> AppResult<Vec<String>> {
    if body_format != COMMENT_BODY_FORMAT_HTML {
        return Ok(Vec::new());
    }
    let mut usernames = Vec::new();
    let mut search_from = 0;
    while let Some(relative_start) = body[search_from..].find('<') {
        let tag_start = search_from + relative_start;
        let Some(relative_end) = body[tag_start..].find('>') else {
            break;
        };
        let tag_end = tag_start + relative_end + 1;
        let tag_html = &body[tag_start..tag_end];
        if let Some(username) = html_attribute_value(tag_html, "data-yuance-mention-username") {
            let username = validate_username_ref(&username)?;
            if !usernames.contains(&username) {
                usernames.push(username);
            }
        }
        search_from = tag_end;
    }
    Ok(usernames)
}

pub(super) fn comment_attachment_url_like(value: &str) -> bool {
    let value = value.trim();
    let path = value.split('?').next().unwrap_or(value);
    path.starts_with("/web/work-items/")
        && path.contains("/comments/")
        && path.contains("/attachments/")
        && path.ends_with("/download")
}

pub(super) fn ensure_comment_html_media_sources_are_controlled(body: &str) -> AppResult<()> {
    for tag_name in ["img", "source", "video"] {
        ensure_comment_html_tag_sources_are_controlled(body, tag_name)?;
    }
    Ok(())
}

pub(super) fn ensure_comment_html_attachment_links_are_controlled(body: &str) -> AppResult<()> {
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
            && !comment_attachment_url_like(&href)
        {
            return Err(AppError::BadRequest(
                "正文附件链接必须使用已上传的评论附件".to_string(),
            ));
        }
        search_from = tag_end.saturating_add(1);
    }
    Ok(())
}

pub(super) fn ensure_comment_html_tag_sources_are_controlled(
    body: &str,
    tag_name: &str,
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
            && !comment_attachment_url_like(&source)
        {
            return Err(AppError::BadRequest(
                "正文媒体必须使用已上传的评论附件".to_string(),
            ));
        }
        search_from = tag_end.saturating_add(1);
    }
    Ok(())
}

pub(super) fn comment_html_has_media_reference(body: &str) -> bool {
    body.contains("/comments/") && body.contains("/attachments/")
}

/// 将正文中的草稿附件 URL `/web/projects/{key}/work-item-draft-attachments/{id}/download`
/// 改写为主帖附件 URL，并返回去重后的草稿附件 id。格式不完整的草稿引用直接拒绝。
pub(super) fn rewrite_draft_attachment_urls(
    body: &str,
    item_key: &str,
    comment_id: i64,
) -> AppResult<(String, Vec<i64>)> {
    if !body.contains(DRAFT_ATTACHMENT_URL_MARKER) {
        return Ok((body.to_string(), Vec::new()));
    }
    let invalid = || AppError::BadRequest("草稿附件引用无效".to_string());
    let mut output = String::with_capacity(body.len());
    let mut ids = Vec::new();
    let mut remaining = body;
    while let Some(marker) = remaining.find(DRAFT_ATTACHMENT_URL_MARKER) {
        let before = &remaining[..marker];
        // 只处理作为属性值（src / href）出现的草稿地址；正文文本、代码块中的同名路径原样保留。
        let attribute_prefix = before
            .rfind(DRAFT_ATTACHMENT_URL_PREFIX)
            .filter(|start| {
                let head = &before[..*start];
                head.ends_with("=\"") || head.ends_with("='")
            })
            .filter(|start| {
                let project_key = &before[*start + DRAFT_ATTACHMENT_URL_PREFIX.len()..];
                !project_key.is_empty()
                    && project_key.chars().all(|character| {
                        character.is_ascii_alphanumeric() || character == '-' || character == '_'
                    })
            });
        let Some(prefix_start) = attribute_prefix else {
            let skip_to = marker + DRAFT_ATTACHMENT_URL_MARKER.len();
            output.push_str(&remaining[..skip_to]);
            remaining = &remaining[skip_to..];
            continue;
        };
        let after = &remaining[marker + DRAFT_ATTACHMENT_URL_MARKER.len()..];
        let digits_len = after
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .count();
        if digits_len == 0 || !after[digits_len..].starts_with(DRAFT_ATTACHMENT_URL_SUFFIX) {
            return Err(invalid());
        }
        let attachment_id = after[..digits_len].parse::<i64>().map_err(|_| invalid())?;
        if attachment_id < 1 {
            return Err(invalid());
        }
        output.push_str(&before[..prefix_start]);
        output.push_str(&format!(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download"
        ));
        ids.push(attachment_id);
        remaining = &after[digits_len + DRAFT_ATTACHMENT_URL_SUFFIX.len()..];
    }
    output.push_str(remaining);
    ids.sort_unstable();
    ids.dedup();
    Ok((output, ids))
}

/// 校验草稿附件属于当前用户、属于该项目且已上传完成，然后原地改绑为评论附件。
/// 任一校验失败返回错误，由调用方回滚整个事务。
pub(super) async fn bind_draft_attachments_in_transaction(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    attachment_ids: &[i64],
    project_id: i64,
    actor_user_id: i64,
    comment_id: i64,
) -> AppResult<()> {
    for attachment_id in attachment_ids {
        // 已绑定到本主帖的附件（上次请求已提交但响应丢失后重试）视为完成，保证写主帖可安全重试。
        let status = sqlx::query_scalar::<_, String>(
            r#"
            SELECT fo.status
            FROM file_attachments fa
            JOIN file_objects fo ON fo.id = fa.file_object_id
            WHERE fa.id = ?1
              AND fa.created_by_user_id = ?3
              AND (
                  (fa.target_type = 'draft' AND fa.target_id = ?2)
                  OR (fa.target_type = 'comment' AND fa.target_id = ?4)
              )
            "#,
        )
        .bind(attachment_id)
        .bind(project_id)
        .bind(actor_user_id)
        .bind(comment_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| AppError::BadRequest("草稿附件不存在或无权使用".to_string()))?;
        if status != "uploaded" {
            return Err(AppError::BadRequest(
                "只能引用已上传完成的草稿附件".to_string(),
            ));
        }
        sqlx::query(
            r#"
            UPDATE file_attachments
            SET target_type = 'comment', target_id = ?2
            WHERE id = ?1 AND target_type = 'draft'
            "#,
        )
        .bind(attachment_id)
        .bind(comment_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

pub(super) fn extract_comment_attachment_references(body: &str) -> AppResult<Vec<(i64, i64)>> {
    let mut references = Vec::new();
    let mut remaining = body;
    while let Some(comment_marker) = remaining.find("/comments/") {
        remaining = &remaining[comment_marker + "/comments/".len()..];
        let comment_digits = remaining
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect::<String>();
        if comment_digits.is_empty()
            || !remaining[comment_digits.len()..].starts_with("/attachments/")
        {
            continue;
        }
        remaining = &remaining[comment_digits.len() + "/attachments/".len()..];
        let attachment_digits = remaining
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect::<String>();
        if attachment_digits.is_empty() {
            continue;
        }
        let comment_id = comment_digits
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("评论附件引用无效".to_string()))?;
        let attachment_id = attachment_digits
            .parse::<i64>()
            .map_err(|_| AppError::BadRequest("评论附件引用无效".to_string()))?;
        references.push((comment_id, attachment_id));
    }
    references.sort_unstable();
    references.dedup();
    Ok(references)
}

pub(super) async fn ensure_comment_body_attachment_references(
    pool: &SqlitePool,
    comment_id: i64,
    body: &str,
) -> AppResult<()> {
    for (referenced_comment_id, attachment_id) in extract_comment_attachment_references(body)? {
        if referenced_comment_id != comment_id {
            return Err(AppError::BadRequest("不能引用其他评论的附件".to_string()));
        }
        let status = sqlx::query_scalar::<_, String>(
            r#"
            SELECT fo.status
            FROM file_attachments fa
            JOIN file_objects fo ON fo.id = fa.file_object_id
            WHERE fa.id = ?1
              AND fa.target_type = 'comment'
              AND fa.target_id = ?2
            "#,
        )
        .bind(attachment_id)
        .bind(comment_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::BadRequest("评论附件引用不存在".to_string()))?;
        if status != "uploaded" {
            return Err(AppError::BadRequest(
                "只能引用已上传完成的评论附件".to_string(),
            ));
        }
    }
    Ok(())
}

pub(super) async fn ensure_comment_body_attachment_references_in_transaction(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    comment_id: i64,
    body: &str,
) -> AppResult<()> {
    for (referenced_comment_id, attachment_id) in extract_comment_attachment_references(body)? {
        if referenced_comment_id != comment_id {
            return Err(AppError::BadRequest("不能引用其他评论的附件".to_string()));
        }
        let status = sqlx::query_scalar::<_, String>(
            r#"
            SELECT fo.status
            FROM file_attachments fa
            JOIN file_objects fo ON fo.id = fa.file_object_id
            WHERE fa.id = ?1
              AND fa.target_type = 'comment'
              AND fa.target_id = ?2
            "#,
        )
        .bind(attachment_id)
        .bind(comment_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| AppError::BadRequest("评论附件引用不存在".to_string()))?;
        if status != "uploaded" {
            return Err(AppError::BadRequest(
                "只能引用已上传完成的评论附件".to_string(),
            ));
        }
    }
    Ok(())
}

pub(super) fn work_item_comment_summary_from_row(
    (
        id,
        body,
        body_format,
        is_draft,
        author_user_id,
        author_username,
        author_display_name,
        created_at,
        updated_at,
        parent_comment_id,
        parent_author_display_name,
    ): WorkItemCommentRow,
) -> WorkItemCommentSummary {
    let (body, is_flow) = normalize_work_item_comment_body(body);
    WorkItemCommentSummary {
        id,
        parent_comment_id,
        parent_author_display_name,
        body,
        body_format,
        author_user_id,
        author_username,
        author_display_name,
        created_at,
        updated_at,
        is_flow,
        is_draft: is_draft != 0,
    }
}

pub(super) fn normalize_work_item_comment_body(body: String) -> (String, bool) {
    match body.strip_prefix(WORK_ITEM_FLOW_COMMENT_PREFIX) {
        Some(flow_body) => (flow_body.to_string(), true),
        None => (body, false),
    }
}

pub(super) fn encode_flow_comment_body(body: &str) -> String {
    format!("{WORK_ITEM_FLOW_COMMENT_PREFIX}{body}")
}

pub(super) fn ensure_plain_work_item_comment_body(body: &str) -> AppResult<()> {
    if body.starts_with(WORK_ITEM_FLOW_COMMENT_PREFIX) {
        return Err(AppError::BadRequest(
            "评论内容不能使用系统流程前缀".to_string(),
        ));
    }

    Ok(())
}

pub(super) async fn seed_demo_comments(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
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
