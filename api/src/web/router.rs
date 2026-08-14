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
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    net::{IpAddr, SocketAddr},
    path::{Path as StdPath, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, watch};

use crate::{
    domains::auth,
    platform::{config::Settings, security::csrf},
    web,
};

static PDFJS_VENDOR_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static/vendor/pdfjs");
static OOXML_VENDOR_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static/vendor/ooxml");
static SHEETJS_VENDOR_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static/vendor/sheetjs");
static LEGACY_DOC_VENDOR_DIR: Dir<'_> =
    include_dir!("$CARGO_MANIFEST_DIR/static/vendor/legacy-doc");
static LEGACY_PPT_VENDOR_DIR: Dir<'_> =
    include_dir!("$CARGO_MANIFEST_DIR/static/vendor/legacy-ppt");

#[derive(Clone, Debug)]
pub struct AppState {
    pub settings: Settings,
    pub pool: Option<sqlx::SqlitePool>,
    device_auth_limiter: Arc<DeviceAuthLimiter>,
    device_stream_shutdown: Arc<watch::Sender<bool>>,
    device_stream_concurrency: Arc<Semaphore>,
    active_device_stream_families: Arc<Mutex<HashSet<String>>>,
}

impl AppState {
    pub fn new(settings: Settings, pool: Option<sqlx::SqlitePool>) -> Self {
        let device_auth_limiter = Arc::new(DeviceAuthLimiter::new(&settings));
        let max_active_streams = settings
            .device_sessions
            .control_max_active_streams()
            .unwrap_or(16);
        Self {
            settings,
            pool,
            device_auth_limiter,
            device_stream_shutdown: Arc::new(watch::channel(false).0),
            device_stream_concurrency: Arc::new(Semaphore::new(max_active_streams)),
            active_device_stream_families: Arc::new(Mutex::new(HashSet::new())),
        }
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
                device_sessions: Default::default(),
                experimental_legacy_preview_enabled: false,
            },
            pool: None,
            device_auth_limiter: Arc::new(DeviceAuthLimiter::default()),
            device_stream_shutdown: Arc::new(watch::channel(false).0),
            device_stream_concurrency: Arc::new(Semaphore::new(16)),
            active_device_stream_families: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn pool(&self) -> crate::platform::error::AppResult<&sqlx::SqlitePool> {
        self.pool.as_ref().ok_or_else(|| {
            crate::platform::error::AppError::Config("SQLite pool is not configured".to_string())
        })
    }

    pub(crate) fn try_device_auth_permit(&self) -> Option<tokio::sync::OwnedSemaphorePermit> {
        self.device_auth_limiter
            .concurrency
            .clone()
            .try_acquire_owned()
            .ok()
    }

    pub(crate) fn subscribe_device_stream_shutdown(&self) -> watch::Receiver<bool> {
        self.device_stream_shutdown.subscribe()
    }

    pub fn shutdown_device_streams(&self) {
        self.device_stream_shutdown.send_replace(true);
    }

    pub(crate) fn try_device_stream_permit(&self, family_id: &str) -> Option<DeviceStreamPermit> {
        let global = self
            .device_stream_concurrency
            .clone()
            .try_acquire_owned()
            .ok()?;
        let mut active = self.active_device_stream_families.lock().ok()?;
        if !active.insert(family_id.to_string()) {
            return None;
        }
        drop(active);
        Some(DeviceStreamPermit {
            family_id: family_id.to_string(),
            active: self.active_device_stream_families.clone(),
            _global: global,
        })
    }
}

pub(crate) struct DeviceStreamPermit {
    family_id: String,
    active: Arc<Mutex<HashSet<String>>>,
    _global: tokio::sync::OwnedSemaphorePermit,
}

impl Drop for DeviceStreamPermit {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(&self.family_id);
        }
    }
}

#[derive(Debug)]
struct DeviceAuthLimiter {
    attempts: Mutex<HashMap<String, VecDeque<Instant>>>,
    concurrency: Arc<Semaphore>,
    trusted_proxy_networks: Vec<ipnet::IpNet>,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct DeviceAuthClientIp(pub Option<IpAddr>);

impl Default for DeviceAuthLimiter {
    fn default() -> Self {
        Self {
            attempts: Mutex::new(HashMap::new()),
            concurrency: Arc::new(Semaphore::new(16)),
            trusted_proxy_networks: vec!["127.0.0.0/8".parse().expect("loopback CIDR is valid")],
        }
    }
}

impl DeviceAuthLimiter {
    fn new(settings: &Settings) -> Self {
        Self {
            trusted_proxy_networks: settings
                .device_sessions
                .trusted_proxy_networks()
                .unwrap_or_default(),
            ..Self::default()
        }
    }

    fn allow_pair(
        &self,
        peer_key: String,
        peer_limit: usize,
        global_key: String,
        global_limit: usize,
    ) -> bool {
        let now = Instant::now();
        let cutoff = now - Duration::from_secs(60);
        let Ok(mut attempts) = self.attempts.lock() else {
            return false;
        };
        for key in [&peer_key, &global_key] {
            let bucket = attempts.entry(key.clone()).or_default();
            while bucket.front().is_some_and(|attempt| *attempt <= cutoff) {
                bucket.pop_front();
            }
        }
        if attempts
            .get(&peer_key)
            .is_some_and(|bucket| bucket.len() >= peer_limit)
            || attempts
                .get(&global_key)
                .is_some_and(|bucket| bucket.len() >= global_limit)
        {
            return false;
        }
        attempts.entry(peer_key).or_default().push_back(now);
        attempts.entry(global_key).or_default().push_back(now);
        if attempts.len() > 4096 {
            attempts.retain(|_, bucket| bucket.back().is_some_and(|attempt| *attempt > cutoff));
        }
        true
    }
}

pub fn build_router(state: AppState) -> Router {
    let middleware_state = state.clone();
    let device_boundary_state = state.clone();
    Router::new()
        .route("/", get(root))
        .route("/web", get(web::user::dashboard))
        .route("/web/app", get(static_web_app_entry))
        .route("/web/app/", get(static_web_app_entry))
        .route("/web/app/{*path}", get(static_web_app_asset))
        .route("/web/downloads", get(web::user::desktop_downloads_page))
        .route(
            "/web/downloads/{release_id}/assets/{asset_id}",
            get(web::user::desktop_download_asset),
        )
        .route("/web/me", get(web::user::me_page))
        .route(
            "/web/device-authorization",
            get(web::device_auth::authorization_page),
        )
        .route(
            "/web/device-authorization/approve",
            post(web::device_auth::approve_authorization),
        )
        .route(
            "/web/device-authorization/deny",
            post(web::device_auth::deny_authorization),
        )
        .route("/web/search", get(web::user::search_page))
        .route("/web/messages", get(web::user::messages_page))
        .route("/web/projects", get(web::user::projects_page))
        .route(
            "/web/projects/{project_key}",
            get(web::user::project_detail_page),
        )
        .route(
            "/web/projects/{project_key}/cycles/{cycle_id}",
            get(web::user::project_cycle_detail_page),
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
            "/web/projects/{project_key}/resources/{resource_id}",
            get(web::user::project_resource_detail_page),
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
        .route(
            "/web/work-items/{item_key}",
            get(web::user::work_item_detail_page),
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
        .route("/web/system/users", get(web::user::system_users_page))
        .route("/web/system/roles", get(web::user::system_roles_page))
        .route(
            "/web/system/roles/{role_code}/permissions",
            get(web::user::system_role_permissions_page),
        )
        .route(
            "/web/system/permissions",
            get(web::user::system_permissions_page),
        )
        .route(
            "/web/system/storage",
            get(web::user::storage_settings),
        )
        .route(
            "/web/system/openapi",
            get(web::user::system_openapi_page),
        )
        .route(
            "/web/system/releases",
            get(web::user::system_releases_page),
        )
        .route(
            "/web/system/releases/{release_id}/assets/{asset_id}/download",
            get(web::user::system_release_asset_download),
        )
        .route(
            "/web/system/database-stats",
            get(web::user::system_database_stats_page),
        )
        .route("/web/system/audit", get(web::user::system_audit_page))
        .route("/web/api-docs", get(api_docs))
        .route(
            "/web/system/api-docs",
            get(web::user::system_api_docs_page),
        )
        .route("/api/openapi.json", get(openapi_json))
        .route("/api/system/openapi.json", get(system_openapi_json))
        .route(
            "/.well-known/yuance-desktop",
            get(web::desktop_enrollment::desktop_enrollment),
        )
        .route("/api/healthz", get(web::api::healthz))
        .route("/api/readyz", get(web::api::readyz))
        .route("/api/v1/bootstrap/status", get(web::api::bootstrap_status))
        .route("/api/v1/auth/login", post(web::api::login))
        .route(
            "/api/v1/device-authorizations",
            post(web::device_auth::start_authorization),
        )
        .route(
            "/api/v1/device-authorizations/exchange",
            post(web::device_auth::exchange_authorization),
        )
        .route(
            "/api/v1/device-sessions/refresh",
            post(web::device_auth::rotate_refresh),
        )
        .route(
            "/api/v1/device-session",
            get(web::device_auth::probe_device_session),
        )
        .route(
            "/api/v1/device-session/logout",
            post(web::device_auth::logout_device_session),
        )
        .route(
            "/api/v1/device-session/events",
            get(web::device_auth::device_session_control),
        )
        .route(
            "/api/v1/device-file-transfer/canary/upload-request",
            post(web::device_file_transfer::canary_upload_request),
        )
        .route(
            "/api/v1/device-file-transfer/canary/download-request",
            get(web::device_file_transfer::canary_download_request),
        )
        .route(
            "/api/v1/device-file-transfer/canary/upload",
            put(web::device_file_transfer::canary_upload),
        )
        .route(
            "/api/v1/device-file-transfer/canary/download",
            get(web::device_file_transfer::canary_download),
        )
        .route("/api/v1/auth/me", get(web::api::me))
        .route(
            "/api/v1/me/profile",
            get(web::api::get_own_profile).patch(web::api::update_own_profile),
        )
        .route(
            "/api/v1/me/password",
            patch(web::api::update_own_password),
        )
        .route("/api/v1/auth/csrf", get(web::auth_api::csrf_token))
        .route("/api/v1/auth/logout", post(web::api::logout))
        .route(
            "/api/v1/me/tokens",
            get(web::api::list_api_tokens).post(web::api::create_api_token),
        )
        .route(
            "/api/v1/me/tokens/{token_id}",
            patch(web::api::update_api_token).delete(web::api::delete_api_token),
        )
        .route(
            "/api/v1/me/device-sessions",
            get(web::api::list_device_sessions),
        )
        .route(
            "/api/v1/me/device-sessions/{family_id}",
            delete(web::api::revoke_device_session),
        )
        .route(
            "/api/v1/bootstrap/init",
            axum::routing::post(web::api::bootstrap_init),
        )
        .route(
            "/api/v1/system/dashboard",
            get(web::api::get_system_dashboard),
        )
        .route(
            "/api/v1/system/users",
            get(web::api::list_system_users).post(web::api::create_system_user),
        )
        .route(
            "/api/v1/system/users-view",
            get(web::api::get_system_users_view),
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
            "/api/v1/system/users/{username}/projects",
            post(web::api::assign_system_user_projects)
                .delete(web::api::remove_system_user_projects),
        )
        .route(
            "/api/v1/system/users/{username}/projects/{project_key}",
            delete(web::api::remove_system_user_project),
        )
        .route(
            "/api/v1/system/users/{username}/projects/{project_key}/role",
            patch(web::api::update_system_user_project_role),
        )
        .route(
            "/api/v1/system/roles",
            get(web::api::list_system_roles).post(web::api::create_system_role),
        )
        .route(
            "/api/v1/system/roles-view",
            get(web::api::get_system_roles_view),
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
            "/api/v1/system/storage-view",
            get(web::api::get_system_storage_view),
        )
        .route(
            "/api/v1/system/audit",
            get(web::api::list_system_audit_logs),
        )
        .route(
            "/api/v1/system/openapi-view",
            get(web::api::get_system_openapi_view),
        )
        .route(
            "/api/v1/system/api-docs-view",
            get(web::api::get_system_api_docs),
        )
        .route(
            "/api/v1/system/api-tokens",
            post(web::api::create_system_api_token),
        )
        .route(
            "/api/v1/system/api-tokens/{token_id}",
            axum::routing::patch(web::api::update_system_api_token)
                .delete(web::api::delete_system_api_token),
        )
        .route(
            "/api/v1/system/releases/settings",
            get(web::api::get_system_release_settings)
                .patch(web::api::update_system_release_settings),
        )
        .route(
            "/api/v1/system/releases-view",
            get(web::api::get_system_releases_view),
        )
        .route(
            "/api/v1/system/releases",
            get(web::api::list_system_releases).post(web::api::create_system_release),
        )
        .route(
            "/api/v1/system/releases/{release_id}",
            get(web::api::get_system_release).patch(web::api::update_system_release),
        )
        .route(
            "/api/v1/system/releases/{release_id}/verify",
            post(web::api::verify_system_release),
        )
        .route(
            "/api/v1/system/releases/{release_id}/withdraw",
            post(web::api::withdraw_system_release),
        )
        .route(
            "/api/v1/system/releases/{release_id}/withdrawal",
            patch(web::api::update_system_release_withdrawal),
        )
        .route(
            "/api/v1/system/releases/{release_id}/assets",
            post(web::api::create_system_release_asset),
        )
        .route(
            "/api/v1/system/releases/{release_id}/assets/{asset_id}/upload-url",
            get(web::api::system_release_asset_upload_url),
        )
        .route(
            "/api/v1/system/releases/{release_id}/assets/{asset_id}/download-url",
            get(web::api::system_release_asset_download_url),
        )
        .route(
            "/api/v1/system/releases/{release_id}/assets/{asset_id}/uploaded",
            post(web::api::system_release_asset_mark_uploaded),
        )
        .route(
            "/api/v1/system/releases/{release_id}/assets/{asset_id}",
            delete(web::api::delete_system_release_asset),
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
            "/api/v1/test-storage/download",
            get(web::api::test_storage_download),
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
        .route("/api/v1/dashboard", get(web::api::get_dashboard))
        .route("/api/v1/topbar/events", get(web::api::topbar_events))
        .route("/api/v1/search", get(web::api::search))
        .route(
            "/api/v1/projects/{project_key}",
            get(web::api::get_project).patch(web::api::update_project),
        )
        .route(
            "/api/v1/projects/{project_key}/members",
            get(web::api::list_project_members).post(web::api::add_project_member),
        )
        .route(
            "/api/v1/projects/{project_key}/members/candidates",
            get(web::api::list_project_member_candidates),
        )
        .route(
            "/api/v1/projects/{project_key}/members/batch",
            post(web::api::add_project_members),
        )
        .route(
            "/api/v1/projects/{project_key}/members/{username}",
            patch(web::api::update_project_member_role).delete(web::api::remove_project_member),
        )
        .route(
            "/api/v1/projects/{project_key}/cycles",
            get(web::api::list_project_cycles).post(web::api::create_project_cycle),
        )
        .route(
            "/api/v1/projects/{project_key}/my-analysis",
            get(web::api::get_project_personal_analysis),
        )
        .route(
            "/api/v1/projects/{project_key}/cycles/{cycle_id}",
            get(web::api::get_project_cycle).patch(web::api::update_project_cycle),
        )
        .route(
            "/api/v1/projects/{project_key}/cycles/{cycle_id}/close",
            post(web::api::close_project_cycle),
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
            "/api/v1/projects/{project_key}/attachments/{attachment_id}/preview",
            get(web::api::project_attachment_preview),
        )
        .route(
            "/api/v1/projects/{project_key}/attachments/{attachment_id}/preview/content",
            get(web::api::project_attachment_preview_content)
                .head(web::api::project_attachment_preview_content),
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
            "/api/v1/projects/{project_key}/resources/{resource_id}/password/reset",
            post(web::api::reset_project_resource_password),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments",
            get(web::api::list_project_resource_attachments)
                .post(web::api::create_project_resource_attachment),
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
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview",
            get(web::api::project_resource_attachment_preview),
        )
        .route(
            "/api/v1/projects/{project_key}/resources/{resource_id}/attachments/{attachment_id}/preview/content",
            get(web::api::project_resource_attachment_preview_content)
                .head(web::api::project_resource_attachment_preview_content),
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
        .route(
            "/api/v1/work-items/batch",
            post(web::api::batch_update_work_items),
        )
        .route(
            "/api/v1/work-item-list-view",
            get(web::api::get_work_item_list_view),
        )
        .route(
            "/api/v1/work-item-saved-views",
            post(web::api::create_work_item_saved_view),
        )
        .route(
            "/api/v1/work-item-saved-views/{saved_view_id}",
            patch(web::api::rename_work_item_saved_view)
                .delete(web::api::delete_work_item_saved_view),
        )
        .route(
            "/api/v1/work-item-saved-views/{saved_view_id}/default",
            post(web::api::set_default_work_item_saved_view),
        )
        .route("/api/v1/notifications", get(web::api::list_notifications))
        .route(
            "/api/v1/notifications/read-all",
            post(web::api::mark_all_notifications_read),
        )
        .route(
            "/api/v1/notifications/{notification_id}/target",
            get(web::api::get_notification_target),
        )
        .route(
            "/api/v1/notifications/{notification_id}/read",
            post(web::api::mark_notification_read),
        )
        .route(
            "/api/v1/work-items/{item_key}",
            get(web::api::get_work_item).patch(web::api::update_work_item),
        )
        .route(
            "/api/v1/work-item-detail-view/{item_key}",
            get(web::api::get_work_item_detail_view),
        )
        .route(
            "/api/v1/work-items/{item_key}/restore",
            post(web::api::restore_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}/primary-post",
            axum::routing::patch(web::api::update_work_item_primary_post),
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
            "/api/v1/work-items/{item_key}/comments/{comment_id}/draft",
            delete(web::api::cancel_work_item_comment_draft),
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
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview",
            get(web::api::work_item_comment_attachment_preview),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{attachment_id}/preview/content",
            get(web::api::work_item_comment_attachment_preview_content)
                .head(web::api::work_item_comment_attachment_preview_content),
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
        .route(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/preview",
            get(web::api::work_item_attachment_preview),
        )
        .route(
            "/api/v1/work-items/{item_key}/attachments/{attachment_id}/preview/content",
            get(web::api::work_item_attachment_preview_content)
                .head(web::api::work_item_attachment_preview_content),
        )
        .route("/version.json", get(version_manifest))
        .route("/static/auth.css", get(static_auth_css))
        .route(
            "/static/desktop-downloads.css",
            get(static_desktop_downloads_css),
        )
        .route(
            "/static/document-preview.css",
            get(static_document_preview_css),
        )
        .route("/static/document-preview.mjs", get(static_document_preview))
        .route(
            "/static/document-preview-legacy.mjs",
            get(static_document_preview_legacy),
        )
        .route("/static/brand/yuance-logo.svg", get(static_yuance_logo))
        .route("/static/vendor/htmx.min.js", get(static_htmx))
        .route("/static/vendor/marked/marked.umd.js", get(static_marked))
        .route("/static/vendor/dompurify/purify.min.js", get(static_dompurify))
        .route("/static/vendor/pdfjs/{*path}", get(static_pdfjs_asset))
        .route("/static/vendor/ooxml/{*path}", get(static_ooxml_asset))
        .route("/static/vendor/sheetjs/{*path}", get(static_sheetjs_asset))
        .route(
            "/static/vendor/legacy-doc/{*path}",
            get(static_legacy_doc_asset),
        )
        .route(
            "/static/vendor/legacy-ppt/{*path}",
            get(static_legacy_ppt_asset),
        )
        .route("/favicon.ico", get(static_favicon))
        .route("/admin", get(admin_not_found))
        .fallback(not_found)
        .layer(axum::middleware::from_fn(web_error_page_middleware))
        .layer(axum::middleware::from_fn_with_state(
            middleware_state,
            session_refresh_middleware,
        ))
        .layer(axum::middleware::from_fn_with_state(
            device_boundary_state,
            device_auth_boundary_middleware,
        ))
        .with_state(state)
}

async fn device_auth_boundary_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path();
    let is_account_device_revoke = request.method() == Method::DELETE
        && path
            .strip_prefix("/api/v1/me/device-sessions/")
            .is_some_and(|family_id| !family_id.is_empty() && !family_id.contains('/'));
    let boundary = match path {
        "/api/v1/device-authorizations" => (120, 20, true, true, false),
        "/api/v1/device-authorizations/exchange" => (600, 120, true, true, false),
        "/api/v1/device-sessions/refresh" => (600, 120, true, true, false),
        "/api/v1/device-session"
        | "/api/v1/device-session/logout"
        | "/api/v1/device-session/events"
        | "/api/v1/device-file-transfer/canary/upload-request"
        | "/api/v1/device-file-transfer/canary/download-request" => (1200, 120, true, false, false),
        "/api/v1/device-file-transfer/canary/upload"
        | "/api/v1/device-file-transfer/canary/download" => (1200, 120, true, true, false),
        "/web/device-authorization"
        | "/web/device-authorization/approve"
        | "/web/device-authorization/deny" => (600, 30, false, false, true),
        _ if is_account_device_revoke => (600, 30, false, false, false),
        _ => return next.run(request).await,
    };
    let (global_limit, peer_limit, reject_cookie, reject_authorization, browser_response) =
        boundary;
    if (reject_cookie && request.headers().contains_key(header::COOKIE))
        || (reject_authorization && request.headers().contains_key(header::AUTHORIZATION))
    {
        return web::device_auth::credential_not_allowed_response();
    }
    let client_ip = trusted_client_ip(&request, &state.device_auth_limiter.trusted_proxy_networks);
    let peer = client_ip.map_or_else(|| "unknown".to_string(), |ip| ip.to_string());
    let rate_limit_path = if is_account_device_revoke {
        "/api/v1/me/device-sessions/{family_id}"
    } else {
        path
    };
    if !state.device_auth_limiter.allow_pair(
        format!("peer:{peer}:{rate_limit_path}"),
        peer_limit,
        format!("global:{rate_limit_path}"),
        global_limit,
    ) {
        return if browser_response {
            web::device_auth::browser_rate_limited_response()
        } else {
            web::device_auth::rate_limited_response(60)
        };
    }
    request
        .extensions_mut()
        .insert(DeviceAuthClientIp(client_ip));
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("private, no-store"),
    );
    response
}

fn trusted_client_ip(request: &Request, trusted_proxies: &[ipnet::IpNet]) -> Option<IpAddr> {
    let direct_peer = request
        .extensions()
        .get::<axum::extract::ConnectInfo<SocketAddr>>()?
        .0
        .ip();
    if !trusted_proxies
        .iter()
        .any(|network| network.contains(&direct_peer))
    {
        return Some(direct_peer);
    }
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            let forwarded = value
                .split(',')
                .map(str::trim)
                .map(str::parse::<IpAddr>)
                .collect::<Result<Vec<_>, _>>()
                .ok()?;
            forwarded.into_iter().rev().find(|address| {
                !trusted_proxies
                    .iter()
                    .any(|network| network.contains(address))
            })
        })
        .or(Some(direct_peer))
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
    if path.starts_with("/static/")
        || path == "/favicon.ico"
        || path == "/version.json"
        || path.starts_with("/web/app/assets/")
        || path == "/web/app/manifest.json"
    {
        return false;
    }
    !matches!(
        path,
        "/web/login"
            | "/web/bootstrap"
            | "/web/bootstrap/init"
            | "/api/openapi.json"
            | "/api/system/openapi.json"
            | "/.well-known/yuance-desktop"
            | "/api/healthz"
            | "/api/readyz"
            | "/api/v1/bootstrap/status"
            | "/api/v1/auth/login"
            | "/api/v1/device-authorizations"
            | "/api/v1/device-authorizations/exchange"
            | "/api/v1/device-sessions/refresh"
            | "/api/v1/device-session"
            | "/api/v1/device-session/logout"
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

async fn static_web_app_entry(State(state): State<AppState>) -> Response {
    web_app_entry_response(&state)
}

pub fn web_app_entry_response(state: &AppState) -> Response {
    serve_web_app_path(state, "")
}

async fn static_web_app_asset(State(state): State<AppState>, Path(path): Path<String>) -> Response {
    serve_web_app_path(&state, &path)
}

fn serve_web_app_path(state: &AppState, requested_path: &str) -> Response {
    let dist_dir = state.settings.web_dist_dir();
    if !dist_dir.is_dir() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (
                    header::CACHE_CONTROL,
                    "no-store, max-age=0, must-revalidate",
                ),
            ],
            "<!doctype html><html lang=\"zh-CN\"><body><main><h1>Web App 构建物缺失</h1><p>请先执行 npm --prefix web run build，或在镜像构建阶段生成 web/dist。</p></main></body></html>".to_string(),
        )
            .into_response();
    }

    let Some(normalized) = normalize_web_app_path(requested_path) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let is_navigation = normalized.is_empty()
        || !normalized
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .contains('.');
    let relative_path = if is_navigation {
        "index.html".to_string()
    } else {
        normalized.clone()
    };
    let file_path = dist_dir.join(&relative_path);
    if !file_path.is_file() {
        return StatusCode::NOT_FOUND.into_response();
    }

    let content = match fs::read(&file_path) {
        Ok(content) => content,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let content = if relative_path == "index.html" {
        let html = String::from_utf8_lossy(&content).into_owned();
        let version = serde_json::to_string(&app_release_version())
            .unwrap_or_else(|_| "\"\"".to_string());
        html.replace(WEB_APP_RELEASE_VERSION_PLACEHOLDER, &version)
            .into_bytes()
    } else {
        content
    };

    let cache_control = if relative_path == "index.html" || relative_path == "manifest.json" {
        "no-store, max-age=0, must-revalidate"
    } else if relative_path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-store, max-age=0, must-revalidate"
    };

    (
        [
            (header::CONTENT_TYPE, web_app_content_type(&relative_path)),
            (header::CACHE_CONTROL, cache_control),
        ],
        content,
    )
        .into_response()
}

const WEB_APP_RELEASE_VERSION_PLACEHOLDER: &str = "\"__YUANCE_RELEASE_VERSION_PLACEHOLDER__\"";

fn normalize_web_app_path(requested_path: &str) -> Option<String> {
    let trimmed = requested_path.trim_matches('/');
    if trimmed.is_empty() {
        return Some(String::new());
    }

    let candidate = PathBuf::from(trimmed);
    if candidate
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return None;
    }

    Some(trimmed.to_string())
}

fn web_app_content_type(path: &str) -> &'static str {
    match StdPath::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

async fn static_auth_css() -> impl IntoResponse {
    static_boundary_css(include_str!("../../static/auth.css"))
}

async fn static_desktop_downloads_css() -> impl IntoResponse {
    static_boundary_css(include_str!("../../static/desktop-downloads.css"))
}

async fn static_document_preview_css() -> impl IntoResponse {
    static_boundary_css(include_str!("../../static/document-preview.css"))
}

fn static_boundary_css(content: &'static str) -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (
                header::CACHE_CONTROL,
                "no-store, max-age=0, must-revalidate",
            ),
        ],
        content,
    )
}

async fn static_document_preview() -> impl IntoResponse {
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
        include_str!("../../static/document-preview.mjs"),
    )
}

async fn static_document_preview_legacy() -> impl IntoResponse {
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
        include_str!("../../static/document-preview-legacy.mjs"),
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
    static_dir_asset_response(&PDFJS_VENDOR_DIR, &path)
}

async fn static_ooxml_asset(Path(path): Path<String>) -> Response {
    static_dir_asset_response(&OOXML_VENDOR_DIR, &path)
}

async fn static_sheetjs_asset(Path(path): Path<String>) -> Response {
    static_dir_asset_response(&SHEETJS_VENDOR_DIR, &path)
}

async fn static_legacy_doc_asset(Path(path): Path<String>) -> Response {
    static_dir_asset_response(&LEGACY_DOC_VENDOR_DIR, &path)
}

async fn static_legacy_ppt_asset(Path(path): Path<String>) -> Response {
    static_dir_asset_response(&LEGACY_PPT_VENDOR_DIR, &path)
}

fn static_dir_asset_response(dir: &Dir<'_>, path: &str) -> Response {
    let normalized = path.trim_matches('/');
    if normalized.is_empty()
        || normalized.starts_with('.')
        || normalized.contains("../")
        || normalized.contains("..\\")
    {
        return StatusCode::NOT_FOUND.into_response();
    }

    let Some(file) = dir.get_file(normalized) else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let content_type = match normalized.rsplit('.').next().unwrap_or_default() {
        "mjs" | "js" => "application/javascript; charset=utf-8",
        "wasm" => "application/wasm",
        "otf" => "font/otf",
        "ttf" => "font/ttf",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };

    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        file.contents().to_vec(),
    )
        .into_response()
}

async fn openapi_json() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        include_str!("../../../docs/openapi/yuance.openapi.json"),
    )
}

async fn system_openapi_json() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        include_str!("../../../docs/openapi/yuance-system.openapi.json"),
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
  <title>OpenAPI 与 Codex Skill - 元策</title>
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
    .agent-panel {
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .setup-step {
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(248, 250, 252, .82);
    }
    .setup-step strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .setup-step code {
      overflow-wrap: anywhere;
      word-break: break-word;
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
        <p class="eyebrow">OpenAPI · Codex Skill</p>
        <h1>元策 API 文档</h1>
        <p>这里提供标准 OpenAPI 契约与 Scalar 在线文档。Codex 可通过预编译的元策 Skill 和 Personal Access Token 安全访问项目、工作项与评论，无需 Node.js 或 Rust toolchain。</p>
        <div class="actions">
          <a class="btn btn-primary" href="/api/openapi.json">下载 OpenAPI JSON</a>
          <a class="btn btn-secondary" href="https://github.com/ZhcChen/yuance/blob/main/docs/runbooks/yuance-agent-codex-installation.md">查看 Codex Skill 指南</a>
          <a class="btn btn-secondary" href="/web/me">创建访问 Token</a>
        </div>
      </div>
      <div class="agent-panel" aria-label="Codex Skill 安装摘要">
        <div class="setup-step">
          <strong>1. macOS / Linux 安装</strong>
          <p><code>curl -fsSL https://raw.githubusercontent.com/ZhcChen/yuance/yuance-agent-v0.1.1/scripts/install-codex-skill.sh | bash</code></p>
        </div>
        <div class="setup-step">
          <strong>2. Windows PowerShell 安装</strong>
          <p><code>irm https://raw.githubusercontent.com/ZhcChen/yuance/yuance-agent-v0.1.1/scripts/install-codex-skill.ps1 | iex</code></p>
        </div>
        <div class="setup-step">
          <strong>3. 配置访问凭证</strong>
          <p>在 Codex 运行环境设置 <code>YUANCE_API_TOKEN</code>；仅在覆盖默认正式环境时设置 <code>YUANCE_BASE_URL</code>。</p>
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
        description: 'OpenAPI 与 Codex Skill for AI Agents'
      }
    });
  </script>
</body>
</html>"#,
    )
}

pub fn system_api_docs_response() -> Response {
    Html(r#"<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>系统 API 文档 - 元策</title>
  <style>
    * { box-sizing: border-box; }
    html, body, #app { min-height: 100%; margin: 0; }
    body { color: #172033; background: #f6f8fc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .docs-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 24px; border-bottom: 1px solid #dce3ee; background: #fff; }
    .docs-head h1 { margin: 0 0 6px; font-size: 22px; line-height: 30px; }
    .docs-head p { margin: 0; color: #667085; font-size: 13px; line-height: 20px; }
    .docs-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .docs-actions a { min-height: 34px; display: inline-flex; align-items: center; padding: 0 12px; border: 1px solid #cfd8e6; border-radius: 6px; color: #344054; background: #fff; font-size: 13px; font-weight: 700; text-decoration: none; }
    #app { min-height: calc(100vh - 91px); }
    @media (max-width: 720px) { .docs-head { flex-direction: column; padding: 16px; } #app { min-height: calc(100vh - 137px); } }
  </style>
</head>
<body>
  <header class="docs-head">
    <div><h1>元策系统 API</h1><p>面向版本发布自动化的独立 System OpenAPI 契约。</p></div>
    <nav class="docs-actions" aria-label="文档操作"><a href="/api/system/openapi.json">下载 OpenAPI JSON</a><a href="/web/system/openapi">系统 Token 管理</a></nav>
  </header>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>Scalar.createApiReference('#app',{url:'/api/system/openapi.json',layout:'modern',theme:'default',hideDownloadButton:false});</script>
</body>
</html>"#).into_response()
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
