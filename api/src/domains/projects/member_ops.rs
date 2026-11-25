//! 项目成员领域：添加、移除、角色调整与成员查询。

use super::*;

pub async fn list_user_project_memberships(
    pool: &SqlitePool,
    user_id: i64,
) -> AppResult<Vec<UserProjectMembershipSummary>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        r#"
        SELECT
            p.id,
            p.project_key,
            p.name,
            p.status,
            pm.member_role
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        WHERE pm.user_id = ?1
        ORDER BY p.updated_at DESC, p.id DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(project_id, project_key, project_name, project_status, member_role)| {
                UserProjectMembershipSummary {
                    project_id,
                    project_key,
                    project_name,
                    project_status,
                    member_role,
                }
            },
        )
        .collect())
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
    let username = validate_username_ref(username)?;
    let mut members =
        add_project_members(pool, actor_user_id, project_key, &[username], member_role).await?;

    members
        .pop()
        .ok_or_else(|| AppError::NotFound("项目成员添加后未找到".to_string()))
}

pub async fn add_project_members(
    pool: &SqlitePool,
    actor_user_id: i64,
    project_key: &str,
    usernames: &[String],
    member_role: &str,
) -> AppResult<Vec<ProjectMemberDetail>> {
    let project_key = validate_project_key(project_key)?;
    let member_role = validate_member_role(member_role)?;
    // 负责人只能通过编辑项目转移；添加成员不得授予 owner，否则会与 projects.owner_user_id 不一致。
    if member_role == "owner" {
        return Err(AppError::BadRequest(
            "不能直接添加为项目负责人，请通过编辑项目转移负责人".to_string(),
        ));
    }

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

    let available_users = users::list_users(pool).await?;
    let mut seen_usernames = HashSet::new();
    let mut selected_users = Vec::new();
    for raw_username in usernames {
        let raw_username = raw_username.trim();
        if raw_username.is_empty() {
            continue;
        }
        let username = validate_username_ref(raw_username)?;
        if !seen_usernames.insert(username.clone()) {
            continue;
        }
        let Some(user) = available_users
            .iter()
            .find(|user| user.username == username && user.status == "active")
        else {
            return Err(AppError::BadRequest("用户不存在或未启用".to_string()));
        };
        selected_users.push((user.id, user.display_name.clone(), username));
    }
    if selected_users.is_empty() {
        return Err(AppError::BadRequest(
            "请至少选择一个要加入的项目成员".to_string(),
        ));
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut added_count = 0;
    for (user_id, display_name, username) in &selected_users {
        // 已是成员时不修改其角色（含负责人）：角色调整只能走成员角色接口，避免绕过其中的负责人保护。
        let inserted = sqlx::query(
            r#"
            INSERT INTO project_members (
                project_id,
                user_id,
                member_role
            )
            VALUES (?1, ?2, ?3)
            ON CONFLICT(project_id, user_id) DO NOTHING
            "#,
        )
        .bind(project_id)
        .bind(user_id)
        .bind(member_role)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if inserted == 0 {
            continue;
        }
        added_count += 1;

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
        .bind(username)
        .bind(format!("将 {display_name} 加入项目 {project_name}"))
        .bind(format!(r#"{{"member_role":"{member_role}"}}"#))
        .execute(&mut *tx)
        .await?;
    }
    if added_count == 0 {
        return Err(AppError::Conflict(
            "所选用户已是项目成员，如需调整角色请使用成员角色设置".to_string(),
        ));
    }

    tx.commit().await?;

    let mut members = Vec::with_capacity(selected_users.len());
    for (_, _, username) in selected_users {
        let member = get_project_member(pool, project_id, &username)
            .await?
            .ok_or_else(|| AppError::NotFound("项目成员添加后未找到".to_string()))?;
        members.push(member);
    }
    Ok(members)
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
    let assigned_active_count =
        count_active_work_items_assigned_to_user(pool, project_id, user_id).await?;
    if assigned_active_count > 0 {
        return Err(AppError::BadRequest(format!(
            "该成员仍负责 {assigned_active_count} 个待处理 / 进行中 / 待确认工作项，请先转交处理人"
        )));
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
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

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
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

/// 校验批量分配使用的成员角色：与添加成员一致，不允许直接授予负责人。
pub fn validate_assignable_member_role(member_role: &str) -> AppResult<&'static str> {
    let member_role = validate_member_role(member_role)?;
    if member_role == "owner" {
        return Err(AppError::BadRequest(
            "不能直接添加为项目负责人，请通过编辑项目转移负责人".to_string(),
        ));
    }
    Ok(member_role)
}

/// 按项目 key 判断用户是否已是成员；项目不存在时返回 false，由后续写入报告“项目不存在”。
pub async fn is_project_member_by_key(
    pool: &SqlitePool,
    project_key: &str,
    user_id: i64,
) -> AppResult<bool> {
    let project_key = validate_project_key(project_key)?;
    let exists = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM project_members pm
            JOIN projects p ON p.id = pm.project_id
            WHERE p.project_key = ?1
              AND pm.user_id = ?2
        )
        "#,
    )
    .bind(&project_key)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(exists != 0)
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

pub(super) async fn get_project_member(
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

pub(super) async fn resolve_project_member_user_id(
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

pub(super) fn validate_member_role(member_role: &str) -> AppResult<&'static str> {
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

pub(super) async fn seed_demo_members(pool: &SqlitePool, owner_user_id: i64) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO project_members (
            project_id,
            user_id,
            member_role
        )
        SELECT id, ?1, 'owner'
        FROM projects
        WHERE project_key IN ('YCE', 'OPS', 'CRM', 'BI', 'WMS', 'CMS', 'OA', 'IOT', 'PAY', 'IM', 'OPEN', 'TRAIN')
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
