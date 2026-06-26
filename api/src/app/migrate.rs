use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{
    app::MigrateCommand,
    platform::{config::Settings, db, error::AppResult},
};

pub async fn run(command: MigrateCommand) -> AppResult<()> {
    match command {
        MigrateCommand::Status => {
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            let applied = applied_count(&pool).await?;
            let total = db::MIGRATOR.iter().count();
            println!("migrations: applied={applied} total={total}");
            for migration in db::MIGRATOR.iter() {
                println!("{} {}", migration.version, migration.description);
            }
        }
        MigrateCommand::Up => {
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            db::run_migrations(&pool).await?;
            println!("migrations applied");
        }
        MigrateCommand::UpTo { version } => {
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            db::MIGRATOR.run_to(version, &pool).await?;
            println!("migrations applied to {version}");
        }
        MigrateCommand::Create { name } => {
            let path = create_migration_file(&name)?;
            println!("created {}", path.display());
        }
    }

    Ok(())
}

async fn applied_count(pool: &sqlx::SqlitePool) -> AppResult<i64> {
    let exists = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM sqlite_master
        WHERE type = 'table'
          AND name = '_sqlx_migrations'
        "#,
    )
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        return Ok(0);
    }

    Ok(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(pool)
            .await?,
    )
}

fn create_migration_file(name: &str) -> AppResult<PathBuf> {
    fs::create_dir_all("api/migrations")?;
    let normalized = normalize_name(name);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let path = PathBuf::from(format!("api/migrations/{timestamp}_{normalized}.sql"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?;
    writeln!(file, "-- Add migration SQL here.")?;
    Ok(path)
}

fn normalize_name(name: &str) -> String {
    let normalized = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    let normalized = normalized.trim_matches('_');
    if normalized.is_empty() {
        "migration".to_string()
    } else {
        normalized.to_string()
    }
}
