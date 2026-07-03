use sqlx::SqlitePool;

use crate::{
    domains::{auth, rbac},
    platform::error::{AppError, AppResult},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserSummary {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub mobile: String,
    pub status: String,
    pub is_super_admin: bool,
    pub role_code: String,
    pub role_names: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct CreateUserInput {
    pub username: String,
    pub display_name: String,
    pub email: String,
    pub mobile: String,
    pub password: String,
    pub role_code: String,
}

#[derive(Debug, Clone)]
pub struct UpdateOwnProfileInput {
    pub display_name: String,
    pub email: String,
    pub mobile: String,
}

pub async fn list_users(pool: &SqlitePool) -> AppResult<Vec<UserSummary>> {
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
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.mobile,
            u.status,
            u.is_super_admin,
            COALESCE(GROUP_CONCAT(r.role_code, ' / '), '') AS role_codes,
            COALESCE(GROUP_CONCAT(r.role_name, ' / '), '') AS role_names,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                username,
                display_name,
                email,
                mobile,
                status,
                is_super_admin,
                role_code,
                role_names,
                created_at,
                updated_at,
            )| UserSummary {
                id,
                username,
                display_name,
                email,
                mobile,
                status,
                is_super_admin: is_super_admin != 0,
                role_code,
                role_names,
                created_at,
                updated_at,
            },
        )
        .collect())
}

pub async fn get_user_summary(pool: &SqlitePool, user_id: i64) -> AppResult<Option<UserSummary>> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.mobile,
            u.status,
            u.is_super_admin,
            COALESCE(GROUP_CONCAT(r.role_code, ' / '), '') AS role_codes,
            COALESCE(GROUP_CONCAT(r.role_name, ' / '), '') AS role_names,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = ?1
        GROUP BY u.id
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            username,
            display_name,
            email,
            mobile,
            status,
            is_super_admin,
            role_code,
            role_names,
            created_at,
            updated_at,
        )| UserSummary {
            id,
            username,
            display_name,
            email,
            mobile,
            status,
            is_super_admin: is_super_admin != 0,
            role_code,
            role_names,
            created_at,
            updated_at,
        },
    ))
}

pub async fn get_user_summary_by_username(
    pool: &SqlitePool,
    username: &str,
) -> AppResult<Option<UserSummary>> {
    let username = auth::validate_username(username)?;
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            String,
            String,
            String,
            i64,
            String,
            String,
            String,
            String,
        ),
    >(
        r#"
        SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.mobile,
            u.status,
            u.is_super_admin,
            COALESCE(GROUP_CONCAT(r.role_code, ' / '), '') AS role_codes,
            COALESCE(GROUP_CONCAT(r.role_name, ' / '), '') AS role_names,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.username = ?1
        GROUP BY u.id
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            username,
            display_name,
            email,
            mobile,
            status,
            is_super_admin,
            role_code,
            role_names,
            created_at,
            updated_at,
        )| UserSummary {
            id,
            username,
            display_name,
            email,
            mobile,
            status,
            is_super_admin: is_super_admin != 0,
            role_code,
            role_names,
            created_at,
            updated_at,
        },
    ))
}

pub async fn create_user(pool: &SqlitePool, input: CreateUserInput) -> AppResult<i64> {
    let username = auth::validate_username(&input.username)?;
    let display_name = auth::validate_display_name(&input.display_name)?;
    auth::validate_password(&input.password)?;
    let role_code = input.role_code.trim();
    if role_code.is_empty() {
        return Err(AppError::BadRequest("必须选择用户角色".to_string()));
    }
    if !rbac::role_is_active(pool, role_code).await? {
        return Err(AppError::BadRequest("用户角色不存在".to_string()));
    }
    if username_exists(pool, &username).await? {
        return Err(AppError::Conflict("用户名已存在".to_string()));
    }
    let email = validate_email(&input.email)?;
    let mobile = validate_mobile(&input.mobile)?;

    let password_hash = auth::hash_password(&input.password)?;
    let mut tx = pool.begin().await?;
    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (
            username,
            password_hash,
            display_name,
            email,
            mobile,
            status,
            is_super_admin
        )
        VALUES (?1, ?2, ?3, ?4, ?5, 'active', 0)
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .bind(email)
    .bind(mobile)
    .fetch_one(&mut *tx)
    .await?;

    rbac::assign_role_to_user(&mut tx, user_id, role_code).await?;
    tx.commit().await?;

    Ok(user_id)
}

pub async fn update_own_profile(
    pool: &SqlitePool,
    user_id: i64,
    input: UpdateOwnProfileInput,
) -> AppResult<UserSummary> {
    let display_name = auth::validate_display_name(&input.display_name)?;
    let email = validate_email(&input.email)?;
    let mobile = validate_mobile(&input.mobile)?;

    sqlx::query(
        r#"
        UPDATE users
        SET display_name = ?2,
            email = ?3,
            mobile = ?4,
            updated_at = datetime('now')
        WHERE id = ?1
          AND status = 'active'
        "#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(email)
    .bind(mobile)
    .execute(pool)
    .await?;

    get_user_summary(pool, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))
}

pub async fn change_own_password(
    pool: &SqlitePool,
    user_id: i64,
    current_password: &str,
    new_password: &str,
    current_raw_session: &str,
) -> AppResult<()> {
    auth::validate_password(new_password)?;
    let password_hash = sqlx::query_scalar::<_, String>(
        "SELECT password_hash FROM users WHERE id = ?1 AND status = 'active'",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Unauthorized)?;
    if !auth::verify_password(current_password, &password_hash)? {
        return Err(AppError::BadRequest("当前密码不正确".to_string()));
    }

    let new_password_hash = auth::hash_password(new_password)?;
    let current_token_hash = auth::hash_session_token(current_raw_session);
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = ?2,
            password_changed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(user_id)
    .bind(new_password_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        UPDATE sessions
        SET session_status = 'revoked',
            revoked_at = datetime('now'),
            revoke_reason = 'self_password_change',
            updated_at = datetime('now')
        WHERE user_id = ?1
          AND session_status = 'active'
          AND session_token_hash <> ?2
        "#,
    )
    .bind(user_id)
    .bind(current_token_hash)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(())
}

pub async fn replace_user_role(
    pool: &SqlitePool,
    username: &str,
    role_code: &str,
) -> AppResult<()> {
    let username = auth::validate_username(username)?;
    let role_code = role_code.trim();
    if role_code.is_empty() {
        return Err(AppError::BadRequest("必须选择用户角色".to_string()));
    }
    if !rbac::role_is_active(pool, role_code).await? {
        return Err(AppError::BadRequest("用户角色不存在".to_string()));
    }
    let (user_id, is_super_admin) = find_user_id_and_super_admin(pool, &username).await?;
    if is_super_admin && role_code != "system_admin" {
        return Err(AppError::BadRequest(
            "超级管理员必须保留系统管理员角色".to_string(),
        ));
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM user_roles WHERE user_id = ?1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    rbac::assign_role_to_user(&mut tx, user_id, role_code).await?;
    tx.commit().await?;

    Ok(())
}

pub async fn reset_user_password(
    pool: &SqlitePool,
    username: &str,
    password: &str,
) -> AppResult<()> {
    let username = auth::validate_username(username)?;
    auth::validate_password(password)?;
    let (user_id, _is_super_admin) = find_user_id_and_super_admin(pool, &username).await?;
    let password_hash = auth::hash_password(password)?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = ?2,
            password_changed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
    )
    .bind(user_id)
    .bind(password_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        UPDATE sessions
        SET session_status = 'revoked',
            revoked_at = datetime('now'),
            revoke_reason = 'password_reset',
            updated_at = datetime('now')
        WHERE user_id = ?1
          AND session_status = 'active'
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(())
}

pub async fn set_user_status(pool: &SqlitePool, username: &str, status: &str) -> AppResult<()> {
    let username = auth::validate_username(username)?;
    let status = validate_user_status(status)?;
    let (_user_id, is_super_admin) = find_user_id_and_super_admin(pool, &username).await?;

    if is_super_admin && status != "active" {
        return Err(AppError::BadRequest(
            "超级管理员不能在页面中禁用".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE users
        SET status = ?2,
            updated_at = datetime('now')
        WHERE username = ?1
        "#,
    )
    .bind(username)
    .bind(status)
    .execute(pool)
    .await?;

    Ok(())
}

async fn username_exists(pool: &SqlitePool, username: &str) -> AppResult<bool> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = ?1")
        .bind(username)
        .fetch_one(pool)
        .await?;
    Ok(count > 0)
}

async fn find_user_id_and_super_admin(pool: &SqlitePool, username: &str) -> AppResult<(i64, bool)> {
    let row =
        sqlx::query_as::<_, (i64, i64)>("SELECT id, is_super_admin FROM users WHERE username = ?1")
            .bind(username)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::BadRequest("用户不存在".to_string()))?;

    Ok((row.0, row.1 != 0))
}

fn validate_email(email: &str) -> AppResult<String> {
    let email = email.trim();
    if email.is_empty() {
        return Ok(String::new());
    }
    if email.len() > 128 || !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err(AppError::BadRequest("邮箱格式无效".to_string()));
    }
    Ok(email.to_string())
}

fn validate_mobile(mobile: &str) -> AppResult<String> {
    let mobile = mobile.trim();
    if mobile.is_empty() {
        return Ok(String::new());
    }
    if mobile.len() > 32
        || !mobile
            .chars()
            .all(|char| char.is_ascii_digit() || matches!(char, '+' | '-' | ' '))
    {
        return Err(AppError::BadRequest("手机号格式无效".to_string()));
    }
    Ok(mobile.to_string())
}

fn validate_user_status(status: &str) -> AppResult<&'static str> {
    match status.trim() {
        "active" => Ok("active"),
        "disabled" => Ok("disabled"),
        "locked" => Ok("locked"),
        _ => Err(AppError::BadRequest(
            "用户状态只能是 active / disabled / locked".to_string(),
        )),
    }
}
