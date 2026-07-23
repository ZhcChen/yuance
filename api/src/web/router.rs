use axum::{
    Router,
    body::to_bytes,
    extract::{Path, Request, State},
    http::{HeaderMap, Method, StatusCode, header},
    middleware::Next,
    response::{Html, IntoResponse, Redirect, Response},
    routing::{delete, get, patch, post, put},
};
use include_dir::{Dir, include_dir};
use serde::Deserialize;

use crate::{
    domains::auth,
    platform::{config::Settings, security::csrf},
    web,
};

static PDFJS_VENDOR_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static/vendor/pdfjs");

#[derive(Clone, Debug)]
pub struct AppState {
    pub settings: Settings,
    pub pool: Option<sqlx::SqlitePool>,
}

impl AppState {
    pub fn new(settings: Settings, pool: Option<sqlx::SqlitePool>) -> Self {
        Self { settings, pool }
    }

    pub fn for_tests() -> Self {
        Self {
            settings: Settings {
                http_addr: std::net::SocketAddr::from(([127, 0, 0, 1], 33033)),
                database_url: "sqlite://:memory:".to_string(),
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
            },
            pool: None,
        }
    }

    pub fn pool(&self) -> crate::platform::error::AppResult<&sqlx::SqlitePool> {
        self.pool.as_ref().ok_or_else(|| {
            crate::platform::error::AppError::Config("SQLite pool is not configured".to_string())
        })
    }
}

pub fn build_router(state: AppState) -> Router {
    let middleware_state = state.clone();
    Router::new()
        .route("/", get(root))
        .route("/web", get(web::user::dashboard))
        .route("/web/me", get(web::user::me_page))
        .route("/web/me/profile", post(web::user::me_profile_update))
        .route("/web/me/password", post(web::user::me_password_update))
        .route("/web/me/api-tokens", post(web::user::me_api_token_create))
        .route(
            "/web/me/api-tokens/{token_id}/edit",
            post(web::user::me_api_token_update),
        )
        .route(
            "/web/me/api-tokens/{token_id}/delete",
            post(web::user::me_api_token_delete),
        )
        .route("/web/search", get(web::user::search_page))
        .route("/web/messages", get(web::user::messages_page))
        .route(
            "/web/messages/read-all",
            post(web::user::messages_mark_all_read),
        )
        .route(
            "/web/messages/{notification_id}/open",
            get(web::user::message_open),
        )
        .route(
            "/web/projects",
            get(web::user::projects_page).post(web::user::projects_create),
        )
        .route(
            "/web/current-project",
            axum::routing::post(web::user::current_project_update),
        )
        .route(
            "/web/projects/{project_key}",
            get(web::user::project_detail_page),
        )
        .route(
            "/web/projects/{project_key}/edit",
            post(web::user::project_update),
        )
        .route(
            "/web/projects/{project_key}/members",
            post(web::user::project_member_add),
        )
        .route(
            "/web/projects/{project_key}/members/{username}/remove",
            post(web::user::project_member_remove),
        )
        .route(
            "/web/projects/{project_key}/members/{username}/role",
            post(web::user::project_member_role_update),
        )
        .route(
            "/web/projects/{project_key}/cycles",
            post(web::user::project_cycle_create),
        )
        .route(
            "/web/projects/{project_key}/cycles/{cycle_id}/edit",
            post(web::user::project_cycle_update),
        )
        .route(
            "/web/projects/{project_key}/cycles/{cycle_id}/close",
            post(web::user::project_cycle_close),
        )
        .route(
            "/web/projects/{project_key}/attachments",
            post(web::user::project_attachment_create),
        )
        .route(
            "/web/projects/{project_key}/attachments/{attachment_id}/delete",
            post(web::user::project_attachment_delete),
        )
        .route(
            "/web/projects/{project_key}/attachments/{attachment_id}/download",
            get(web::user::project_attachment_download),
        )
        .route(
            "/web/projects/{project_key}/attachments/{attachment_id}/preview",
            get(web::user::project_attachment_preview),
        )
        .route(
            "/web/projects/{project_key}/attachments/{attachment_id}/preview/content",
            get(web::user::project_attachment_preview_content),
        )
        .route(
            "/web/projects/{project_key}/resources",
            post(web::user::project_resource_create),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}",
            get(web::user::project_resource_detail_page),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/unlock",
            post(web::user::project_resource_unlock),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/edit",
            post(web::user::project_resource_update),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/archive",
            post(web::user::project_resource_archive),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download",
            get(web::user::project_resource_attachment_download),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview",
            get(web::user::project_resource_attachment_preview),
        )
        .route(
            "/web/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content",
            get(web::user::project_resource_attachment_preview_content),
        )
        .route(
            "/web/projects/{project_key}/my-analysis",
            get(web::user::project_personal_analysis_page),
        )
        .route("/web/requirements", get(web::user::requirements_page))
        .route("/web/tasks", get(web::user::tasks_page))
        .route("/web/bugs", get(web::user::bugs_page))
        .route("/web/work-items", post(web::user::work_items_create))
        .route(
            "/web/work-items/{item_key}",
            get(web::user::work_item_detail_page),
        )
        .route(
            "/web/work-items/{item_key}/flow-records",
            get(web::user::work_item_flow_history_partial),
        )
        .route(
            "/web/work-items/{item_key}/status",
            post(web::user::work_item_status_update),
        )
        .route(
            "/web/work-items/{item_key}/handoff",
            post(web::user::work_item_handoff),
        )
        .route(
            "/web/work-items/{item_key}/edit",
            post(web::user::work_item_update),
        )
        .route(
            "/web/work-items/{item_key}/restore",
            post(web::user::work_item_restore),
        )
        .route(
            "/web/work-items/{item_key}/comments",
            post(web::user::work_item_comment_create),
        )
        .route(
            "/web/work-items/{item_key}/comments/{comment_id}/edit",
            post(web::user::work_item_comment_update),
        )
        .route(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments",
            post(web::user::work_item_comment_attachment_create),
        )
        .route(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download",
            get(web::user::work_item_comment_attachment_download),
        )
        .route(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview",
            get(web::user::work_item_comment_attachment_preview),
        )
        .route(
            "/web/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content",
            get(web::user::work_item_comment_attachment_preview_content),
        )
        .route(
            "/web/work-items/{item_key}/attachments",
            post(web::user::work_item_attachment_create),
        )
        .route(
            "/web/work-items/{item_key}/attachments/{attachment_id}/download",
            get(web::user::work_item_attachment_download),
        )
        .route(
            "/web/work-items/{item_key}/attachments/{attachment_id}/preview",
            get(web::user::work_item_attachment_preview),
        )
        .route(
            "/web/work-items/{item_key}/attachments/{attachment_id}/preview/content",
            get(web::user::work_item_attachment_preview_content),
        )
        .route(
            "/web/login",
            get(web::user::login).post(web::user::login_submit),
        )
        .route("/web/logout", axum::routing::post(web::user::logout))
        .route("/web/bootstrap", get(web::user::bootstrap))
        .route(
            "/web/bootstrap/init",
            axum::routing::post(web::user::bootstrap_init),
        )
        .route("/web/system", get(web::user::system_dashboard))
        .route(
            "/web/system/users",
            get(web::user::system_users_page).post(web::user::system_users_create),
        )
        .route(
            "/web/system/users/{username}/status",
            axum::routing::post(web::user::system_user_status_update),
        )
        .route(
            "/web/system/users/{username}/role",
            axum::routing::post(web::user::system_user_role_update),
        )
        .route(
            "/web/system/users/{username}/password",
            axum::routing::post(web::user::system_user_password_reset),
        )
        .route(
            "/web/system/roles",
            get(web::user::system_roles_page).post(web::user::system_roles_create),
        )
        .route(
            "/web/system/roles/{role_code}/status",
            axum::routing::post(web::user::system_role_status_update),
        )
        .route(
            "/web/system/roles/{role_code}/permissions",
            get(web::user::system_role_permissions_page)
                .post(web::user::system_role_permissions_update),
        )
        .route(
            "/web/system/permissions",
            get(web::user::system_permissions_page),
        )
        .route(
            "/web/system/storage",
            get(web::user::storage_settings).post(web::user::storage_settings_save),
        )
        .route(
            "/web/system/database-stats",
            get(web::user::system_database_stats_page),
        )
        .route(
            "/web/system/storage/probe",
            axum::routing::post(web::user::storage_settings_probe),
        )
        .route(
            "/web/system/storage/initialize",
            axum::routing::post(web::user::storage_settings_initialize),
        )
        .route(
            "/web/system/storage/versions/{version}/rollback",
            axum::routing::post(web::user::storage_settings_rollback),
        )
        .route("/web/system/audit", get(web::user::system_audit_page))
        .route(
            "/web/partials/work-items",
            get(web::user::work_items_partial),
        )
        .route(
            "/web/partials/work-items/{item_key}",
            get(web::user::work_item_detail_partial),
        )
        .route("/web/api-docs", get(api_docs))
        .route("/api/openapi.json", get(openapi_json))
        .route("/api/healthz", get(web::api::healthz))
        .route("/api/readyz", get(web::api::readyz))
        .route("/api/v1/bootstrap/status", get(web::api::bootstrap_status))
        .route("/api/v1/auth/login", post(web::api::login))
        .route("/api/v1/auth/me", get(web::api::me))
        .route("/api/v1/auth/csrf", get(web::auth_api::csrf_token))
        .route("/api/v1/auth/logout", post(web::api::logout))
        .route(
            "/api/v1/me/tokens",
            get(web::api::list_api_tokens).post(web::api::create_api_token),
        )
        .route(
            "/api/v1/me/tokens/{token_id}",
            delete(web::api::delete_api_token),
        )
        .route(
            "/api/v1/bootstrap/init",
            axum::routing::post(web::api::bootstrap_init),
        )
        .route(
            "/api/v1/system/users",
            get(web::api::list_system_users).post(web::api::create_system_user),
        )
        .route(
            "/api/v1/system/users/{username}/status",
            patch(web::api::update_system_user_status),
        )
        .route(
            "/api/v1/system/users/{username}/role",
            patch(web::api::update_system_user_role),
        )
        .route(
            "/api/v1/system/users/{username}/password",
            post(web::api::reset_system_user_password),
        )
        .route(
            "/api/v1/system/roles",
            get(web::api::list_system_roles).post(web::api::create_system_role),
        )
        .route(
            "/api/v1/system/roles/{role_code}/status",
            patch(web::api::update_system_role_status),
        )
        .route(
            "/api/v1/system/roles/{role_code}/permissions",
            get(web::api::list_system_role_permissions)
                .patch(web::api::update_system_role_permissions),
        )
        .route(
            "/api/v1/system/permissions",
            get(web::api::list_system_permissions),
        )
        .route(
            "/api/v1/system/database-stats",
            get(web::api::list_system_database_stats),
        )
        .route(
            "/api/v1/system/audit",
            get(web::api::list_system_audit_logs),
        )
        .route(
            "/api/v1/storage/config",
            get(web::api::get_storage_config).post(web::api::save_storage_config),
        )
        .route(
            "/api/v1/storage/config/probe",
            post(web::api::probe_storage_config),
        )
        .route(
            "/api/v1/storage/config/inspect",
            get(web::api::inspect_storage_config),
        )
        .route(
            "/api/v1/storage/config/initialize",
            post(web::api::initialize_storage_config),
        )
        .route(
            "/api/v1/storage/config/versions",
            get(web::api::list_storage_config_versions),
        )
        .route(
            "/api/v1/storage/config/versions/{version}/rollback",
            post(web::api::rollback_storage_config),
        )
        .route(
            "/api/v1/test-storage/upload",
            put(web::api::test_storage_upload),
        )
        .route(
            "/api/v1/projects",
            get(web::api::list_projects).post(web::api::create_project),
        )
        .route(
            "/api/v1/current-project",
            get(web::api::get_current_project).patch(web::api::update_current_project),
        )
        .route("/api/v1/topbar/status", get(web::api::get_topbar_status))
        .route("/api/v1/topbar/events", get(web::api::topbar_events))
        .route(
            "/api/v1/projects/{project_key}",
            get(web::api::get_project).patch(web::api::update_project),
        )
        .route(
            "/api/v1/projects/{project_key}/members",
            get(web::api::list_project_members).post(web::api::add_project_member),
        )
        .route(
            "/api/v1/projects/{project_key}/members/{username}",
            patch(web::api::update_project_member_role).delete(web::api::remove_project_member),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments",
            get(web::api::list_project_attachments).post(web::api::create_project_attachment),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments/{attachment_id}/upload-url",
            get(web::api::project_attachment_upload_url),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments/{attachment_id}/uploaded",
            post(web::api::project_attachment_mark_uploaded),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments/{attachment_id}/download-url",
            get(web::api::project_attachment_download_url),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments/{attachment_id}",
            delete(web::api::project_attachment_delete),
        )
        .route(
            "/api/v1/projects/{project_key}/resources",
            get(web::api::list_project_resources).post(web::api::create_project_resource),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}",
            get(web::api::get_project_resource)
                .patch(web::api::update_project_resource)
                .delete(web::api::archive_project_resource),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/archive",
            post(web::api::archive_project_resource),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/unlock",
            post(web::api::unlock_project_resource),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments",
            post(web::api::create_project_resource_attachment),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/upload-url",
            get(web::api::project_resource_attachment_upload_url),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/uploaded",
            post(web::api::project_resource_attachment_mark_uploaded),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/download-url",
            get(web::api::project_resource_attachment_download_url),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}",
            delete(web::api::project_resource_attachment_delete),
        )
        .route(
            "/api/v1/projects/{project_key}/folders",
            get(web::api::list_project_folders).post(web::api::create_project_folder),
        )
        .route(
            "/api/v1/projects/{project_key}/folders/tree",
            get(web::api::get_project_folder_tree),
        )
        .route(
            "/api/v1/projects/{project_key}/folders/content",
            get(web::api::get_folder_content),
        )
        .route(
            "/api/v1/folders/{folder_id}",
            patch(web::api::update_folder).delete(web::api::delete_folder),
        )
        .route(
            "/api/v1/file-objects/{file_object_id}/folder",
            patch(web::api::move_file_to_folder),
        )
        .route(
            "/api/v1/work-items",
            get(web::api::list_work_items).post(web::api::create_work_item),
        )
        .route("/api/v1/notifications", get(web::api::list_notifications))
        .route(
            "/api/v1/work-items/{item_key}",
            get(web::api::get_work_item).patch(web::api::update_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}/restore",
            post(web::api::restore_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}/handoff",
            post(web::api::handoff_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}/events",
            get(web::api::work_item_events),
        )
        .route(
            "/api/v1/work-items/{item_key}/typing",
            post(web::api::update_work_item_typing),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments",
            get(web::api::list_work_item_comments).post(web::api::create_work_item_comment),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/draft",
            post(web::api::create_work_item_comment_draft),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}",
            axum::routing::patch(web::api::update_work_item_comment),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/publish",
            post(web::api::publish_work_item_comment_draft),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments",
            get(web::api::list_work_item_comment_attachments)
                .post(web::api::create_work_item_comment_attachment),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/upload-url",
            get(web::api::work_item_comment_attachment_upload_url),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/uploaded",
            post(web::api::work_item_comment_attachment_mark_uploaded),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/download-url",
            get(web::api::work_item_comment_attachment_download_url),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}",
            delete(web::api::work_item_comment_attachment_delete),
        )
        .route(
            "/api/v1/work-items/{item_key}/attachments",
            get(web::api::list_work_item_attachments)
                .post(web::api::create_work_item_attachment),
        )
        .route(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/upload-url",
            get(web::api::work_item_attachment_upload_url),
        )
        .route(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/uploaded",
            post(web::api::work_item_attachment_mark_uploaded),
        )
        .route(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/download-url",
            get(web::api::work_item_attachment_download_url),
        )
        .route("/version.json", get(version_manifest))
        .route("/static/app.css", get(static_app_css))
        .route("/static/app.js", get(static_app_js))
        .route("/static/brand/yuance-logo.svg", get(static_yuance_logo))
        .route("/static/vendor/htmx.min.js", get(static_htmx))
        .route("/static/vendor/marked/marked.umd.js", get(static_marked))
        .route("/static/vendor/dompurify/purify.min.js", get(static_dompurify))
        .route("/static/vendor/pdfjs/{*path}", get(static_pdfjs_asset))
        .route("/favicon.ico", get(static_favicon))
        .route("/admin", get(admin_not_found))
        .fallback(not_found)
        .layer(axum::middleware::from_fn(web_error_page_middleware))
        .layer(axum::middleware::from_fn_with_state(
            middleware_state,
            session_refresh_middleware,
        ))
        .with_state(state)
}

async fn session_refresh_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    if !should_try_session_refresh(request.uri().path(), request.headers()) {
        return next.run(request).await;
    }
    let Some(pool) = state.pool.as_ref() else {
        return next.run(request).await;
    };
    let Ok(access_ttl_seconds) = state.settings.session_ttl_seconds() else {
        return next.run(request).await;
    };
    let Ok(refresh_ttl_seconds) = state.settings.refresh_session_ttl_seconds() else {
        return next.run(request).await;
    };
    let secure = state.settings.env == "production";
    let mut access_cookie_to_set: Option<String> = None;
    let mut refresh_cookie_to_set: Option<String> = None;
    let mut csrf_cookie_to_set: Option<String> = None;
    let mut csrf_token_to_publish: Option<String> = None;
    let mut clear_access_cookie = false;
    let mut clear_refresh_cookie = false;
    let access_cookie = auth::session_cookie(request.headers());
    let refresh_cookie = auth::refresh_cookie(request.headers());
    let mut access_valid = false;
    let mut session_authenticated = false;

    if let Some(raw_access) = access_cookie.as_deref() {
        match auth::user_from_raw_session(pool, raw_access).await {
            Ok(Some(_)) => {
                access_valid = true;
                session_authenticated = true;
                let _ = auth::touch_session(pool, raw_access).await;
            }
            Ok(None) => {
                clear_access_cookie = true;
            }
            Err(error) => {
                tracing::warn!(%error, "failed to validate access session");
            }
        }
    }

    if access_valid {
        if let Some(raw_refresh) = refresh_cookie.as_deref() {
            match auth::touch_refresh_session(pool, raw_refresh, refresh_ttl_seconds).await {
                Ok(true) => {
                    refresh_cookie_to_set = Some(auth::refresh_cookie_header_with_max_age(
                        raw_refresh,
                        refresh_ttl_seconds,
                        secure,
                    ));
                }
                Ok(false) => {
                    clear_refresh_cookie = true;
                }
                Err(error) => {
                    tracing::warn!(%error, "failed to touch refresh session");
                }
            }
        }
    } else if let Some(raw_refresh) = refresh_cookie.as_deref() {
        match auth::refresh_session(pool, raw_refresh, access_ttl_seconds, refresh_ttl_seconds)
            .await
        {
            Ok(Some(issued)) => {
                clear_access_cookie = false;
                clear_refresh_cookie = false;
                session_authenticated = true;
                upsert_request_cookie(
                    request.headers_mut(),
                    auth::SESSION_COOKIE_NAME,
                    &issued.raw_token,
                );
                upsert_request_cookie(
                    request.headers_mut(),
                    auth::REFRESH_SESSION_COOKIE_NAME,
                    &issued.refresh_token,
                );
                access_cookie_to_set = Some(auth::session_cookie_header_with_max_age(
                    &issued.raw_token,
                    access_ttl_seconds,
                    secure,
                ));
                refresh_cookie_to_set = Some(auth::refresh_cookie_header_with_max_age(
                    &issued.refresh_token,
                    refresh_ttl_seconds,
                    secure,
                ));
            }
            Ok(None) => {
                clear_refresh_cookie = true;
            }
            Err(error) => {
                tracing::warn!(%error, "failed to refresh expired access session");
            }
        }
    }

    if session_authenticated {
        let csrf_token = csrf::token_from_headers(request.headers()).unwrap_or_else(|| {
            let token = csrf::generate_token();
            upsert_request_cookie(request.headers_mut(), csrf::CSRF_COOKIE_NAME, &token);
            token
        });
        csrf_cookie_to_set = Some(csrf::cookie_header(&csrf_token, secure));
        csrf_token_to_publish = Some(csrf_token);
    }

    let mut response = next.run(request).await;
    if clear_access_cookie {
        append_set_cookie(&mut response, &auth::clear_session_cookie_header(secure));
    }
    if clear_refresh_cookie {
        append_set_cookie(&mut response, &auth::clear_refresh_cookie_header(secure));
    }
    if let Some(cookie) = access_cookie_to_set {
        append_set_cookie(&mut response, &cookie);
    }
    if let Some(cookie) = refresh_cookie_to_set {
        append_set_cookie(&mut response, &cookie);
    }
    if let Some(cookie) = csrf_cookie_to_set {
        append_set_cookie(&mut response, &cookie);
    }
    if let Some(token) = csrf_token_to_publish {
        append_header(
            &mut response,
            header::HeaderName::from_static(csrf::CSRF_HEADER_NAME),
            &token,
        );
    }
    response
}

fn should_try_session_refresh(path: &str, headers: &HeaderMap) -> bool {
    if headers.contains_key(header::AUTHORIZATION) {
        return false;
    }
    if path.starts_with("/static/") || path == "/favicon.ico" || path == "/version.json" {
        return false;
    }
    !matches!(
        path,
        "/web/login"
            | "/web/bootstrap"
            | "/web/bootstrap/init"
            | "/api/openapi.json"
            | "/api/healthz"
            | "/api/readyz"
            | "/api/v1/bootstrap/status"
            | "/api/v1/auth/login"
            | "/api/v1/bootstrap/init"
    )
}

fn upsert_request_cookie(headers: &mut HeaderMap, cookie_name: &str, cookie_value: &str) {
    let current = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let mut pairs = Vec::new();
    let mut replaced = false;
    for part in current
        .split(';')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        let Some((name, value)) = part.split_once('=') else {
            continue;
        };
        if name == cookie_name {
            if !replaced {
                pairs.push((cookie_name.to_string(), cookie_value.to_string()));
                replaced = true;
            }
        } else {
            pairs.push((name.to_string(), value.to_string()));
        }
    }
    if !replaced {
        pairs.push((cookie_name.to_string(), cookie_value.to_string()));
    }
    let merged = pairs
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    if let Ok(value) = merged.parse() {
        headers.insert(header::COOKIE, value);
    }
}

fn append_set_cookie(response: &mut Response, cookie: &str) {
    if let Ok(value) = cookie.parse() {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
}

fn append_header(response: &mut Response, name: header::HeaderName, value: &str) {
    if let Ok(parsed) = value.parse() {
        response.headers_mut().insert(name, parsed);
    }
}

async fn web_error_page_middleware(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let headers = request.headers().clone();
    let response = next.run(request).await;

    if !should_render_web_error_page(&path, &headers, &response) {
        return response;
    }

    let status = response.status();
    let (_parts, body) = response.into_parts();
    let bytes = to_bytes(body, 64 * 1024).await.unwrap_or_default();
    let (code, message) = serde_json::from_slice::<JsonErrorEnvelope>(&bytes)
        .map(|payload| (payload.error.code, payload.error.message))
        .unwrap_or_else(|_| {
            (
                status.canonical_reason().unwrap_or("error").to_string(),
                status
                    .canonical_reason()
                    .unwrap_or("请求处理失败")
                    .to_string(),
            )
        });

    let auto_return = method != Method::GET;
    (
        status,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        Html(render_web_error_page(status, &code, &message, auto_return)),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
struct JsonErrorEnvelope {
    error: JsonErrorBody,
}

#[derive(Debug, Deserialize)]
struct JsonErrorBody {
    code: String,
    message: String,
}

fn should_render_web_error_page(
    path: &str,
    request_headers: &HeaderMap,
    response: &Response,
) -> bool {
    if !(path == "/web" || path.starts_with("/web/"))
        || !response.status().is_client_error() && !response.status().is_server_error()
    {
        return false;
    }
    if is_async_web_request(request_headers) {
        return false;
    }
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if !content_type.contains("application/json") {
        return false;
    }
    let accept = request_headers
        .get(header::ACCEPT)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    accept.is_empty() || accept.contains("text/html") || accept.contains("*/*")
}

fn is_async_web_request(headers: &HeaderMap) -> bool {
    headers.contains_key("x-yuance-web-form")
        || headers
            .get("hx-request")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.eq_ignore_ascii_case("true"))
        || headers
            .get("x-requested-with")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.eq_ignore_ascii_case("xmlhttprequest"))
}

fn render_web_error_page(
    status: StatusCode,
    code: &str,
    message: &str,
    auto_return: bool,
) -> String {
    let title = if auto_return {
        "操作没有完成"
    } else if status == StatusCode::UNAUTHORIZED {
        "登录已失效"
    } else {
        "页面暂时无法访问"
    };
    let escaped_title = escape_html(title);
    let escaped_message = escape_html(message);
    let escaped_code = escape_html(code);
    let message_json =
        serde_json::to_string(message).unwrap_or_else(|_| "\"操作失败，请稍后重试。\"".to_string());
    let auto_return_script = if auto_return {
        format!(
            r#"<script>
(function () {{
  var message = {message_json};
  try {{
    window.sessionStorage.setItem("yuance-pending-toast", JSON.stringify({{ message: message, tone: "error" }}));
  }} catch (_error) {{}}
  try {{
    var referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && referrer.pathname.indexOf("/web") === 0) {{
      window.location.replace(referrer.pathname + referrer.search + referrer.hash);
    }}
  }} catch (_error) {{}}
}}());
</script>"#
        )
    } else {
        String::new()
    };

    format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escaped_title} - 元策</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f5f7fb;
      --card: rgba(255, 255, 255, .94);
      --text: #111827;
      --muted: #64748b;
      --primary: #2f6fed;
      --danger: #dc2626;
      --border: rgba(148, 163, 184, .28);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 18px;
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 18% 18%, rgba(47, 111, 237, .12), transparent 34%),
        radial-gradient(circle at 82% 12%, rgba(220, 38, 38, .10), transparent 28%),
        var(--bg);
    }}
    main {{
      width: min(520px, 100%);
      padding: 30px;
      border: 1px solid var(--border);
      border-radius: 26px;
      background: var(--card);
      box-shadow: 0 24px 70px rgba(15, 23, 42, .12);
    }}
    .eyebrow {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 18px;
      padding: 7px 12px;
      border-radius: 999px;
      color: var(--danger);
      background: rgba(220, 38, 38, .08);
      font-size: 13px;
      font-weight: 700;
    }}
    h1 {{
      margin: 0 0 12px;
      font-size: clamp(26px, 5vw, 34px);
      line-height: 1.18;
      letter-spacing: -.03em;
    }}
    p {{
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.75;
    }}
    .detail {{
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 16px;
      background: #f8fafc;
      color: #334155;
      word-break: break-word;
    }}
    .actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 24px;
    }}
    a, button {{
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 16px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }}
    a.primary {{
      color: #fff;
      background: var(--primary);
      box-shadow: 0 12px 26px rgba(47, 111, 237, .24);
    }}
    button.secondary {{
      color: #334155;
      background: #e2e8f0;
    }}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">HTTP {status_code} · {escaped_code}</div>
    <h1>{escaped_title}</h1>
    <p>{intro}</p>
    <p class="detail">{escaped_message}</p>
    <div class="actions">
      <a class="primary" href="/web">回到工作台</a>
      <button class="secondary" type="button" onclick="history.length > 1 ? history.back() : location.assign('/web')">返回上一页</button>
    </div>
  </main>
  {auto_return_script}
</body>
</html>"#,
        status_code = status.as_u16(),
        intro = if auto_return {
            "系统已经拦截到本次操作的业务错误，正在尝试返回原页面并以消息提示展示原因。"
        } else {
            "系统没有把错误裸露成 JSON，而是用可读页面展示。你可以返回上一页或回到工作台继续操作。"
        }
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

async fn root() -> Redirect {
    Redirect::temporary("/web")
}

async fn static_app_css() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (
                header::CACHE_CONTROL,
                "no-store, max-age=0, must-revalidate",
            ),
        ],
        include_str!("../../static/app.css"),
    )
}

async fn static_app_js() -> impl IntoResponse {
    let bootstrap = format!(
        "window.__YUANCE_APP_RELEASE_VERSION__ = {};\nwindow.__YUANCE_APP_UPDATE_MANIFEST_URL__ = \"/version.json\";\n",
        serde_json::to_string(&app_release_version()).unwrap_or_else(|_| "\"\"".to_string()),
    );
    (
        [
            (
                header::CONTENT_TYPE,
                "application/javascript; charset=utf-8",
            ),
            (
                header::CACHE_CONTROL,
                "no-store, max-age=0, must-revalidate",
            ),
        ],
        format!("{bootstrap}{}", include_str!("../../static/app.js")),
    )
}

async fn version_manifest() -> impl IntoResponse {
    let body = serde_json::json!({
        "version": app_release_version(),
    })
    .to_string();
    (
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (
                header::CACHE_CONTROL,
                "no-store, max-age=0, must-revalidate",
            ),
        ],
        body,
    )
}

pub(crate) fn app_release_version() -> String {
    std::env::var("YUANCE_RELEASE_VERSION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

async fn static_yuance_logo() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/svg+xml; charset=utf-8")],
        include_str!("../../static/brand/yuance-logo.svg"),
    )
}

async fn static_favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/svg+xml; charset=utf-8")],
        include_str!("../../static/brand/yuance-logo.svg"),
    )
}

async fn static_htmx() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../../static/vendor/htmx.min.js"),
    )
}

async fn static_marked() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../../static/vendor/marked/marked.umd.js"),
    )
}

async fn static_dompurify() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../../static/vendor/dompurify/purify.min.js"),
    )
}

async fn static_pdfjs_asset(Path(path): Path<String>) -> Response {
    let normalized = path.trim_matches('/');
    if normalized.is_empty()
        || normalized.starts_with('.')
        || normalized.contains("../")
        || normalized.contains("..\\")
    {
        return StatusCode::NOT_FOUND.into_response();
    }

    let Some(file) = PDFJS_VENDOR_DIR.get_file(normalized) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let content_type = match normalized.rsplit('.').next().unwrap_or_default() {
        "mjs" | "js" => "application/javascript; charset=utf-8",
        "ttf" => "font/ttf",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };

    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        file.contents(),
    )
        .into_response()
}

async fn openapi_json() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        include_str!("../../../docs/openapi/yuance.openapi.json"),
    )
}

async fn api_docs() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenAPI 与 MCP - 元策</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fc;
      --card: rgba(255, 255, 255, .92);
      --text: #172033;
      --muted: #667085;
      --border: rgba(102, 112, 133, .18);
      --primary: #3f72e5;
      --primary-soft: rgba(63, 114, 229, .10);
      --shadow: 0 22px 70px rgba(20, 33, 61, .12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 15% 10%, rgba(63, 114, 229, .14), transparent 30%),
        radial-gradient(circle at 90% 0%, rgba(239, 68, 68, .10), transparent 24%),
        var(--bg);
    }
    .hero {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 22px 20px;
    }
    .hero-card {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
      gap: 22px;
      padding: 28px;
      border: 1px solid var(--border);
      border-radius: 28px;
      background: var(--card);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      margin: 0 0 12px;
      padding: 7px 12px;
      border-radius: 999px;
      color: var(--primary);
      background: var(--primary-soft);
      font-size: 13px;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 12px;
      font-size: clamp(30px, 5vw, 48px);
      line-height: 1.08;
      letter-spacing: -.04em;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.75;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 22px;
    }
    .btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 16px;
      border-radius: 999px;
      font-weight: 800;
      text-decoration: none;
    }
    .btn-primary {
      color: #fff;
      background: var(--primary);
      box-shadow: 0 12px 30px rgba(63, 114, 229, .22);
    }
    .btn-secondary {
      color: #344054;
      background: #eef2f8;
    }
    .mcp-panel {
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .mcp-step {
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(248, 250, 252, .82);
    }
    .mcp-step strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    code {
      padding: 2px 6px;
      border-radius: 8px;
      color: #2458c7;
      background: var(--primary-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: .92em;
    }
    #app {
      min-height: 72vh;
      margin-top: 10px;
      background: #fff;
    }
    @media (max-width: 860px) {
      .hero-card { grid-template-columns: 1fr; padding: 22px; }
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="hero-card">
      <div>
        <p class="eyebrow">OpenAPI · MCP for AI Agents</p>
        <h1>元策 API 文档</h1>
        <p>这里提供标准 OpenAPI 契约与 Scalar 在线文档。AI Agent 可基于 MCP 初始化指南克隆开源仓库，复制本地 MCP server，并通过 Personal Access Token 安全访问元策数据。</p>
        <div class="actions">
          <a class="btn btn-primary" href="/api/openapi.json">下载 OpenAPI JSON</a>
          <a class="btn btn-secondary" href="https://github.com/ZhcChen/yuance/blob/main/docs/mcp/ai-mcp-setup.md">查看 MCP 初始化指南</a>
          <a class="btn btn-secondary" href="/web/me">创建访问 Token</a>
        </div>
      </div>
      <div class="mcp-panel" aria-label="MCP 初始化摘要">
        <div class="mcp-step">
          <strong>1. 克隆开源仓库</strong>
          <p><code>git clone https://github.com/ZhcChen/yuance.git</code></p>
        </div>
        <div class="mcp-step">
          <strong>2. 复制 MCP 脚本并安装依赖</strong>
          <p><code>cp -R mcp/yuance-mcp ~/.yuance-mcp</code> 后执行 <code>npm install</code>。</p>
        </div>
        <div class="mcp-step">
          <strong>3. 配置 MCP client</strong>
          <p>使用 <code>node ~/.yuance-mcp/yuance-mcp-server.mjs</code>，并设置 <code>YUANCE_BASE_URL</code> 与 <code>YUANCE_API_TOKEN</code>。</p>
        </div>
      </div>
    </div>
  </section>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', {
      url: '/api/openapi.json',
      layout: 'modern',
      theme: 'default',
      hideDownloadButton: false,
      metaData: {
        title: '元策 API',
        description: 'OpenAPI 与 MCP for AI Agents'
      }
    });
  </script>
</body>
</html>"#,
    )
}

async fn admin_not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        "元策不提供独立 /admin 后台，请使用 /web。",
    )
}

async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "Not Found")
}
