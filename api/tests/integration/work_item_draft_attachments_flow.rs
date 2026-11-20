//! 新建工作项草稿附件：无需工作项即可上传，写主帖时原地改绑。

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use tower::ServiceExt;
use yuance_api::{
    domains::{auth, bootstrap, files, projects, rbac, storage},
    platform::{config::Settings, db},
    web::router::{AppState, build_router},
};

const CSRF_TOKEN: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DRAFTS: &str = "/api/v1/projects/YCE/work-item-draft-attachments";

struct Session {
    user_id: i64,
    cookie: String,
}

struct Fixture {
    pool: sqlx::SqlitePool,
    app: axum::Router,
    admin: Session,
    project_id: i64,
}

async fn fixture() -> Fixture {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed should apply");
    seed_memory_storage_config(&pool, admin.user_id).await;
    let project_id = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project should load")
        .expect("project should exist")
        .id;
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    Fixture {
        pool,
        app,
        admin,
        project_id,
    }
}

async fn send(
    app: &axum::Router,
    method: &str,
    uri: &str,
    cookie: &str,
    body: Option<serde_json::Value>,
) -> (StatusCode, serde_json::Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, cookie)
        .header("x-yuance-csrf-token", CSRF_TOKEN);
    if body.is_some() {
        builder = builder.header(header::CONTENT_TYPE, "application/json");
    }
    let request = builder
        .body(body.map_or_else(Body::empty, |value| Body::from(value.to_string())))
        .expect("request should build");
    let response = app
        .clone()
        .oneshot(request)
        .await
        .expect("router should respond");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body should collect")
        .to_bytes();
    let value = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, value)
}

/// 通过 API 登记草稿附件，可选写入对象并确认上传。返回附件 id。
async fn create_draft(fixture: &Fixture, cookie: &str, filename: &str, upload: bool) -> i64 {
    let (status, created) = send(
        &fixture.app,
        "POST",
        DRAFTS,
        cookie,
        Some(serde_json::json!({
            "original_filename": filename,
            "content_type": "image/png",
            "byte_size": 4,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let id = created["data"]["id"].as_i64().expect("draft id");
    if upload {
        let attachment = files::get_attachment(&fixture.pool, id)
            .await
            .expect("attachment should load");
        write_test_object(&fixture.pool, &attachment).await;
        let (status, uploaded) = send(
            &fixture.app,
            "POST",
            &format!("{DRAFTS}/{id}/uploaded"),
            cookie,
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{uploaded}");
        assert_eq!(uploaded["data"]["status"], "uploaded");
    }
    id
}

async fn create_work_item(fixture: &Fixture) -> String {
    let (status, created) = send(
        &fixture.app,
        "POST",
        "/api/v1/work-items",
        &fixture.admin.cookie,
        Some(serde_json::json!({
            "project_key": "YCE",
            "item_type": "requirement",
            "title": "草稿附件需求",
            "description": "",
            "priority": "P2",
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    created["data"]["key"]
        .as_str()
        .or_else(|| created["data"]["item_key"].as_str())
        .expect("work item key")
        .to_string()
}

fn draft_figure(id: i64) -> String {
    format!(
        r#"<figure data-yuance-attachment-id="{id}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="/web/projects/YCE/work-item-draft-attachments/{id}/download" alt="a.png" loading="lazy"></figure>"#
    )
}

async fn attachment_target(pool: &sqlx::SqlitePool, id: i64) -> (String, i64) {
    sqlx::query_as::<_, (String, i64)>(
        "SELECT target_type, target_id FROM file_attachments WHERE id = ?1",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .expect("attachment row")
}

async fn file_object_status(pool: &sqlx::SqlitePool, attachment_id: i64) -> String {
    sqlx::query_scalar::<_, String>(
        "SELECT fo.status FROM file_attachments fa JOIN file_objects fo ON fo.id = fa.file_object_id WHERE fa.id = ?1",
    )
    .bind(attachment_id)
    .fetch_one(pool)
    .await
    .expect("file object status")
}

async fn deletion_job_exists(pool: &sqlx::SqlitePool, attachment_id: i64) -> bool {
    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM file_object_deletion_jobs j
            JOIN file_attachments fa ON fa.file_object_id = j.file_object_id
            WHERE fa.id = ?1
        )
        "#,
    )
    .bind(attachment_id)
    .fetch_one(pool)
    .await
    .expect("deletion job query")
}

#[tokio::test]
async fn draft_attachment_uploads_without_work_item_and_binds_to_primary_post() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let first = create_draft(&fixture, &cookie, "a.png", true).await;
    let second = create_draft(&fixture, &cookie, "b.png", true).await;
    assert_eq!(
        attachment_target(&fixture.pool, first).await,
        ("draft".to_string(), fixture.project_id)
    );

    // 草稿可由上传者本人通过 Web 路由预览。
    let (status, _) = send(
        &fixture.app,
        "GET",
        &format!("/web/projects/YCE/work-item-draft-attachments/{first}/download"),
        &cookie,
        None,
    )
    .await;
    assert!(
        status.is_redirection() || status == StatusCode::OK,
        "{status}"
    );

    let item_key = create_work_item(&fixture).await;
    let body = format!(
        "<p>说明</p>{}{}<p>结尾</p>",
        draft_figure(first),
        draft_figure(second)
    );
    let (status, post) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &cookie,
        Some(serde_json::json!({ "body": body, "body_format": "html" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{post}");
    let comment_id = post["data"]["id"].as_i64().expect("primary post id");
    let saved = post["data"]["body"].as_str().expect("body");
    assert!(!saved.contains("work-item-draft-attachments"), "{saved}");
    for id in [first, second] {
        assert!(
            saved.contains(&format!(
                "/web/work-items/{item_key}/comments/{comment_id}/attachments/{id}/download"
            )),
            "{saved}"
        );
        assert!(saved.contains(&format!(r#"data-yuance-attachment-id="{id}""#)));
        assert_eq!(
            attachment_target(&fixture.pool, id).await,
            ("comment".to_string(), comment_id)
        );
    }

    // 改绑后按主帖附件路径可正常签发下载地址，草稿接口不再可用。
    let (status, signed) = send(
        &fixture.app,
        "GET",
        &format!(
            "/api/v1/work-items/{item_key}/comments/{comment_id}/attachments/{first}/download-url"
        ),
        &cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{signed}");
    let (status, _) = send(
        &fixture.app,
        "GET",
        &format!("{DRAFTS}/{first}/download-url"),
        &cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn draft_attachments_are_private_to_their_uploader() {
    let fixture = fixture().await;
    let draft = create_draft(&fixture, &fixture.admin.cookie, "a.png", true).await;
    let other = create_member(&fixture.pool, "draft_peer", "协作成员").await;
    projects::add_project_member(
        &fixture.pool,
        fixture.admin.user_id,
        "YCE",
        "draft_peer",
        "member",
    )
    .await
    .expect("member should join project");

    for (method, uri) in [
        ("GET", format!("{DRAFTS}/{draft}/upload-url")),
        ("GET", format!("{DRAFTS}/{draft}/download-url")),
        ("POST", format!("{DRAFTS}/{draft}/uploaded")),
        ("DELETE", format!("{DRAFTS}/{draft}")),
        (
            "GET",
            format!("/web/projects/YCE/work-item-draft-attachments/{draft}/download"),
        ),
    ] {
        let (status, _) = send(&fixture.app, method, &uri, &other.cookie, None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {uri}");
    }

    // 他人创建的工作项主帖引用该草稿时整体拒绝，草稿保持不变。
    let (status, created) = send(
        &fixture.app,
        "POST",
        "/api/v1/work-items",
        &other.cookie,
        Some(serde_json::json!({
            "project_key": "YCE",
            "item_type": "requirement",
            "title": "他人需求",
            "description": "",
            "priority": "P2",
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{created}");
    let item_key = created["data"]["key"]
        .as_str()
        .or_else(|| created["data"]["item_key"].as_str())
        .expect("work item key")
        .to_string();
    let (status, rejected) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &other.cookie,
        Some(serde_json::json!({ "body": draft_figure(draft), "body_format": "html" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{rejected}");
    assert_eq!(
        attachment_target(&fixture.pool, draft).await,
        ("draft".to_string(), fixture.project_id)
    );
    let primary_post: Option<i64> =
        sqlx::query_scalar("SELECT primary_post_comment_id FROM work_items WHERE item_key = ?1")
            .bind(&item_key)
            .fetch_one(&fixture.pool)
            .await
            .expect("work item row");
    assert_eq!(
        primary_post, None,
        "rejected bind must not leave a primary post"
    );
}

#[tokio::test]
async fn primary_post_with_drafts_can_be_retried_after_lost_response() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let draft = create_draft(&fixture, &cookie, "a.png", true).await;
    let item_key = create_work_item(&fixture).await;
    let body = format!("<p>重试</p>{}", draft_figure(draft));
    let mut comment_ids = Vec::new();
    for _ in 0..2 {
        let (status, post) = send(
            &fixture.app,
            "PATCH",
            &format!("/api/v1/work-items/{item_key}/primary-post"),
            &cookie,
            Some(serde_json::json!({ "body": body, "body_format": "html" })),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{post}");
        comment_ids.push(post["data"]["id"].as_i64().expect("primary post id"));
    }
    assert_eq!(comment_ids[0], comment_ids[1]);
    assert_eq!(
        attachment_target(&fixture.pool, draft).await,
        ("comment".to_string(), comment_ids[0])
    );
}

#[tokio::test]
async fn draft_paths_in_plain_text_are_left_untouched() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let item_key = create_work_item(&fixture).await;
    let text = "接口示例 /api/v1/projects/YCE/work-item-draft-attachments/1/download 与 /web/projects/YCE/work-item-draft-attachments/9/download";
    let (status, post) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &cookie,
        Some(serde_json::json!({ "body": format!("<p>{text}</p>"), "body_format": "html" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{post}");
    assert!(post["data"]["body"].as_str().expect("body").contains(text));
}

#[tokio::test]
async fn binding_rejects_drafts_that_are_not_uploaded() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let pending = create_draft(&fixture, &cookie, "pending.png", false).await;
    let item_key = create_work_item(&fixture).await;
    let (status, rejected) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &cookie,
        Some(serde_json::json!({ "body": draft_figure(pending), "body_format": "html" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{rejected}");
    assert_eq!(
        attachment_target(&fixture.pool, pending).await,
        ("draft".to_string(), fixture.project_id)
    );

    // 格式残缺的草稿引用同样拒绝。
    let (status, _) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &cookie,
        Some(serde_json::json!({
            "body": "<p><a href=\"/web/projects/YCE/work-item-draft-attachments/abc/download\">x</a></p>",
            "body_format": "html",
        })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn deleting_draft_queues_object_deletion() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let draft = create_draft(&fixture, &cookie, "a.png", true).await;
    let (status, deleted) = send(
        &fixture.app,
        "DELETE",
        &format!("{DRAFTS}/{draft}"),
        &cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{deleted}");
    assert_eq!(deleted["data"]["status"], "deleted");
    assert_eq!(file_object_status(&fixture.pool, draft).await, "deleted");
    assert!(deletion_job_exists(&fixture.pool, draft).await);
    let (status, _) = send(
        &fixture.app,
        "GET",
        &format!("{DRAFTS}/{draft}/download-url"),
        &cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = send(
        &fixture.app,
        "DELETE",
        &format!("{DRAFTS}/{draft}"),
        &cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn expired_drafts_are_cleaned_up_but_fresh_and_bound_ones_are_kept() {
    let fixture = fixture().await;
    let cookie = fixture.admin.cookie.clone();
    let expired = create_draft(&fixture, &cookie, "old.png", true).await;
    let fresh = create_draft(&fixture, &cookie, "new.png", true).await;
    let bound = create_draft(&fixture, &cookie, "bound.png", true).await;
    let item_key = create_work_item(&fixture).await;
    let (status, _) = send(
        &fixture.app,
        "PATCH",
        &format!("/api/v1/work-items/{item_key}/primary-post"),
        &cookie,
        Some(serde_json::json!({ "body": draft_figure(bound), "body_format": "html" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    sqlx::query(
        "UPDATE file_attachments SET created_at = datetime('now', '-30 hours') WHERE id IN (?1, ?2)",
    )
    .bind(expired)
    .bind(bound)
    .execute(&fixture.pool)
    .await
    .expect("backdate drafts");

    let dry_run = files::cleanup_expired_draft_attachments(&fixture.pool, 24, None, true)
        .await
        .expect("dry run");
    assert_eq!(dry_run.matched_count, 1);
    assert_eq!(file_object_status(&fixture.pool, expired).await, "uploaded");

    let applied = files::cleanup_expired_draft_attachments(&fixture.pool, 24, None, false)
        .await
        .expect("cleanup");
    assert_eq!(
        (
            applied.matched_count,
            applied.deleted_count,
            applied.failed_count
        ),
        (1, 1, 0)
    );
    assert_eq!(file_object_status(&fixture.pool, expired).await, "deleted");
    assert!(deletion_job_exists(&fixture.pool, expired).await);
    assert_eq!(file_object_status(&fixture.pool, fresh).await, "uploaded");
    assert_eq!(file_object_status(&fixture.pool, bound).await, "uploaded");

    // 新登记草稿时会顺带清理该用户在该项目下的过期草稿。
    let stale = create_draft(&fixture, &cookie, "stale.png", true).await;
    sqlx::query(
        "UPDATE file_attachments SET created_at = datetime('now', '-80 hours') WHERE id = ?1",
    )
    .bind(stale)
    .execute(&fixture.pool)
    .await
    .expect("backdate draft");
    create_draft(&fixture, &cookie, "trigger.png", false).await;
    assert_eq!(file_object_status(&fixture.pool, stale).await, "deleted");
}

#[tokio::test]
async fn migration_allows_draft_target_and_keeps_existing_constraint() {
    let pool = test_pool().await;
    let sql: String = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'file_attachments'",
    )
    .fetch_one(&pool)
    .await
    .expect("table sql");
    assert!(sql.contains("'draft'"), "{sql}");
    assert!(sql.contains("created_by_display_name_snapshot"), "{sql}");
    let index: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_file_attachments_target'",
    )
    .fetch_one(&pool)
    .await
    .expect("index");
    assert_eq!(index, 1);
}

async fn bootstrap_admin_session(pool: &sqlx::SqlitePool) -> Session {
    let result = bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .expect("bootstrap should initialize");
    Session {
        user_id: result.user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(
            &result.session.raw_token,
            false,
        )),
    }
}

async fn create_member(pool: &sqlx::SqlitePool, username: &str, display_name: &str) -> Session {
    let password_hash = auth::hash_password("MemberPass2026!").expect("password should hash");
    let user_id = sqlx::query_scalar::<_, i64>(
        r#"
        INSERT INTO users (username, password_hash, display_name, status, is_super_admin)
        VALUES (?1, ?2, ?3, 'active', 0)
        RETURNING id
        "#,
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
    .expect("user should be created");
    let mut tx = pool.begin().await.expect("tx should begin");
    rbac::assign_role_to_user(&mut tx, user_id, "member")
        .await
        .expect("role should assign");
    tx.commit().await.expect("tx should commit");
    let session = auth::issue_session(pool, user_id, 12 * 60 * 60)
        .await
        .expect("session should issue");
    Session {
        user_id,
        cookie: with_csrf_cookie(&auth::session_cookie_header(&session.raw_token, false)),
    }
}

async fn seed_memory_storage_config(pool: &sqlx::SqlitePool, actor_user_id: i64) {
    storage::save_config(
        pool,
        &test_settings(),
        actor_user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIAUNIT5SECRETID".to_string(),
            access_key_secret: "Unit5SecretValue2026!".to_string(),
            activate: true,
        },
    )
    .await
    .expect("memory storage config should save");
}

async fn write_test_object(pool: &sqlx::SqlitePool, attachment: &files::FileAttachmentSummary) {
    let operator = storage::build_operator_from_active_config(pool, &test_settings())
        .await
        .expect("operator should build")
        .expect("test storage operator should exist");
    operator
        .write_with(
            &attachment.object_key,
            vec![b'x'; attachment.byte_size as usize],
        )
        .content_type(&attachment.content_type)
        .await
        .expect("object should write");
}

fn with_csrf_cookie(session_cookie: &str) -> String {
    format!("{session_cookie}; yuance_csrf={CSRF_TOKEN}")
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
        security_master_key: "test-master-key-2026".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        experimental_legacy_preview_enabled: false,
    }
}
