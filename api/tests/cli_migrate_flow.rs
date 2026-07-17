use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{SystemTime, UNIX_EPOCH},
};

use yuance_api::platform::{config::Settings, db};

#[test]
fn migrate_create_generates_normalized_placeholder_file() {
    let root = temp_root("migrate-create");

    let output = Command::new(env!("CARGO_BIN_EXE_yuance-api"))
        .arg("migrate")
        .arg("create")
        .arg("Add User Audit!")
        .current_dir(&root)
        .output()
        .expect("migrate create command should run");

    assert!(output.status.success(), "stderr: {}", stderr(&output));
    assert!(stdout(&output).contains("created api/migrations/"));

    let migrations_dir = root.join("api/migrations");
    let entries = fs::read_dir(&migrations_dir)
        .expect("migrations dir should exist")
        .collect::<Result<Vec<_>, _>>()
        .expect("migration entries should read");
    assert_eq!(entries.len(), 1);

    let path = entries[0].path();
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .expect("filename should be utf-8");
    assert!(filename.ends_with("_add_user_audit.sql"));
    assert_eq!(
        fs::read_to_string(path).expect("migration file should read"),
        "-- Add migration SQL here.\n"
    );

    cleanup(root);
}

#[tokio::test]
async fn migrate_status_and_up_report_and_apply_all_migrations() {
    let root = temp_root("migrate-up");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let total = migration_total();

    let initial_status = run_migrate(&root, &database_url, &["status"]);
    assert!(
        initial_status.status.success(),
        "stderr: {}",
        stderr(&initial_status)
    );
    let initial_stdout = stdout(&initial_status);
    assert!(initial_stdout.contains(&format!("migrations: applied=0 total={total}")));
    assert!(initial_stdout.contains("202606260001"));

    let up = run_migrate(&root, &database_url, &["up"]);
    assert!(up.status.success(), "stderr: {}", stderr(&up));
    assert!(stdout(&up).contains("migrations applied"));
    assert_eq!(applied_count(&root, &database_url).await, total);
    assert!(table_exists(&root, &database_url, "users").await);
    assert!(table_exists(&root, &database_url, "work_items").await);
    assert!(table_exists(&root, &database_url, "file_objects").await);

    let final_status = run_migrate(&root, &database_url, &["status"]);
    assert!(
        final_status.status.success(),
        "stderr: {}",
        stderr(&final_status)
    );
    assert!(stdout(&final_status).contains(&format!("migrations: applied={total} total={total}")));

    cleanup(root);
}

#[tokio::test]
async fn migrate_up_to_applies_only_requested_version() {
    let root = temp_root("migrate-up-to");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let first_version = db::MIGRATOR
        .iter()
        .map(|migration| migration.version)
        .min()
        .expect("at least one migration should exist");

    let up_to = run_migrate(&root, &database_url, &["up-to", &first_version.to_string()]);
    assert!(up_to.status.success(), "stderr: {}", stderr(&up_to));
    assert!(stdout(&up_to).contains(&format!("migrations applied to {first_version}")));
    assert_eq!(applied_count(&root, &database_url).await, 1);
    assert!(table_exists(&root, &database_url, "users").await);
    assert!(!table_exists(&root, &database_url, "work_items").await);

    let status = run_migrate(&root, &database_url, &["status"]);
    assert!(status.status.success(), "stderr: {}", stderr(&status));
    assert!(stdout(&status).contains(&format!(
        "migrations: applied=1 total={}",
        migration_total()
    )));

    cleanup(root);
}

#[tokio::test]
async fn migrate_status_rejects_checksum_drift() {
    let root = temp_root("migrate-checksum-drift");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let up = run_migrate(&root, &database_url, &["up"]);
    assert!(up.status.success(), "stderr: {}", stderr(&up));

    corrupt_first_migration_checksum(&root, &database_url).await;

    let status = run_migrate(&root, &database_url, &["status"]);
    assert!(!status.status.success());
    assert!(stderr(&status).contains("checksum 不一致"));

    cleanup(root);
}

#[tokio::test]
async fn migrate_status_rejects_failed_migration_rows() {
    let root = temp_root("migrate-failed-row");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let up = run_migrate(&root, &database_url, &["up"]);
    assert!(up.status.success(), "stderr: {}", stderr(&up));

    mark_first_migration_failed(&root, &database_url).await;

    let status = run_migrate(&root, &database_url, &["status"]);
    assert!(!status.status.success());
    assert!(stderr(&status).contains("检测到失败迁移"));

    cleanup(root);
}

#[tokio::test]
async fn migrate_status_rejects_unknown_applied_versions() {
    let root = temp_root("migrate-unknown-version");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let up = run_migrate(&root, &database_url, &["up"]);
    assert!(up.status.success(), "stderr: {}", stderr(&up));

    insert_unknown_migration(&root, &database_url).await;

    let status = run_migrate(&root, &database_url, &["status"]);
    assert!(!status.status.success());
    assert!(stderr(&status).contains("未知的迁移"));

    cleanup(root);
}

fn run_migrate(root: &Path, database_url: &str, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_yuance-api"));
    command.arg("migrate");
    for arg in args {
        command.arg(arg);
    }
    command
        .current_dir(root)
        .env("YUANCE_DATABASE_URL", database_url)
        .env("YUANCE_DATA_DIR", root.join("data"))
        .env("YUANCE_ENV", "test")
        .env("YUANCE_SESSION_SECRET", "cli-test-session-secret")
        .env("YUANCE_SECURITY_MASTER_KEY", "cli-test-master-key-2026")
        .env("YUANCE_LOG_LEVEL", "off")
        .output()
        .expect("migrate command should run")
}

async fn applied_count(root: &Path, database_url: &str) -> i64 {
    let pool = db::connect_pool(&settings(root, database_url))
        .await
        .expect("database should connect");
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .expect("migration count should load");
    pool.close().await;
    count
}

async fn table_exists(root: &Path, database_url: &str, table_name: &str) -> bool {
    let pool = db::connect_pool(&settings(root, database_url))
        .await
        .expect("database should connect");
    let exists = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?1
        "#,
    )
    .bind(table_name)
    .fetch_one(&pool)
    .await
    .expect("table existence should load");
    pool.close().await;
    exists > 0
}

async fn corrupt_first_migration_checksum(root: &Path, database_url: &str) {
    let pool = db::connect_pool(&settings(root, database_url))
        .await
        .expect("database should connect");
    let first_version = first_migration_version();
    sqlx::query("UPDATE _sqlx_migrations SET checksum = x'00' WHERE version = ?1")
        .bind(first_version)
        .execute(&pool)
        .await
        .expect("checksum should update");
    pool.close().await;
}

async fn mark_first_migration_failed(root: &Path, database_url: &str) {
    let pool = db::connect_pool(&settings(root, database_url))
        .await
        .expect("database should connect");
    let first_version = first_migration_version();
    sqlx::query("UPDATE _sqlx_migrations SET success = 0 WHERE version = ?1")
        .bind(first_version)
        .execute(&pool)
        .await
        .expect("migration success flag should update");
    pool.close().await;
}

async fn insert_unknown_migration(root: &Path, database_url: &str) {
    let pool = db::connect_pool(&settings(root, database_url))
        .await
        .expect("database should connect");
    sqlx::query(
        r#"
        INSERT INTO _sqlx_migrations (
            version,
            description,
            success,
            checksum,
            execution_time
        )
        VALUES (999999999999, 'future migration', 1, x'00', 0)
        "#,
    )
    .execute(&pool)
    .await
    .expect("unknown migration should insert");
    pool.close().await;
}

fn first_migration_version() -> i64 {
    db::MIGRATOR
        .iter()
        .map(|migration| migration.version)
        .min()
        .expect("at least one migration should exist")
}

fn migration_total() -> i64 {
    db::MIGRATOR.iter().count() as i64
}

fn settings(root: &Path, database_url: &str) -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: database_url.to_string(),
        data_dir: root.join("data").display().to_string(),
        session_secret: "cli-test-session-secret".to_string(),
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "cli-test-master-key-2026".to_string(),
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
    }
}

fn temp_root(name: &str) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be valid")
        .as_nanos();
    let root =
        std::env::temp_dir().join(format!("yuance-{name}-{}-{timestamp}", std::process::id()));
    fs::create_dir_all(&root).expect("temp root should create");
    root
}

fn database_url(path: &Path) -> String {
    format!("sqlite://{}", path.display())
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

fn cleanup(root: PathBuf) {
    let _ = fs::remove_dir_all(root);
}
