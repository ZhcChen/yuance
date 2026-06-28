use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::web::router::{AppState, build_router};

#[tokio::test]
async fn root_redirects_to_web() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(
        response.headers().get(header::LOCATION).unwrap(),
        "/web",
        "root should redirect to unified web entry"
    );
}

#[tokio::test]
async fn healthz_returns_json() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/healthz")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let body = std::str::from_utf8(&body).expect("body should be utf-8");

    assert!(body.contains("\"service\":\"yuance-api\""));
    assert!(body.contains("\"status\":\"ok\""));
}

#[tokio::test]
async fn static_logo_is_bundled_as_svg() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/brand/yuance-logo.svg")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "image/svg+xml; charset=utf-8"
    );

    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let body = std::str::from_utf8(&body).expect("body should be utf-8");

    assert!(body.contains("<title id=\"title\">元策 Logo</title>"));
    assert!(body.contains("纯色 Y 型决策分叉"));
    assert!(!body.contains("linearGradient"));
    assert!(!body.contains("url(#"));
}

#[tokio::test]
async fn admin_is_not_a_supported_entry() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/admin")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn web_renders_dashboard_shell() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let body = std::str::from_utf8(&body).expect("body should be utf-8");

    assert!(body.contains("元策"));
    assert!(body.contains("我的工作项"));
    assert!(body.contains("/web/system/storage"));
}
