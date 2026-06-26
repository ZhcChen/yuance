use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::platform::error::{AppError, AppResult};

const SYSTEM_ROLES: &[(&str, &str, bool, &str)] = &[
    ("system_admin", "系统管理员", true, "all"),
    ("member", "普通成员", true, "self"),
];

const PERMISSIONS: &[(&str, &str, &str, &str)] = &[
    (
        "system.dashboard.view",
        "查看系统管理总览",
        "page",
        "system",
    ),
    ("system.users.view", "查看用户管理", "page", "system-users"),
    ("system.users.manage", "管理用户", "action", "system-users"),
    ("system.roles.view", "查看角色权限", "page", "system-roles"),
    (
        "system.roles.manage",
        "管理角色权限",
        "action",
        "system-roles",
    ),
    (
        "system.storage.view",
        "查看对象存储设置",
        "page",
        "system-storage",
    ),
    (
        "system.storage.manage",
        "管理对象存储设置",
        "action",
        "system-storage",
    ),
    ("system.audit.view", "查看审计日志", "page", "system-audit"),
    ("project.view", "查看项目", "page", "projects"),
    ("project.manage", "管理项目", "action", "projects"),
    ("work_item.view", "查看工作项", "page", "work-items"),
    ("work_item.manage", "管理工作项", "action", "work-items"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoleSummary {
    pub role_code: String,
    pub role_name: String,
    pub status: String,
    pub is_system: bool,
    pub data_scope_type: String,
    pub permission_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionSummary {
    pub permission_key: String,
    pub permission_name: String,
    pub resource_type: String,
    pub resource_key: String,
    pub granted: bool,
}

pub async fn seed_core(pool: &SqlitePool) -> AppResult<()> {
    for (role_code, role_name, is_system, data_scope_type) in SYSTEM_ROLES {
        sqlx::query(
            r#"
            INSERT INTO roles (
                role_code,
                role_name,
                status,
                is_system,
                data_scope_type,
                data_scope_payload
            )
            VALUES (?1, ?2, 'active', ?3, ?4, '{}')
            ON CONFLICT(role_code) DO UPDATE SET
                role_name = excluded.role_name,
                status = excluded.status,
                is_system = excluded.is_system,
                data_scope_type = excluded.data_scope_type,
                updated_at = datetime('now')
            "#,
        )
        .bind(role_code)
        .bind(role_name)
        .bind(*is_system as i64)
        .bind(data_scope_type)
        .execute(pool)
        .await?;
    }

    for (permission_key, permission_name, resource_type, resource_key) in PERMISSIONS {
        sqlx::query(
            r#"
            INSERT INTO permissions (
                permission_key,
                permission_name,
                resource_type,
                resource_key
            )
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(permission_key) DO UPDATE SET
                permission_name = excluded.permission_name,
                resource_type = excluded.resource_type,
                resource_key = excluded.resource_key,
                updated_at = datetime('now')
            "#,
        )
        .bind(permission_key)
        .bind(permission_name)
        .bind(resource_type)
        .bind(resource_key)
        .execute(pool)
        .await?;
    }

    grant_all_permissions_to_system_admin(pool).await?;
    grant_member_permissions(pool).await?;

    Ok(())
}

pub async fn list_roles(pool: &SqlitePool) -> AppResult<Vec<RoleSummary>> {
    let rows = sqlx::query_as::<_, (String, String, String, i64, String, i64)>(
        r#"
        SELECT
            r.role_code,
            r.role_name,
            r.status,
            r.is_system,
            r.data_scope_type,
            COUNT(rp.id) AS permission_count
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(role_code, role_name, status, is_system, data_scope_type, permission_count)| {
                RoleSummary {
                    role_code,
                    role_name,
                    status,
                    is_system: is_system != 0,
                    data_scope_type,
                    permission_count,
                }
            },
        )
        .collect())
}

pub async fn list_permissions_for_role(
    pool: &SqlitePool,
    role_code: Option<&str>,
) -> AppResult<Vec<PermissionSummary>> {
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        r#"
        SELECT
            p.permission_key,
            p.permission_name,
            p.resource_type,
            p.resource_key,
            CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS granted
        FROM permissions p
        LEFT JOIN roles r ON r.role_code = ?1
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
            AND rp.permission_id = p.id
        ORDER BY p.resource_key ASC, p.permission_key ASC
        "#,
    )
    .bind(role_code)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(permission_key, permission_name, resource_type, resource_key, granted)| {
                PermissionSummary {
                    permission_key,
                    permission_name,
                    resource_type,
                    resource_key,
                    granted: granted != 0,
                }
            },
        )
        .collect())
}

pub async fn role_exists(pool: &SqlitePool, role_code: &str) -> AppResult<bool> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM roles WHERE role_code = ?1")
        .bind(role_code)
        .fetch_one(pool)
        .await?;
    Ok(count > 0)
}

pub async fn role_is_active(pool: &SqlitePool, role_code: &str) -> AppResult<bool> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM roles WHERE role_code = ?1 AND status = 'active'",
    )
    .bind(role_code)
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

pub async fn create_role(
    pool: &SqlitePool,
    role_code: &str,
    role_name: &str,
    data_scope_type: &str,
) -> AppResult<()> {
    let role_code = validate_role_code(role_code)?;
    let role_name = validate_role_name(role_name)?;
    let data_scope_type = validate_data_scope_type(data_scope_type)?;

    sqlx::query(
        r#"
        INSERT INTO roles (
            role_code,
            role_name,
            status,
            is_system,
            data_scope_type,
            data_scope_payload
        )
        VALUES (?1, ?2, 'active', 0, ?3, '{}')
        "#,
    )
    .bind(role_code)
    .bind(role_name)
    .bind(data_scope_type)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn set_role_status(pool: &SqlitePool, role_code: &str, status: &str) -> AppResult<()> {
    let role_code = validate_role_code(role_code)?;
    let status = validate_role_status(status)?;
    if is_system_role(pool, &role_code).await? {
        return Err(AppError::BadRequest(
            "系统内置角色状态不允许在页面修改".to_string(),
        ));
    }
    if !role_exists(pool, &role_code).await? {
        return Err(AppError::BadRequest("角色不存在".to_string()));
    }

    sqlx::query(
        r#"
        UPDATE roles
        SET status = ?2,
            updated_at = datetime('now')
        WHERE role_code = ?1
        "#,
    )
    .bind(role_code)
    .bind(status)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn replace_role_permissions(
    pool: &SqlitePool,
    role_code: &str,
    permission_keys: &[String],
) -> AppResult<()> {
    if is_system_role(pool, role_code).await? {
        return Err(AppError::BadRequest(
            "系统内置角色权限不允许在页面修改".to_string(),
        ));
    }
    if !role_exists(pool, role_code).await? {
        return Err(AppError::BadRequest("角色不存在".to_string()));
    }

    let mut tx = pool.begin().await?;
    for permission_key in permission_keys {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM permissions WHERE permission_key = ?1",
        )
        .bind(permission_key)
        .fetch_one(&mut *tx)
        .await?;
        if exists == 0 {
            return Err(AppError::BadRequest(format!(
                "权限点不存在：{permission_key}"
            )));
        }
    }

    sqlx::query(
        r#"
        DELETE FROM role_permissions
        WHERE role_id = (
            SELECT id
            FROM roles
            WHERE role_code = ?1
        )
        "#,
    )
    .bind(role_code)
    .execute(&mut *tx)
    .await?;

    for permission_key in permission_keys {
        sqlx::query(
            r#"
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r
            JOIN permissions p ON p.permission_key = ?2
            WHERE r.role_code = ?1
            ON CONFLICT(role_id, permission_id) DO NOTHING
            "#,
        )
        .bind(role_code)
        .bind(permission_key)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn user_has_permission(
    pool: &SqlitePool,
    user_id: i64,
    permission_key: &str,
) -> AppResult<bool> {
    let is_super_admin = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT is_super_admin FROM users WHERE id = ?1 AND status = 'active'",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .flatten()
    .unwrap_or(0);
    if is_super_admin != 0 {
        return Ok(true);
    }

    let count = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
            AND r.status = 'active'
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ?1
          AND p.permission_key = ?2
        "#,
    )
    .bind(user_id)
    .bind(permission_key)
    .fetch_one(pool)
    .await?;

    Ok(count > 0)
}

pub async fn assign_role_to_user(
    tx: &mut Transaction<'_, Sqlite>,
    user_id: i64,
    role_code: &str,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO user_roles (user_id, role_id)
        SELECT ?1, id
        FROM roles
        WHERE role_code = ?2
        ON CONFLICT(user_id, role_id) DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(role_code)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn is_system_role(pool: &SqlitePool, role_code: &str) -> AppResult<bool> {
    let is_system =
        sqlx::query_scalar::<_, Option<i64>>("SELECT is_system FROM roles WHERE role_code = ?1")
            .bind(role_code)
            .fetch_optional(pool)
            .await?
            .flatten()
            .unwrap_or(0);

    Ok(is_system != 0)
}

fn validate_role_code(role_code: &str) -> AppResult<String> {
    let role_code = role_code.trim();
    if role_code.len() < 3 || role_code.len() > 64 {
        return Err(AppError::BadRequest(
            "角色编码长度必须为 3-64 个字符".to_string(),
        ));
    }
    if !role_code
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.'))
    {
        return Err(AppError::BadRequest(
            "角色编码只能包含小写字母、数字、下划线、中划线和点".to_string(),
        ));
    }
    Ok(role_code.to_string())
}

fn validate_role_name(role_name: &str) -> AppResult<String> {
    let role_name = role_name.trim();
    if role_name.is_empty() || role_name.len() > 64 {
        return Err(AppError::BadRequest(
            "角色名称不能为空且不能超过 64 个字符".to_string(),
        ));
    }
    Ok(role_name.to_string())
}

fn validate_data_scope_type(data_scope_type: &str) -> AppResult<String> {
    let data_scope_type = data_scope_type.trim();
    if !matches!(data_scope_type, "self" | "all") {
        return Err(AppError::BadRequest(
            "数据范围只能是 self 或 all".to_string(),
        ));
    }
    Ok(data_scope_type.to_string())
}

fn validate_role_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "active" => Ok("active"),
        "disabled" => Ok("disabled"),
        _ => Err(AppError::BadRequest(
            "角色状态只能是 active 或 disabled".to_string(),
        )),
    }
}

async fn grant_all_permissions_to_system_admin(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN permissions p
        WHERE r.role_code = 'system_admin'
        ON CONFLICT(role_id, permission_id) DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn grant_member_permissions(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN permissions p ON p.permission_key IN (
            'project.view',
            'work_item.view',
            'work_item.manage'
        )
        WHERE r.role_code = 'member'
        ON CONFLICT(role_id, permission_id) DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}
