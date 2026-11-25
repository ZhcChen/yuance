//! 请求编号与 5xx 错误脱敏（体检 P1-2）。

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::web::router::{AppState, build_router};

use crate::support::{bootstrap_admin_session, test_pool, test_settings};

#[tokio::test]
async fn server_errors_hide_internal_details_and_carry_request_id() {
    // 未配置数据库连接池时，内部错误原文为 “SQLite pool is not configured”。
    let app = build_router(AppState::new(test_settings(), None));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let request_id = response
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    assert_eq!(request_id.len(), 36, "x-request-id 应为 UUID：{request_id}");
    let body = String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(!body.contains("SQLite"), "{body}");
    assert!(!body.contains("pool"), "{body}");
    assert!(body.contains("服务暂时无法完成请求"), "{body}");
}

#[tokio::test]
async fn client_errors_keep_actionable_messages_and_request_ids_are_unique() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));
    let mut ids = Vec::new();
    for _ in 0..2 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/work-item-detail-view/NOPE-404")
                    .header("cookie", &admin.cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        ids.push(
            response
                .headers()
                .get("x-request-id")
                .unwrap()
                .to_str()
                .unwrap()
                .to_string(),
        );
        let body = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(
            body.contains("不存在"),
            "4xx 仍应返回可操作的错误信息：{body}"
        );
    }
    assert_ne!(ids[0], ids[1]);
}
