use std::{
    fs,
    path::{Path, PathBuf},
    str::FromStr,
    time::Duration,
};

use sqlx::{
    SqlitePool,
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use crate::platform::{
    config::Settings,
    error::{AppError, AppResult},
};

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn connect_pool(settings: &Settings) -> AppResult<SqlitePool> {
    ensure_sqlite_parent_dir(&settings.database_url, &settings.data_dir)?;

    let options = SqliteConnectOptions::from_str(&settings.database_url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    let max_connections = if is_memory_database(&settings.database_url) {
        1
    } else {
        5
    };

    Ok(SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect_with(options)
        .await?)
}

pub async fn run_migrations(pool: &SqlitePool) -> AppResult<()> {
    MIGRATOR.run(pool).await?;
    Ok(())
}

fn ensure_sqlite_parent_dir(database_url: &str, data_dir: &str) -> AppResult<()> {
    if is_memory_database(database_url) {
        return Ok(());
    }

    let path = sqlite_file_path(database_url).unwrap_or_else(|| PathBuf::from(data_dir));
    let parent = if path.extension().is_some() {
        path.parent().map(Path::to_path_buf)
    } else {
        Some(path)
    };

    if let Some(parent) = parent
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)?;
    }

    Ok(())
}

fn sqlite_file_path(database_url: &str) -> Option<PathBuf> {
    let without_prefix = database_url
        .strip_prefix("sqlite://")
        .or_else(|| database_url.strip_prefix("sqlite:"))?;
    let path = without_prefix.split('?').next().unwrap_or(without_prefix);
    if path.is_empty() || path == ":memory:" {
        return None;
    }
    Some(PathBuf::from(path))
}

fn is_memory_database(database_url: &str) -> bool {
    database_url == "sqlite::memory:" || database_url == "sqlite://:memory:"
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(value: sqlx::migrate::MigrateError) -> Self {
        Self::Migration(value)
    }
}
