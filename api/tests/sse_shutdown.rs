//! 停机时实时事件流主动结束（体检 P1-8 / FR-014）。独立测试进程：停机信号是进程级全局状态。

#[allow(dead_code)]
#[path = "integration/support.rs"]
mod support;

use std::time::Duration;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    platform::realtime,
    web::router::{AppState, build_router},
};

#[tokio::test]
async fn topbar_event_stream_ends_when_shutdown_begins() {
    let pool = support::test_pool().await;
    let admin = support::bootstrap_admin_session(&pool).await;
    let app = build_router(AppState::new(support::test_settings(), Some(pool)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/topbar/events")
                .header(header::COOKIE, admin.cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    // 读到首个事件，确认流已建立。
    let first = tokio::time::timeout(Duration::from_secs(5), body.frame())
        .await
        .expect("first frame should arrive")
        .expect("stream should yield")
        .expect("frame ok");
    assert!(first.is_data());

    realtime::begin_shutdown();
    // 停机后流应在短时间内结束（不必等待优雅停机超时）。
    let ended = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(frame) = body.frame().await {
            frame.expect("frame ok");
        }
    })
    .await;
    assert!(ended.is_ok(), "SSE stream must end after shutdown begins");
}
