use crate::{
    app::SeedCommand,
    domains::{auth, bootstrap, projects, rbac},
    platform::{
        config::Settings,
        db,
        error::{AppError, AppResult},
    },
};

pub async fn run(command: SeedCommand) -> AppResult<()> {
    let settings = Settings::from_env()?;

    match command {
        SeedCommand::Core => {
            let pool = migrated_pool(&settings).await?;
            rbac::seed_core(&pool).await?;
            println!("core seed applied");
        }
        SeedCommand::Demo => {
            ensure_local_seed_allowed(&settings)?;
            let pool = migrated_pool(&settings).await?;
            rbac::seed_core(&pool).await?;
            let user_id = upsert_local_admin(&pool).await?;
            bootstrap::ensure_completed_by_local_admin(&pool, user_id).await?;
            let result = projects::seed_demo_data(&pool, user_id).await?;
            println!(
                "demo seed applied: projects={} work_items={}",
                result.project_count, result.work_item_count
            );
        }
        SeedCommand::LocalAdmin => {
            ensure_local_seed_allowed(&settings)?;
            let pool = migrated_pool(&settings).await?;
            rbac::seed_core(&pool).await?;
            let user_id = upsert_local_admin(&pool).await?;
            bootstrap::ensure_completed_by_local_admin(&pool, user_id).await?;
            println!("local-admin seed applied");
            println!("username: yuance_admin");
            println!("password: Yuance@2026Dev!");
        }
    }

    Ok(())
}

fn ensure_local_seed_allowed(settings: &Settings) -> AppResult<()> {
    if settings.allows_local_seed() {
        return Ok(());
    }

    Err(AppError::InvalidEnvironment(format!(
        "seed 仅允许 development / test / local，当前 YUANCE_ENV={}",
        settings.env
    )))
}

async fn migrated_pool(settings: &Settings) -> AppResult<sqlx::SqlitePool> {
    let pool = db::connect_pool(settings).await?;
    db::run_migrations(&pool).await?;
    Ok(pool)
}

async fn upsert_local_admin(pool: &sqlx::SqlitePool) -> AppResult<i64> {
    let password_hash = auth::hash_password("Yuance@2026Dev!")?;

    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (
            username,
            password_hash,
            display_name,
            status,
            is_super_admin
        )
        VALUES (
            'yuance_admin',
            ?1,
            '元策开发管理员',
            'active',
            1
        )
        ON CONFLICT(username) DO UPDATE SET
            password_hash = excluded.password_hash,
            display_name = excluded.display_name,
            status = 'active',
            is_super_admin = 1,
            password_changed_at = datetime('now'),
            updated_at = datetime('now')
        RETURNING id
        "#,
    )
    .bind(password_hash)
    .fetch_one(pool)
    .await?;

    let mut tx = pool.begin().await?;
    rbac::assign_role_to_user(&mut tx, user_id, "system_admin").await?;
    tx.commit().await?;

    Ok(user_id)
}
