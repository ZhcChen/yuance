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
async fn openapi_json_is_served_for_api_reference() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/openapi.json")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/json; charset=utf-8"
    );

    let body = response_body(response).await;
    let spec: serde_json::Value =
        serde_json::from_str(&body).expect("openapi document should be valid json");
    assert_eq!(spec["openapi"], "3.1.0");
    assert!(body.contains(r#""/api/v1/projects""#));
    assert!(body.contains(r#""bearerAuth""#));
    assert!(body.contains(r#""/api/v1/projects/{project_key}/resources/{resource_id}/unlock""#));
    assert!(body.contains(r#""active_work_item_count""#));
    assert!(!body.contains(r#""open_work_item_count""#));
}

#[tokio::test]
async fn api_docs_page_embeds_scalar_and_mcp_setup_summary() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/api-docs")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "text/html; charset=utf-8"
    );

    let body = response_body(response).await;
    assert!(body.contains("Scalar.createApiReference"));
    assert!(body.contains("url: '/api/openapi.json'"));
    assert!(body.contains("MCP 初始化指南"));
    assert!(body.contains("YUANCE_API_TOKEN"));
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
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store, max-age=0, must-revalidate"
    );

    let body = response_body(response).await;
    assert!(body.contains("data-theme"));
    assert!(body.contains("modal"));
    assert!(body.contains("project-switcher"));
    assert!(body.contains(".auth-form input"));
    assert!(body.contains("letter-spacing: 0"));
    assert!(body.contains("word-spacing: normal"));
    assert!(body.contains(".rich-text-editor:focus-within"));
    assert!(body.contains(".rich-attachment"));
    assert!(body.contains(".rich-attachment[data-upload-state=\"queued\"]"));
    assert!(body.contains(".work-item-rich-create"));
    assert!(body.contains(".rich-attachment-menu"));
    assert!(body.contains("cursor: context-menu"));
    assert!(body.contains(".discussion-reply-form"));
    assert!(body.contains(".discussion-reply-target"));
    assert!(!body.contains(".discussion-post[data-reply-depth"));
    assert!(body.contains(".discussion-flow-event"));
    assert!(body.contains(".flow-event-body"));
    assert!(body.contains("grid-column: 1 / -1"));
    assert!(body.matches(".discussion-reply-form {").count() >= 1);
    assert!(body.contains(".discussion-assign-status .select-control"));
    assert!(body.contains("min-width: 168px"));
    assert!(body.contains(".select-control-option-label"));
    assert!(body.contains("white-space: nowrap"));
    assert!(body.contains("text-overflow: ellipsis"));
    assert!(body.contains(".image-viewer-stage video {"));
    assert!(body.contains("pointer-events: auto;"));
    assert!(body.contains(".pager-controls .select-control"));
    assert!(body.contains("flex: 0 0 76px"));
    assert!(body.contains(".content-tabs[data-content-tabs-pending]"));
    assert!(body.contains("0 0 0 3px"));
    assert!(body.contains(".toast-close"));
    assert!(body.contains("place-items: center"));
    assert!(body.contains(".role-status-form"));
    assert!(!body.contains(".role-status-button"));
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
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store, max-age=0, must-revalidate"
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
    assert!(body.contains("window.__YUANCE_APP_RELEASE_VERSION__ ="));
    assert!(body.contains("window.__YUANCE_APP_UPDATE_MANIFEST_URL__ = \"/version.json\""));
    assert!(body.contains("function toggleTheme()"));
    assert!(body.contains("function currentReleaseVersion()"));
    assert!(body.contains("function fetchReleaseVersionManifest()"));
    assert!(body.contains("function checkForAppUpdate()"));
    assert!(body.contains("function initAppUpdatePrompt()"));
    assert!(body.contains("data-app-update-modal"));
    assert!(body.contains("window.location.reload()"));
    assert!(body.contains("data-theme-toggle"));
    assert!(body.contains("function notificationText(value, fallback)"));
    assert!(body.contains("function notificationMetaText(item)"));
    assert!(body.contains("notificationText(item.actor, \"系统\")"));
    assert!(body.contains("notificationText(item.created_at, \"未知时间\")"));
    assert!(body.contains("notificationText(item.open_url, \"/web/messages\")"));
    assert!(body.contains("function filterProjectOptions"));
    assert!(body.contains("data-project-search-input"));
    assert!(body.contains("function openModal"));
    assert!(body.contains("function closeModal"));
    assert!(body.contains("data-modal-open"));
    assert!(body.contains("select.dataset.selectAutofocus"));
    assert!(body.contains("select.removeAttribute(\"autofocus\")"));
    assert!(body.contains("trigger.setAttribute(\"autofocus\", \"\")"));
    assert!(body.contains("select.dataset.selectPanelMinWidth"));
    assert!(body.contains("var defaultMinWidth = searchable ? 320 : 168"));
    assert!(body.contains("function renderSelectOptions(control)"));
    assert!(body.contains("new MutationObserver(function (mutations)"));
    assert!(body.contains("optionsChanged"));
    assert!(body.contains("control.selectObserver.disconnect()"));
    assert!(body.contains("function webFormResultFromHtml"));
    assert!(body.contains(r#"querySelector(".inline-result")"#));
    assert!(body.contains("htmlResult?.message"));
    assert!(body.contains("avatar.style.color = \"#fff\""));
    assert!(body.contains("event.key === \"Escape\""));
    assert!(body.contains("function openConfirmModal"));
    assert!(body.contains("data-confirm-submit-form"));
    assert!(body.contains("data-confirm-submit"));
    assert!(body.contains("function syncTabUrl"));
    assert!(body.contains("data-tabs-sync-url"));
    assert!(body.contains("function clearContentTabNavigation"));
    assert!(body.contains("function clearPageTransitionState"));
    assert!(body.contains("document.body.classList.remove(\"page-leaving\")"));
    assert!(body.contains("contentTabNavigationControl"));
    assert!(body.contains("document.fonts.ready"));
    assert!(body.contains("candidate.setAttribute(\"aria-current\", \"page\")"));
    assert!(body.contains("setContentTabsPending(contentTabNavigationControl, true)"));
    assert!(body.contains("async function submitDirectUpload"));
    assert!(body.contains("data-direct-upload"));
    assert!(body.contains("function syncDirectUploadMetadata"));
    assert!(body.contains("fileInput.multiple && !form.dataset.existingAttachmentId"));
    assert!(body.contains("var uploadEntries = entries.length"));
    assert!(body.contains("group.dataset.uploadBusy === \"true\""));
    assert!(body.contains("item.status !== \"deleted\""));
    assert!(body.contains("已归档"));
    assert!(body.contains("data-confirm-title=\"归档项目文件\""));
    assert!(body.contains("data-confirm-action=\"归档\""));
    assert!(!body.contains("data-confirm-title=\"删除项目文件\""));
    assert!(!body.contains("确认删除文件"));
    assert!(body.contains("async function submitBugReport"));
    assert!(body.contains("async function publishBugReportRichText"));
    assert!(body.contains("function syncBugReportRichDescription"));
    assert!(body.contains("function ensureBugReportItemForRichUpload"));
    assert!(body.contains("function ensureProjectResourceForRichUpload"));
    assert!(body.contains("function removeRichAttachmentNode"));
    assert!(body.contains("data-bug-report-form"));
    assert!(body.contains("/comments/"));
    assert!(body.contains("function setDiscussionBusy(form, busy, activeSubmitter)"));
    assert!(body.contains("function isDiscussionControlLocked(form, control)"));
    assert!(body.contains("control.disabled = busy || isDiscussionControlLocked(form, control);"));
    assert!(body.contains("control.matches(\"[data-discussion-assign]\")"));
    assert!(
        body.contains("selectControl.selectElement.matches(\"[data-discussion-assign-status]\")")
    );
    assert!(body.contains("form.dataset.discussionPendingAssign = \"true\""));
    assert!(body.contains("内容已发表，未完成的指派或附件可直接重试。"));
    assert!(body.contains("function reloadDiscussionAtComment(itemKey, commentId)"));
    assert!(body.contains("function openRichAttachmentMenu"));
    assert!(body.contains("function handleRichAttachmentMenuAction"));
    assert!(body.contains("data-rich-attachment-menu-action"));
    assert!(body.contains(".discussion-rich-body a[data-yuance-attachment-kind='file']"));
    assert!(body.contains("window.location.hash = targetHash"));
    assert!(body.contains("reloadDiscussionAtComment(itemKey, commentId)"));
    assert!(body.contains("button === activeSubmitter"));
    assert!(body.contains("submitter.matches(\"[data-discussion-submit]\")"));
    assert!(body.contains("USERNAME_INPUT_SELECTOR"));
    assert!(body.contains("function normalizeUsernameInput"));
    assert!(body.contains("compactUsernameValue(original)"));
}

#[tokio::test]
async fn version_manifest_returns_current_release_and_disables_cache() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/version.json")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/json; charset=utf-8"
    );
    assert_eq!(
        response.headers().get(header::CACHE_CONTROL).unwrap(),
        "no-store, max-age=0, must-revalidate"
    );

    let body = response_body(response).await;
    let manifest: serde_json::Value =
        serde_json::from_str(&body).expect("version manifest should be valid json");
    let version = manifest["version"]
        .as_str()
        .expect("version manifest should expose string version");
    assert!(!version.trim().is_empty());
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
async fn static_pdfjs_module_is_served_for_document_preview() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/pdfjs/build/pdf.min.mjs")
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
    assert!(body.contains("GlobalWorkerOptions"));
    assert!(body.contains("getDocument"));
}

#[tokio::test]
async fn static_pdfjs_cmap_asset_is_served() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/pdfjs/cmaps/78-EUC-H.bcmap")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/octet-stream"
    );

    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    assert!(!body.is_empty());
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
    assert!(!body.contains("我的工作项"));
    assert!(body.contains("我的待处理"));
    assert!(body.contains("/my-analysis"));
    assert!(body.contains("/web/system/storage"));
    assert!(body.contains(r#"id="app-update-modal""#));
    assert!(body.contains(r#"data-app-update-modal"#));
    assert!(body.contains(r#"data-app-update-refresh"#));
    assert!(body.contains(r#"id="confirm-action-modal""#));
    assert!(body.contains(r#"data-confirm-modal"#));
    assert!(body.contains(r#"class="account-menu-action" type="submit">退出登录</button>"#));
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
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "test-master-key-that-is-long-enough".to_string(),
        onlyoffice_document_server_url: String::new(),
        onlyoffice_jwt_secret: String::new(),
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
