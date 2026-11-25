//! 登录与资料解锁的失败限流、用户名枚举时间差（体检 P1-6 / FR-010）。

use std::time::{Duration, Instant};

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use tower::ServiceExt;
use yuance_api::{
    domains::projects,
    web::router::{AppState, build_router},
};

use crate::support::{bootstrap_admin_session, send, test_pool, test_settings};

async fn api_login(app: &axum::Router, username: &str, password: &str) -> StatusCode {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/auth/login")
                .header(header::CONTENT_TYPE, "application/json")
                .header("x-forwarded-for", "203.0.113.7")
                .body(Body::from(
                    serde_json::json!({ "username": username, "password": password }).to_string(),
                ))
                .expect("request should build"),
        )
        .await
        .expect("router should respond")
        .status()
}

#[tokio::test]
async fn login_is_rate_limited_per_username_after_repeated_failures() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    crate::support::create_user(&pool, "other_user", "member").await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    // 成功登录会清零：先失败几次再成功，不应累计到上限。
    for _ in 0..5 {
        assert_eq!(
            api_login(&app, "admin", "wrong-password").await,
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        api_login(&app, "admin", "AdminPass2026!").await,
        StatusCode::OK
    );

    for _ in 0..10 {
        assert_eq!(
            api_login(&app, "ADMIN", "wrong-password").await,
            StatusCode::UNAUTHORIZED
        );
    }
    // 达到上限后，即使密码正确也拒绝（不做密码校验），返回 429。
    assert_eq!(
        api_login(&app, "admin", "AdminPass2026!").await,
        StatusCode::TOO_MANY_REQUESTS
    );
    // 其他用户不受影响。
    assert_eq!(
        api_login(&app, "other_user", "MemberPass2026!").await,
        StatusCode::OK
    );
}

#[tokio::test]
async fn resource_unlock_is_rate_limited_per_user_and_resource() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let (status, created) = send(
        &app,
        "POST",
        "/api/v1/projects/YCE/resources",
        &admin.cookie,
        Some(serde_json::json!({
            "title": "限流资料", "category": "other", "body": "<p>正文</p>", "body_format": "html",
            "access_password": "Secret2026!", "tags": []
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let resource_id = created["data"]["id"].as_i64().expect("resource id");
    let uri = format!("/api/v1/projects/YCE/resources/{resource_id}/unlock");

    for _ in 0..10 {
        let (status, _) = send(
            &app,
            "POST",
            &uri,
            &admin.cookie,
            Some(serde_json::json!({ "access_password": "wrong" })),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
    let (status, body) = send(
        &app,
        "POST",
        &uri,
        &admin.cookie,
        Some(serde_json::json!({ "access_password": "Secret2026!" })),
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS, "{body}");
}

#[tokio::test]
async fn unknown_username_costs_a_password_verification_like_a_wrong_password() {
    let pool = test_pool().await;
    bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    // 预热假哈希（首次使用时生成）。
    api_login(&app, "warmup_missing_user", "x").await;

    let measure = |username: &'static str| {
        let app = app.clone();
        async move {
            let mut total = Duration::ZERO;
            for _ in 0..3 {
                let started = Instant::now();
                assert_eq!(
                    api_login(&app, username, "wrong-password").await,
                    StatusCode::UNAUTHORIZED
                );
                total += started.elapsed();
            }
            total
        }
    };
    let existing = measure("admin").await;
    let missing = measure("no_such_user_x").await;
    // 不存在的用户也执行一次 Argon2：耗时应与密码错误同量级，而不是快一个数量级。
    assert!(
        missing * 3 >= existing,
        "missing user login too fast: missing={missing:?} existing={existing:?}"
    );
}
