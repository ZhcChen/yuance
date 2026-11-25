//! 附件上传完成登记（统一流程）：项目、工作项、评论三类目标的状态与审计口径保持不变。

use axum::http::StatusCode;
use yuance_api::domains::{files, projects, storage};
use yuance_api::web::router::{AppState, build_router};

use crate::support::{bootstrap_admin_session, send, test_pool, test_settings};

async fn memory_storage(pool: &sqlx::SqlitePool, actor: i64) -> storage::StorageConfig {
    storage::save_config(
        pool,
        &test_settings(),
        actor,
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
    .expect("storage config");
    storage::active_config(pool)
        .await
        .expect("config")
        .expect("config exists")
}

async fn pending_attachment(
    pool: &sqlx::SqlitePool,
    config: &storage::StorageConfig,
    actor: i64,
    target_type: &str,
    target_id: i64,
    project_id: i64,
) -> files::FileAttachmentSummary {
    let attachment = files::create_attachment(
        pool,
        config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: target_type.to_string(),
            target_id,
            project_id: Some(project_id),
            original_filename: "note.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 5,
            created_by_user_id: actor,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
    )
    .await
    .expect("attachment");
    storage::write_test_memory_object(
        pool,
        &test_settings(),
        &attachment.object_key,
        "text/plain",
        b"hello".to_vec(),
    )
    .await
    .expect("object");
    attachment
}

async fn last_upload_audit(pool: &sqlx::SqlitePool) -> (String, String, String) {
    sqlx::query_as(
        "SELECT target_type, target_id, metadata FROM audit_logs WHERE action = 'file.upload.completed' ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .expect("audit row")
}

#[tokio::test]
async fn upload_completion_keeps_status_and_audit_shape_for_each_target() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    let config = memory_storage(&pool, admin.user_id).await;
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project")
        .expect("project exists");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("item")
        .expect("item exists");
    let comment = projects::add_work_item_comment_reply_with_format(
        &pool,
        admin.user_id,
        "YCE-TASK-2",
        "<p>附件评论</p>",
        "html",
        None,
    )
    .await
    .expect("comment");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let project_attachment = pending_attachment(
        &pool,
        &config,
        admin.user_id,
        "project",
        project.id,
        project.id,
    )
    .await;
    let (status, body) = send(
        &app,
        "POST",
        &format!(
            "/api/v1/projects/YCE/attachments/{}/uploaded",
            project_attachment.id
        ),
        &admin.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "uploaded");
    assert_eq!(
        last_upload_audit(&pool).await,
        (
            "project".to_string(),
            "YCE".to_string(),
            format!(r#"{{"attachment_id":{}}}"#, project_attachment.id)
        )
    );

    let item_attachment = pending_attachment(
        &pool,
        &config,
        admin.user_id,
        "work_item",
        item.id,
        project.id,
    )
    .await;
    let (status, body) = send(
        &app,
        "POST",
        &format!(
            "/api/v1/work-items/YCE-TASK-2/attachments/{}/uploaded",
            item_attachment.id
        ),
        &admin.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "uploaded");
    assert_eq!(
        last_upload_audit(&pool).await,
        (
            "work_item".to_string(),
            "YCE-TASK-2".to_string(),
            format!(r#"{{"attachment_id":{}}}"#, item_attachment.id)
        )
    );

    let comment_attachment = pending_attachment(
        &pool,
        &config,
        admin.user_id,
        "comment",
        comment.id,
        project.id,
    )
    .await;
    let (status, body) = send(
        &app,
        "POST",
        &format!(
            "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments/{}/uploaded",
            comment.id, comment_attachment.id
        ),
        &admin.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "uploaded");
    assert_eq!(
        last_upload_audit(&pool).await,
        (
            "comment".to_string(),
            comment.id.to_string(),
            format!(
                r#"{{"work_item":"YCE-TASK-2","attachment_id":{}}}"#,
                comment_attachment.id
            )
        )
    );
}
