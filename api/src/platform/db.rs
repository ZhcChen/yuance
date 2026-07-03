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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_file_path_extracts_file_paths_and_strips_query() {
        assert_eq!(
            sqlite_file_path("sqlite://data/yuance.sqlite3?mode=rwc").expect("path should parse"),
            PathBuf::from("data/yuance.sqlite3")
        );
        assert_eq!(
            sqlite_file_path("sqlite:data/yuance.sqlite3").expect("path should parse"),
            PathBuf::from("data/yuance.sqlite3")
        );
        assert!(sqlite_file_path("postgres://example.test/db").is_none());
        assert!(sqlite_file_path("sqlite://:memory:").is_none());
    }

    #[test]
    fn memory_database_detection_accepts_supported_sqlite_memory_urls() {
        assert!(is_memory_database("sqlite::memory:"));
        assert!(is_memory_database("sqlite://:memory:"));
        assert!(!is_memory_database("sqlite://data/yuance.sqlite3"));
    }

    #[test]
    fn ensure_sqlite_parent_dir_creates_parent_for_file_database() {
        let root = std::env::temp_dir().join(format!(
            "yuance-db-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let database_path = root.join("nested").join("yuance.sqlite3");
        let database_url = format!("sqlite://{}", database_path.display());

        ensure_sqlite_parent_dir(&database_url, root.to_str().expect("root should be utf-8"))
            .expect("parent dir should create");

        assert!(database_path.parent().expect("path has parent").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ensure_sqlite_parent_dir_uses_data_dir_for_directory_like_url() {
        let root = std::env::temp_dir().join(format!(
            "yuance-db-dir-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let data_dir = root.join("data-dir");
        let database_url = format!("sqlite://{}", data_dir.display());

        ensure_sqlite_parent_dir(
            &database_url,
            data_dir.to_str().expect("dir should be utf-8"),
        )
        .expect("directory path should create");

        assert!(data_dir.exists());
        let _ = fs::remove_dir_all(root);
    }
}
