//! 集成测试共享辅助：测试库、会话、请求发送。新测试模块优先复用这里，避免各自复制。

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, rbac},
    platform::{config::Settings, db},
};

pub const CSRF_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

pub struct Session {
    pub user_id: i64,
    pub cookie: String,
}

pub fn test_settings() -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: "sqlite::memory:".to_string(),
        data_dir: "data".to_string(),
        session_secret: "test-session-secret".to_string(),
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-2026".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        experimental_legacy_preview_enabled: false,
    }
}

pub async fn test_pool() -> sqlx::SqlitePool {
    let pool = db::connect_pool(&test_settings())
        .await
        .expect("pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

/// 文件型测试库（多连接 + WAL），用于并发测试；内存库只有一个连接，无法暴露锁竞争。
/// 返回的目录在测试结束后由调用方保留或忽略即可（位于系统临时目录）。
pub async fn test_file_pool(name: &str) -> sqlx::SqlitePool {
    let dir = std::env::temp_dir().join(format!(
        "yuance-test-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default()
    ));
    std::fs::create_dir_all(&dir).expect("temp dir should create");
    let mut settings = test_settings();
    settings.data_dir = dir.to_string_lossy().to_string();
    settings.database_url = format!("sqlite://{}/test.sqlite3", dir.to_string_lossy());
    let pool = db::connect_pool(&settings)
        .await
        .expect("file pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

pub fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
}

pub async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) -> Session {
    let result = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");
    Session {
        user_id: result.user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(
            &result.session.raw_token,
            false,
        )),
    }
}

/// 创建一个启用状态的普通用户（系统角色 `role_code`）并签发会话。
pub async fn create_user(pool: &sqlx::SqlitePool, username: &str, role_code: &str) -> Session {
    let password_hash = auth::hash_password("MemberPass2026!").expect("password should hash");
    let user_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO users (username, password_hash, display_name, status, is_super_admin) VALUES (?1, ?2, ?1, 'active', 0) RETURNING id",
    )
    .bind(username)
    .bind(password_hash)
    .fetch_one(pool)
    .await
    .expect("user should be created");
    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, user_id, role_code)
        .await
        .expect("role should assign");
    tx.commit().await.expect("tx should commit");
    let session = auth::issue_session(pool, user_id, 12 * 60 * 60)
        .await
        .expect("session should issue");
    Session {
        user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(&session.raw_token, false)),
    }
}

/// 发送 JSON 请求并解析响应体（非 JSON 时为 Null）。
pub async fn send(
    app: &axum::Router,
    method: &str,
    uri: &str,
    cookie: &str,
    body: Option<serde_json::Value>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, cookie)
        .header("x-yuance-csrf-token", CSRF_TOKEN);
    if body.is_some() {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
    }
    let request = builder
        .body(body.map_or_else(Body::empty, |value| Body::from(value.to_string())))
        .expect("request should build");
    let response = app
        .clone()
        .oneshot(request)
        .await
        .expect("router should respond");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
    )
}
