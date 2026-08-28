use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, projects},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

#[tokio::test]
async fn notification_feed_supports_message_center_filters_and_pagination() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");

    let work_item_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2'")
            .fetch_one(&pool)
            .await
            .expect("work item should exist");

    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id,
            actor_user_id,
            actor_display_name_snapshot,
            kind,
            work_item_id,
            comment_id,
            title,
            body
        )
        VALUES (?1, ?2, '系统管理员', 'work_item_assigned', ?3, NULL, '第一条消息', '未读指派')
        "#,
    )
    .bind(admin.user_id)
    .bind(admin.user_id)
    .bind(work_item_id)
    .execute(&pool)
    .await
    .expect("first notification should insert");

    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id,
            actor_user_id,
            actor_display_name_snapshot,
            kind,
            work_item_id,
            comment_id,
            title,
            body
        )
        VALUES (?1, ?2, '系统管理员', 'comment_mentioned', ?3, NULL, '第二条消息', '待处理讨论')
        "#,
    )
    .bind(admin.user_id)
    .bind(admin.user_id)
    .bind(work_item_id)
    .execute(&pool)
    .await
    .expect("second notification should insert");

    sqlx::query(
        r#"
        INSERT INTO notifications (
            recipient_user_id,
            actor_user_id,
            actor_display_name_snapshot,
            kind,
            work_item_id,
            comment_id,
            title,
            body,
            read_at
        )
        VALUES (?1, ?2, '系统管理员', 'comment_replied', ?3, NULL, '第三条消息', '已读讨论', '2026-07-30T00:00:00Z')
        "#,
    )
    .bind(admin.user_id)
    .bind(admin.user_id)
    .bind(work_item_id)
    .execute(&pool)
    .await
    .expect("third notification should insert");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let pending_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/notifications?filter=pending&page=1&per_page=1")
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(pending_response.status(), StatusCode::OK);
    assert_eq!(
        pending_response
            .headers()
            .get(header::CACHE_CONTROL)
            .unwrap(),
        "private, no-store"
    );
    let pending_body = response_body(pending_response).await;
    let pending_payload: serde_json::Value =
        serde_json::from_str(&pending_body).expect("pending payload should be json");
    let pending_data = pending_payload
        .get("data")
        .expect("pending payload should contain data");
    assert_eq!(
        pending_data.get("filter").and_then(|value| value.as_str()),
        Some("pending")
    );
    assert_eq!(
        pending_data.get("page").and_then(|value| value.as_i64()),
        Some(1)
    );
    assert_eq!(
        pending_data
            .get("per_page")
            .and_then(|value| value.as_i64()),
        Some(1)
    );
    assert_eq!(
        pending_data
            .get("total_items")
            .and_then(|value| value.as_i64()),
        Some(1)
    );
    assert_eq!(
        pending_data
            .get("total_pages")
            .and_then(|value| value.as_i64()),
        Some(1)
    );
    assert_eq!(
        pending_data
            .get("unread_count")
            .and_then(|value| value.as_i64()),
        Some(2)
    );
    assert_eq!(
        pending_data
            .get("pending_count")
            .and_then(|value| value.as_i64()),
        Some(1)
    );
    let pending_items = pending_data
        .get("items")
        .and_then(|value| value.as_array())
        .expect("pending items should be array");
    assert_eq!(pending_items.len(), 1);
    assert_eq!(
        pending_items[0]
            .get("kind")
            .and_then(|value| value.as_str()),
        Some("comment_mentioned")
    );

    let limited_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/notifications?limit=2")
                .header(header::COOKIE, admin.cookie.clone())
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(limited_response.status(), StatusCode::OK);
    let limited_body = response_body(limited_response).await;
    let limited_payload: serde_json::Value =
        serde_json::from_str(&limited_body).expect("limited payload should be json");
    let limited_data = limited_payload
        .get("data")
        .expect("limited payload should contain data");
    assert_eq!(
        limited_data
            .get("per_page")
            .and_then(|value| value.as_i64()),
        Some(2)
    );
    assert_eq!(
        limited_data
            .get("total_items")
            .and_then(|value| value.as_i64()),
        Some(3)
    );
    assert_eq!(
        limited_data
            .get("items")
            .and_then(|value| value.as_array())
            .expect("items should be array")
            .len(),
        2
    );

    let invalid_response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/notifications?filter=invalid")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");
    assert_eq!(invalid_response.status(), StatusCode::BAD_REQUEST);
}

struct InitializedAdmin {
    user_id: i64,
    cookie: String,
}

async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) -> InitializedAdmin {
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

    InitializedAdmin {
        user_id: result.user_id,
        cookie: auth::session_cookie_header(&result.session.raw_token, false),
    }
}

async fn response_body(response: axum::response::Response) -> String {
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    std::str::from_utf8(&body)
        .expect("body should be utf-8")
        .to_string()
}

async fn test_pool() -> sqlx::SqlitePool {
    let settings = test_settings();
    let pool = db::connect_pool(&settings)
        .await
        .expect("pool should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    pool
}

fn test_settings() -> Settings {
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
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}
