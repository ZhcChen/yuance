use axum::{
    Router,
    http::{StatusCode, header},
    response::{IntoResponse, Redirect},
    routing::{delete, get, post},
};

use crate::{platform::config::Settings, web};

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
                http_addr: "127.0.0.1:33033"
                    .parse()
                    .expect("test socket address should parse"),
                database_url: "sqlite://:memory:".to_string(),
                data_dir: "data".to_string(),
                session_secret: "test-session-secret".to_string(),
                session_ttl: "12h".to_string(),
                cache_session_ttl: "5m".to_string(),
                log_level: "off".to_string(),
                env: "test".to_string(),
                security_master_key: "test-master-key".to_string(),
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
    Router::new()
        .route("/", get(root))
        .route("/web", get(web::user::dashboard))
        .route("/web/me", get(web::user::me_page))
        .route("/web/search", get(web::user::search_page))
        .route(
            "/web/projects",
            get(web::user::projects_page).post(web::user::projects_create),
        )
        .route(
            "/web/projects/{project_key}",
            get(web::user::project_detail_page),
        )
        .route(
            "/web/projects/{project_key}/members",
            post(web::user::project_member_add),
        )
        .route(
            "/web/projects/{project_key}/members/{username}/remove",
            post(web::user::project_member_remove),
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
            "/web/work-items/{item_key}/status",
            post(web::user::work_item_status_update),
        )
        .route(
            "/web/work-items/{item_key}/comments",
            post(web::user::work_item_comment_create),
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
        .route("/web/system/audit", get(web::user::system_audit_page))
        .route(
            "/web/partials/work-items",
            get(web::user::work_items_partial),
        )
        .route(
            "/web/partials/work-items/{item_key}",
            get(web::user::work_item_detail_partial),
        )
        .route("/api/healthz", get(web::api::healthz))
        .route("/api/readyz", get(web::api::readyz))
        .route("/api/v1/bootstrap/status", get(web::api::bootstrap_status))
        .route(
            "/api/v1/bootstrap/init",
            axum::routing::post(web::api::unsupported_mutation),
        )
        .route(
            "/api/v1/projects",
            get(web::api::list_projects).post(web::api::create_project),
        )
        .route(
            "/api/v1/projects/{project_key}",
            get(web::api::get_project).patch(web::api::unsupported_mutation),
        )
        .route(
            "/api/v1/projects/{project_key}/members",
            post(web::api::add_project_member),
        )
        .route(
            "/api/v1/projects/{project_key}/members/{username}",
            delete(web::api::remove_project_member),
        )
        .route(
            "/api/v1/work-items",
            get(web::api::list_work_items).post(web::api::create_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}",
            get(web::api::get_work_item).patch(web::api::update_work_item),
        )
        .route(
            "/api/v1/work-items/{item_key}/comments",
            post(web::api::create_work_item_comment),
        )
        .route("/static/app.css", get(static_app_css))
        .route("/static/app.js", get(static_app_js))
        .route("/static/vendor/htmx.min.js", get(static_htmx))
        .route("/admin", get(admin_not_found))
        .fallback(not_found)
        .with_state(state)
}

async fn root() -> Redirect {
    Redirect::temporary("/web")
}

async fn static_app_css() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../../static/app.css"),
    )
}

async fn static_app_js() -> impl IntoResponse {
    (
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../../static/app.js"),
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

async fn admin_not_found() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        "元策不提供独立 /admin 后台，请使用 /web。",
    )
}

async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "Not Found")
}
