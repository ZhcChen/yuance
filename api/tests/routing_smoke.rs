use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use std::{
    fs,
    future::Future,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
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
async fn system_openapi_json_is_served_for_system_api_reference() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/system/openapi.json")
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
        serde_json::from_str(&body).expect("system openapi document should be valid json");
    assert_eq!(spec["openapi"], "3.1.0");
    assert!(body.contains(r#""/api/v1/system/releases""#));
    assert!(body.contains(r#""systemBearerAuth""#));
    assert!(!body.contains(r#""/api/v1/system/releases/settings""#));
}

#[tokio::test]
async fn api_docs_page_embeds_scalar_and_skill_setup_summary() {
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
    assert!(body.contains("Codex Skill 指南"));
    assert!(body.contains("install-codex-skill.sh"));
    assert!(body.contains("install-codex-skill.ps1"));
    assert!(body.contains("YUANCE_API_TOKEN"));
    assert!(!body.contains("npm install"));
    assert!(!body.contains("yuance-mcp-server"));
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
async fn auth_css_is_bundled_without_retired_business_selectors() {
    let app = build_router(AppState::for_tests());

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/static/auth.css")
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
    assert!(body.contains(".auth-panel"));
    assert!(body.contains(".visual-workspace-grid"));
    assert!(body.contains(".setup-dashboard"));
    assert!(body.contains(".device-authorization-actions"));
    assert!(!body.contains(".work-item"));
    assert!(!body.contains(".system-"));
    assert!(!body.contains(".project-"));
    assert!(!body.contains(".modal"));
    assert!(!body.contains(".toast"));

    for uri in ["/static/app.css", "/static/app.js"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
    }
}

#[tokio::test]
async fn server_rendered_boundaries_use_versioned_styles_without_inline_css() {
    let app = build_router(AppState::for_tests());

    for (uri, marker) in [
        ("/static/desktop-downloads.css", ".platform-grid"),
        ("/static/document-preview.css", ".preview-page"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), StatusCode::OK, "{uri}");
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/css; charset=utf-8"
        );
        assert!(response_body(response).await.contains(marker));
    }

    for template in [
        include_str!("../templates/web/desktop_downloads.html"),
        include_str!("../templates/web/document_preview.html"),
    ] {
        assert!(!template.contains("<style>"));
        assert!(template.contains("/static/auth.css"));
    }
}

#[tokio::test]
async fn web_app_entry_serves_index_and_deep_links_without_cache() {
    with_web_dist_dir(|dist_dir| async move {
        fs::create_dir_all(dist_dir.join("assets")).expect("dist assets dir should create");
        fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/web/app/assets/index-abc123.js\"></script></body></html>",
        )
        .expect("index should write");
        fs::write(dist_dir.join("manifest.json"), "{}")
            .expect("manifest should write");
        fs::write(dist_dir.join("assets/index-abc123.js"), "console.log('ok');")
            .expect("asset should write");

        let app = build_router(AppState::for_tests());
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/web/app/")
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
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store, max-age=0, must-revalidate"
        );
        let body = response_body(response).await;
        assert!(body.contains("/web/app/assets/index-abc123.js"));

        let deep_link = app
            .oneshot(
                Request::builder()
                    .uri("/web/app/messages/inbox")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(deep_link.status(), StatusCode::OK);
        assert_eq!(response_body(deep_link).await, body);
    })
    .await;
}

#[tokio::test]
async fn web_shell_owner_serves_migrated_routes_from_same_app_entry() {
    with_web_dist_dir(|dist_dir| async move {
        fs::create_dir_all(dist_dir.join("assets")).expect("dist assets dir should create");
        fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/web/app/assets/index-abc123.js\"></script></body></html>",
        )
        .expect("index should write");
        fs::write(dist_dir.join("assets/index-abc123.js"), "console.log('ok');")
            .expect("asset should write");

        let app = build_router(AppState::for_tests());
        let root_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/web")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let messages_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/web/messages?filter=unread&page=2&per_page=20")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        let mut migrated_route_responses = Vec::new();
        for uri in [
            "/web/projects?status=in_progress&page=2&per_page=20",
            "/web/projects/YCE?tab=library",
            "/web/projects/YCE/cycles/7",
            "/web/projects/YCE/resources/9?access=opaque-token",
            "/web/projects/YCE/my-analysis",
            "/web/requirements?status=pending&page=2&per_page=20",
            "/web/tasks?q=release&sort=priority_desc",
            "/web/bugs?assignee_username=yuance_admin",
            "/web/work-items/YCE-TASK-2?focus=comment-7",
            "/web/system",
            "/web/system/users?page=2&per_page=20",
            "/web/system/roles?role=member&page=2&per_page=20",
            "/web/system/roles/member/permissions",
            "/web/system/permissions?q=roles",
            "/web/system/database-stats",
            "/web/system/audit?actor=admin&action=auth.login&target_type=user&target_id=7&page=2&per_page=20",
            "/web/system/storage?page=2&per_page=20",
            "/web/system/openapi",
            "/web/system/releases?page=2&per_page=20",
        ] {
            migrated_route_responses.push(
                app.clone()
                    .oneshot(
                        Request::builder()
                            .uri(uri)
                            .body(Body::empty())
                            .expect("request should build"),
                    )
                    .await
                    .expect("router should respond"),
            );
        }

        assert_eq!(root_response.status(), StatusCode::OK);
        assert_eq!(messages_response.status(), StatusCode::OK);
        assert!(migrated_route_responses
            .iter()
            .all(|response| response.status() == StatusCode::OK));
        assert_eq!(
            root_response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store, max-age=0, must-revalidate"
        );
        let root_body = response_body(root_response).await;
        assert_eq!(response_body(messages_response).await, root_body);
        for response in migrated_route_responses {
            assert_eq!(response_body(response).await, root_body);
        }
    })
    .await;
}

#[tokio::test]
async fn web_app_assets_use_immutable_cache_and_missing_assets_404() {
    with_web_dist_dir(|dist_dir| async move {
        fs::create_dir_all(dist_dir.join("assets")).expect("dist assets dir should create");
        fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><html><body><div id=\"root\"></div></body></html>",
        )
        .expect("index should write");
        fs::write(
            dist_dir.join("assets/index-abc123.js"),
            "console.log('ok');",
        )
        .expect("asset should write");

        let app = build_router(AppState::for_tests());
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/web/app/assets/index-abc123.js")
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
            "public, max-age=31536000, immutable"
        );

        let missing = app
            .oneshot(
                Request::builder()
                    .uri("/web/app/assets/missing.js")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    })
    .await;
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
async fn static_document_preview_module_is_served() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/document-preview.mjs")
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
    assert!(body.contains("initDocumentPreview"));
    assert!(body.contains("initPdfPreview"));
    assert!(body.contains("renderSpreadsheetPreview"));
}

#[tokio::test]
async fn static_legacy_document_preview_module_is_served() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/document-preview-legacy.mjs")
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
    assert!(body.contains("renderLegacyDocumentPreview"));
    assert!(body.contains("renderLegacyDocPreview"));
    assert!(body.contains("renderLegacyPptPreview"));
}

#[tokio::test]
async fn static_sheetjs_bundle_is_served_for_document_preview() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/sheetjs/xlsx.full.min.js")
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
    assert!(body.contains("XLSX"));
    assert!(body.contains("sheet_to_json"));
}

#[tokio::test]
async fn static_ooxml_module_is_served_for_document_preview() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/ooxml/docx.mjs")
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
    assert!(body.contains("DocxScrollViewer"));
    assert!(body.contains("DocxViewer"));
}

#[tokio::test]
async fn static_legacy_doc_bundle_is_served_for_document_preview() {
    let app = build_router(AppState::for_tests());

    let response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/legacy-doc/index.js")
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
    assert!(body.contains("parseMsDoc"));
    assert!(body.contains("renderMsDoc"));
}

#[tokio::test]
async fn static_legacy_ppt_manifest_and_font_assets_are_served() {
    let app = build_router(AppState::for_tests());

    let manifest_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/static/vendor/legacy-ppt/manifest.json")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(manifest_response.status(), StatusCode::OK);
    assert_eq!(
        manifest_response
            .headers()
            .get(header::CONTENT_TYPE)
            .unwrap(),
        "application/json; charset=utf-8"
    );
    let manifest_body = response_body(manifest_response).await;
    assert!(manifest_body.contains("\"feature\": \"ppt\""));
    assert!(manifest_body.contains("\"watermarkRequired\": true"));

    let font_response = app
        .oneshot(
            Request::builder()
                .uri("/static/vendor/legacy-ppt/ppt-font-cjk.otf")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(font_response.status(), StatusCode::OK);
    assert_eq!(
        font_response.headers().get(header::CONTENT_TYPE).unwrap(),
        "font/otf"
    );
    let font_body = font_response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    assert!(!font_body.is_empty());
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
async fn retired_web_business_pages_share_one_app_entry() {
    with_web_dist_dir(|dist_dir| async move {
        fs::create_dir_all(dist_dir.join("assets")).expect("dist assets dir should create");
        fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><html><body><div id=\"root\"></div></body></html>",
        )
        .expect("index should write");

        let app = build_router(AppState::for_tests());
        let mut bodies = Vec::new();
        for uri in [
            "/web",
            "/web/me",
            "/web/search?q=release&page=2",
            "/web/messages?filter=unread&page=2",
            "/web/projects?status=in_progress",
            "/web/projects/YCE?tab=library",
            "/web/projects/YCE/cycles/7",
            "/web/projects/YCE/resources/9?access=opaque-token",
            "/web/projects/YCE/my-analysis",
            "/web/requirements?project_key=YCE",
            "/web/tasks?status=in_progress",
            "/web/bugs?priority=P0",
            "/web/work-items/YCE-TASK-2",
            "/web/system",
            "/web/system/users?page=2&per_page=20",
            "/web/system/roles?role=member",
            "/web/system/roles/member/permissions",
            "/web/system/permissions",
            "/web/system/storage?page=2",
            "/web/system/openapi",
            "/web/system/releases?page=2",
            "/web/system/database-stats",
            "/web/system/audit?actor=admin",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(uri)
                        .body(Body::empty())
                        .expect("request should build"),
                )
                .await
                .expect("router should respond");
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            bodies.push(response_body(response).await);
        }

        assert!(bodies.iter().all(|body| body == &bodies[0]));
        assert!(bodies[0].contains(r#"<div id="root"></div>"#));
        assert!(!bodies[0].contains("data-project-create-form"));
    })
    .await;
}

#[tokio::test]
async fn system_api_docs_keep_an_independent_document_boundary() {
    let app = build_router(AppState::for_tests());
    let response = app
        .oneshot(
            Request::builder()
                .uri("/web/system/api-docs")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    let body = response_body(response).await;
    assert!(body.contains("元策系统 API"));
    assert!(body.contains("/api/system/openapi.json"));
    assert!(body.contains("Scalar.createApiReference"));
    assert!(!body.contains(r#"<div id="root"></div>"#));
}

#[tokio::test]
async fn retired_system_web_mutation_routes_are_not_registered() {
    let app = build_router(AppState::for_tests());

    for (uri, expected) in [
        ("/web/system/users", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/system/users/member/status", StatusCode::NOT_FOUND),
        ("/web/system/users/member/role", StatusCode::NOT_FOUND),
        ("/web/system/users/member/password", StatusCode::NOT_FOUND),
        ("/web/system/users/member/projects", StatusCode::NOT_FOUND),
        ("/web/system/roles", StatusCode::METHOD_NOT_ALLOWED),
        (
            "/web/system/roles/member/permissions",
            StatusCode::METHOD_NOT_ALLOWED,
        ),
        ("/web/system/storage", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/system/storage/probe", StatusCode::NOT_FOUND),
        ("/web/system/storage/initialize", StatusCode::NOT_FOUND),
        ("/web/system/openapi", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/system/openapi/tokens/7/edit", StatusCode::NOT_FOUND),
        ("/web/system/releases", StatusCode::METHOD_NOT_ALLOWED),
        ("/web/system/releases/settings", StatusCode::NOT_FOUND),
        ("/web/system/releases/7/edit", StatusCode::NOT_FOUND),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("router should respond");
        assert_eq!(response.status(), expected, "POST {uri}");
    }
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
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
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

async fn with_web_dist_dir<F, Fut>(action: F)
where
    F: FnOnce(std::path::PathBuf) -> Fut,
    Fut: Future<Output = ()>,
{
    let _guard = env_lock().lock().expect("env lock should acquire");
    let dir = unique_temp_dir("yuance-web-dist");
    let previous = std::env::var("YUANCE_WEB_DIST_DIR").ok();
    unsafe {
        std::env::set_var("YUANCE_WEB_DIST_DIR", &dir);
    }

    action(dir.clone()).await;

    unsafe {
        match previous {
            Some(value) => std::env::set_var("YUANCE_WEB_DIST_DIR", value),
            None => std::env::remove_var("YUANCE_WEB_DIST_DIR"),
        }
    }
    let _ = fs::remove_dir_all(dir);
}

fn unique_temp_dir(prefix: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should move forward")
        .as_nanos();
    std::env::temp_dir().join(format!("{prefix}-{nanos}"))
}

fn env_lock() -> &'static Mutex<()> {
    static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    ENV_LOCK.get_or_init(|| Mutex::new(()))
}
