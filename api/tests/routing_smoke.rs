use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

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
async fn readyz_returns_service_unavailable_without_database_pool() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/readyz")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body = response_body(response).await;
    assert!(body.contains("\"status\":\"not_ready\""));
    assert!(body.contains("\"database\":\"sqlite-not-connected\""));
}

#[tokio::test]
async fn readyz_checks_sqlite_connection() {
    let pool = test_pool().await;
    let app = build_router(AppState::new(test_settings(), Some(pool)));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/readyz")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("\"status\":\"ready\""));
    assert!(body.contains("\"database\":\"sqlite-connected\""));
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
    assert!(body.contains("纯色策印"));
    assert!(!body.contains("linearGradient"));
    assert!(!body.contains("url(#"));
}

#[tokio::test]
async fn favicon_uses_bundled_logo_svg() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/favicon.ico")
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
    assert!(body.contains("纯色策印"));
}

#[tokio::test]
async fn static_app_css_is_bundled() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/app.css")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/css; charset=utf-8"
    );

    let body = response_body(response).await;
    assert!(body.contains("data-theme"));
    assert!(body.contains("modal"));
    assert!(body.contains("project-switcher"));
    assert!(body.contains(".auth-form input"));
    assert!(body.contains("letter-spacing: 0"));
    assert!(body.contains("word-spacing: normal"));
}

#[tokio::test]
async fn static_app_js_redirects_api_unauthorized_to_login() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/app.js")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/javascript; charset=utf-8"
    );

    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let body = std::str::from_utf8(&body).expect("body should be utf-8");

    assert!(body.contains("response.status === 401"));
    assert!(body.contains("payload.error.code === \"unauthorized\""));
    assert!(body.contains("window.location.href = \"/web/login\""));
    assert!(body.contains("function toggleTheme()"));
    assert!(body.contains("data-theme-toggle"));
    assert!(body.contains("function filterProjectOptions"));
    assert!(body.contains("data-project-search-input"));
    assert!(body.contains("function openModal"));
    assert!(body.contains("function closeModal"));
    assert!(body.contains("data-modal-open"));
    assert!(body.contains("event.key === \"Escape\""));
    assert!(body.contains("function openConfirmModal"));
    assert!(body.contains("data-confirm-submit-form"));
    assert!(body.contains("data-confirm-submit"));
    assert!(body.contains("function syncTabUrl"));
    assert!(body.contains("data-tabs-sync-url"));
    assert!(body.contains("async function submitDirectUpload"));
    assert!(body.contains("data-direct-upload"));
    assert!(body.contains("async function submitBugReport"));
    assert!(body.contains("data-bug-report-form"));
    assert!(body.contains("/comments/"));
    assert!(body.contains("USERNAME_INPUT_SELECTOR"));
    assert!(body.contains("function normalizeUsernameInput"));
    assert!(body.contains("compactUsernameValue(original)"));
}

#[tokio::test]
async fn static_htmx_is_bundled() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/htmx.min.js")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/javascript; charset=utf-8"
    );

    let body = response_body(response).await;
    assert!(body.contains("htmx"));
    assert!(body.contains("HX-Request"));
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
async fn unknown_route_returns_not_found() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/missing-route")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = response_body(response).await;
    assert_eq!(body, "Not Found");
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
    assert!(body.contains("href=\"/favicon.ico\""));
    assert!(body.contains("我的工作项"));
    assert!(body.contains("/web/system/storage"));
    assert!(body.contains(r#"id="confirm-action-modal""#));
    assert!(body.contains(r#"data-confirm-modal"#));
}

#[test]
fn api_v1_contract_runbook_covers_current_context_and_upload_edges() {
    let body = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../docs/runbooks/api-v1-contract.md"
    ))
    .expect("api v1 contract runbook should exist");

    assert!(body.contains("GET   /api/v1/current-project"));
    assert!(body.contains("未显式传 `project_key` 时，会默认使用当前项目"));
    assert!(body.contains("PUT /api/v1/test-storage/upload?object_key=..."));
    assert!(body.contains("只在 `YUANCE_ENV=test`"));
    assert!(body.contains("POST   /api/v1/work-items/{item_key}/attachments"));
    assert!(body.contains("POST /api/v1/storage/config/versions/{version}/rollback"));
}

#[test]
fn api_v1_contract_runbook_lists_every_router_api_v1_path() {
    let router = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/web/router.rs"))
        .expect("router should exist");
    let contract = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../docs/runbooks/api-v1-contract.md"
    ))
    .expect("api v1 contract runbook should exist");

    let router_paths = extract_router_api_v1_paths(&router);
    assert!(
        !router_paths.is_empty(),
        "router should expose documented api v1 paths"
    );

    for path in router_paths {
        assert!(
            contract.contains(&path),
            "docs/runbooks/api-v1-contract.md missing router path {path}"
        );
    }
}

#[test]
fn api_v1_contract_runbook_does_not_list_unknown_api_v1_paths() {
    let router = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/web/router.rs"))
        .expect("router should exist");
    let contract = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../docs/runbooks/api-v1-contract.md"
    ))
    .expect("api v1 contract runbook should exist");

    let router_paths = extract_router_api_v1_paths(&router);
    let contract_paths = extract_contract_api_v1_paths(&contract);
    assert!(
        !contract_paths.is_empty(),
        "contract should list api v1 paths"
    );

    for path in contract_paths {
        assert!(
            router_paths.contains(&path),
            "docs/runbooks/api-v1-contract.md lists unknown router path {path}"
        );
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
        session_ttl: "12h".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key".to_string(),
    }
}

fn extract_router_api_v1_paths(source: &str) -> Vec<String> {
    let mut paths = source
        .lines()
        .flat_map(|line| {
            line.split('"')
                .filter(|part| part.starts_with("/api/v1/"))
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    paths
}

fn extract_contract_api_v1_paths(source: &str) -> Vec<String> {
    let methods = ["GET", "POST", "PATCH", "PUT", "DELETE"];
    let mut paths = source
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let method = methods
                .iter()
                .find(|method| trimmed.starts_with(**method))?;
            let rest = trimmed[method.len()..].trim();
            if !rest.starts_with("/api/v1/") {
                return None;
            }
            let path = rest
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .split('?')
                .next()
                .unwrap_or_default();
            (!path.is_empty()).then(|| path.to_string())
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    paths
}
