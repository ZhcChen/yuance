use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    domains::{auth, rbac},
    platform::error::{AppError, AppResult},
};

#[derive(Debug, Clone)]
pub struct BootstrapInitInput {
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub password_confirm: String,
}

#[derive(Debug, Clone)]
pub struct BootstrapInitResult {
    pub user_id: i64,
    pub session: auth::IssuedSession,
}

pub async fn bootstrap_required(pool: &SqlitePool) -> AppResult<bool> {
    let completed = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT completed
        FROM app_bootstrap
        WHERE bootstrap_key = 'system'
        "#,
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(0);

    Ok(completed == 0)
}

pub async fn bootstrap_init(
    pool: &SqlitePool,
    input: BootstrapInitInput,
) -> AppResult<BootstrapInitResult> {
    let username = auth::validate_username(&input.username)?;
    let display_name = auth::validate_display_name(&input.display_name)?;
    auth::validate_password(&input.password)?;
    if input.password != input.password_confirm {
        return Err(AppError::BadRequest("两次输入的密码不一致".to_string()));
    }
    let password_hash = auth::hash_password(&input.password)?;

    rbac::seed_core(pool).await?;

    let mut tx = pool.begin().await?;
    ensure_bootstrap_row(&mut tx).await?;

    let completed = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT completed
        FROM app_bootstrap
        WHERE bootstrap_key = 'system'
        "#,
    )
    .fetch_one(&mut *tx)
    .await?;
    if completed != 0 {
        return Err(AppError::Conflict("系统管理员已完成初始化".to_string()));
    }

    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (
            username,
            password_hash,
            display_name,
            status,
            is_super_admin
        )
        VALUES (?1, ?2, ?3, 'active', 1)
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(&mut *tx)
    .await?;

    rbac::assign_role_to_user(&mut tx, user_id, "system_admin").await?;

    sqlx::query(
        r#"
        UPDATE app_bootstrap
        SET completed = 1,
            completed_at = datetime('now'),
            completed_by_user_id = ?1,
            updated_at = datetime('now')
        WHERE bootstrap_key = 'system'
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let session = auth::issue_session(pool, user_id, 12 * 60 * 60).await?;

    Ok(BootstrapInitResult { user_id, session })
}

pub async fn ensure_completed_by_local_admin(pool: &SqlitePool, user_id: i64) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO app_bootstrap (
            bootstrap_key,
            completed,
            completed_at,
            completed_by_user_id
        )
        VALUES ('system', 1, datetime('now'), ?1)
        ON CONFLICT(bootstrap_key) DO UPDATE SET
            completed = 1,
            completed_at = COALESCE(app_bootstrap.completed_at, datetime('now')),
            completed_by_user_id = COALESCE(app_bootstrap.completed_by_user_id, excluded.completed_by_user_id),
            updated_at = datetime('now')
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn ensure_bootstrap_row(tx: &mut Transaction<'_, Sqlite>) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO app_bootstrap (bootstrap_key, completed)
        VALUES ('system', 0)
        ON CONFLICT(bootstrap_key) DO NOTHING
        "#,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}
