use std::{
    ffi::OsString,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{
    app::MigrateCommand,
    platform::{
        config::Settings,
        db,
        error::{AppError, AppResult},
    },
};

pub async fn run(command: MigrateCommand) -> AppResult<()> {
    match command {
        MigrateCommand::Status => {
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            validate_migration_state(&pool).await?;
            let applied = applied_count(&pool).await?;
            let total = db::MIGRATOR.iter().count();
            println!("migrations: applied={applied} total={total}");
            println!("migration state: ok");
            for migration in db::MIGRATOR.iter() {
                println!("{} {}", migration.version, migration.description);
            }
        }
        MigrateCommand::Up => {
            let migration_started_marker = parse_migration_started_marker(std::env::var_os(
                "YUANCE_MIGRATION_STARTED_MARKER",
            ))?;
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            validate_migration_state(&pool).await?;
            write_migration_started_marker(migration_started_marker.as_deref())?;
            db::run_migrations(&pool).await?;
            println!("migrations applied");
        }
        MigrateCommand::UpTo { version } => {
            let migration_started_marker = parse_migration_started_marker(std::env::var_os(
                "YUANCE_MIGRATION_STARTED_MARKER",
            ))?;
            let settings = Settings::from_env()?;
            let pool = db::connect_pool(&settings).await?;
            validate_migration_state(&pool).await?;
            write_migration_started_marker(migration_started_marker.as_deref())?;
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

fn parse_migration_started_marker(value: Option<OsString>) -> AppResult<Option<PathBuf>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value
        .into_string()
        .map_err(|_| AppError::Config("迁移开始标记路径无效".to_string()))?;
    let path = PathBuf::from(value);
    let name = path.file_name().and_then(|name| name.to_str());
    let valid_name = name
        .and_then(|name| {
            name.strip_prefix(".yuance-api-maintenance-")
                .and_then(|name| name.strip_suffix(".migration-started"))
        })
        .is_some_and(|name| {
            !name.is_empty()
                && name.bytes().any(|byte| byte.is_ascii_digit())
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || byte == b'-')
        });
    if path.parent() != Some(Path::new("/data")) || !valid_name {
        return Err(AppError::Config("迁移开始标记路径无效".to_string()));
    }
    Ok(Some(path))
}

fn write_migration_started_marker(path: Option<&Path>) -> AppResult<()> {
    let Some(path) = path else {
        return Ok(());
    };
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(b"started\n")?;
    file.sync_all()?;
    Ok(())
}

async fn validate_migration_state(pool: &sqlx::SqlitePool) -> AppResult<()> {
    if !migration_table_exists(pool).await? {
        return Ok(());
    }

    let failed_version = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT version
        FROM _sqlx_migrations
        WHERE success = 0
        ORDER BY version
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    if let Some(version) = failed_version {
        return Err(AppError::MigrationState(format!(
            "检测到失败迁移 version={version}，请先修复数据库状态后再继续"
        )));
    }

    let applied = sqlx::query_as::<_, (i64, Vec<u8>)>(
        r#"
        SELECT version, checksum
        FROM _sqlx_migrations
        ORDER BY version
        "#,
    )
    .fetch_all(pool)
    .await?;

    for (version, checksum) in applied {
        let Some(expected) = db::MIGRATOR
            .iter()
            .find(|migration| migration.version == version)
        else {
            return Err(AppError::MigrationState(format!(
                "数据库存在当前二进制未知的迁移 version={version}"
            )));
        };

        if checksum.as_slice() != expected.checksum.as_ref() {
            return Err(AppError::MigrationState(format!(
                "已应用迁移 checksum 不一致 version={version}，迁移文件可能已被修改"
            )));
        }
    }

    Ok(())
}

async fn applied_count(pool: &sqlx::SqlitePool) -> AppResult<i64> {
    if !migration_table_exists(pool).await? {
        return Ok(0);
    }

    Ok(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(pool)
            .await?,
    )
}

async fn migration_table_exists(pool: &sqlx::SqlitePool) -> AppResult<bool> {
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

    Ok(exists > 0)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_started_marker_requires_a_safe_data_path() {
        let valid = parse_migration_started_marker(Some(OsString::from(
            "/data/.yuance-api-maintenance-20261010123456-12345.migration-started",
        )))
        .expect("valid marker path should be accepted");
        assert_eq!(
            valid,
            Some(PathBuf::from(
                "/data/.yuance-api-maintenance-20261010123456-12345.migration-started"
            ))
        );
        assert!(
            parse_migration_started_marker(None)
                .expect("missing marker should be allowed")
                .is_none()
        );
        for path in [
            "/tmp/.yuance-api-maintenance-20261010123456.migration-started",
            "/data/../tmp/.yuance-api-maintenance-20261010123456.migration-started",
            "/data/.yuance-api-maintenance-anything.migration-started",
        ] {
            assert!(parse_migration_started_marker(Some(OsString::from(path))).is_err());
        }
    }

    #[test]
    fn migration_started_marker_is_created_exclusively() {
        let path = std::env::temp_dir().join(format!(
            "yuance-migration-started-test-{}.marker",
            uuid::Uuid::new_v4()
        ));
        write_migration_started_marker(Some(&path)).expect("marker should be created");
        assert_eq!(fs::read(&path).expect("marker should read"), b"started\n");
        assert!(write_migration_started_marker(Some(&path)).is_err());
        fs::remove_file(path).expect("marker should be removed");
        write_migration_started_marker(None).expect("disabled marker should be a no-op");
    }
}
