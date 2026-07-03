use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{SystemTime, UNIX_EPOCH},
};

use yuance_api::{
    domains::auth,
    platform::{config::Settings, db},
};

#[test]
fn local_admin_seed_is_rejected_in_production() {
    let root = temp_root("local-admin-production");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let output = run_local_admin_seed(&root, &database_url, "production");

    assert!(!output.status.success());
    assert!(!database_path.exists());
    assert!(!stdout(&output).contains("Yuance@2026Dev!"));
    assert!(stderr(&output).contains("seed 仅允许 development / test / local"));

    cleanup(root);
}

#[tokio::test]
async fn local_admin_seed_creates_usable_super_admin_in_development() {
    let root = temp_root("local-admin-development");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let output = run_local_admin_seed(&root, &database_url, "development");

    assert!(output.status.success(), "stderr: {}", stderr(&output));
    assert!(stdout(&output).contains("local-admin seed applied"));
    assert!(stdout(&output).contains("username: yuance_admin"));
    assert!(stdout(&output).contains("password: Yuance@2026Dev!"));

    let pool = db::connect_pool(&settings(&root, &database_url, "test"))
        .await
        .expect("seeded database should connect");
    let admin = sqlx::query_as::<_, (i64, String, i64)>(
        r#"
        SELECT id, display_name, is_super_admin
        FROM users
        WHERE username = 'yuance_admin'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("local admin should exist");
    assert_eq!(admin.1, "元策开发管理员");
    assert_eq!(admin.2, 1);

    let completed = sqlx::query_scalar::<_, i64>(
        "SELECT completed FROM app_bootstrap WHERE bootstrap_key = 'system'",
    )
    .fetch_one(&pool)
    .await
    .expect("bootstrap state should exist");
    assert_eq!(completed, 1);

    let role_code = sqlx::query_scalar::<_, String>(
        r#"
        SELECT r.role_code
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?1
        "#,
    )
    .bind(admin.0)
    .fetch_one(&pool)
    .await
    .expect("local admin role should exist");
    assert_eq!(role_code, "system_admin");

    auth::login(&pool, "yuance_admin", "Yuance@2026Dev!")
        .await
        .expect("local admin password should be usable");

    pool.close().await;
    cleanup(root);
}

fn run_local_admin_seed(root: &Path, database_url: &str, env: &str) -> Output {
    Command::new(env!("CARGO_BIN_EXE_yuance-api"))
        .arg("seed")
        .arg("local-admin")
        .current_dir(root)
        .env("YUANCE_DATABASE_URL", database_url)
        .env("YUANCE_DATA_DIR", root.join("data"))
        .env("YUANCE_ENV", env)
        .env("YUANCE_SESSION_SECRET", "cli-test-session-secret")
        .env("YUANCE_SECURITY_MASTER_KEY", "cli-test-master-key-2026")
        .env("YUANCE_LOG_LEVEL", "off")
        .output()
        .expect("seed command should run")
}

fn settings(root: &Path, database_url: &str, env: &str) -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: database_url.to_string(),
        data_dir: root.join("data").display().to_string(),
        session_secret: "cli-test-session-secret".to_string(),
        session_ttl: "12h".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: env.to_string(),
        security_master_key: "cli-test-master-key-2026".to_string(),
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
