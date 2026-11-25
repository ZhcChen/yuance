//! 评论附件批量读取（体检 P2：工作项详情评论附件 N+1）。

use axum::http::StatusCode;
use yuance_api::{
    domains::{files, projects, storage},
    web::router::{AppState, build_router},
};

use crate::support::{bootstrap_admin_session, create_user, send, test_pool, test_settings};

#[tokio::test]
async fn comment_attachments_batch_groups_published_comment_attachments() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    storage::save_config(
        &pool,
        &test_settings(),
        admin.user_id,
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
    let config = storage::active_config(&pool)
        .await
        .expect("config")
        .expect("config exists");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project")
        .expect("project exists");

    let mut comment_ids = Vec::new();
    for body in ["<p>第一条</p>", "<p>第二条</p>"] {
        let comment = projects::add_work_item_comment_reply_with_format(
            &pool,
            admin.user_id,
            "YCE-TASK-2",
            body,
            "html",
            None,
        )
        .await
        .expect("comment");
        comment_ids.push(comment.id);
    }
    let attachment = files::create_attachment(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "comment".to_string(),
            target_id: comment_ids[0],
            project_id: Some(project.id),
            original_filename: "batch.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 4,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
    )
    .await
    .expect("attachment");

    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let (status, body) = send(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2/comment-attachments",
        &admin.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let data = &body["data"];
    let first = data[comment_ids[0].to_string()]
        .as_array()
        .expect("first comment group");
    assert_eq!(first.len(), 1);
    assert_eq!(first[0]["id"], attachment.id);
    assert_eq!(
        data[comment_ids[1].to_string()].as_array().map(Vec::len),
        Some(0)
    );

    // 与逐条接口结果一致。
    let (_, single) = send(
        &app,
        "GET",
        &format!(
            "/api/v1/work-items/YCE-TASK-2/comments/{}/attachments",
            comment_ids[0]
        ),
        &admin.cookie,
        None,
    )
    .await;
    assert_eq!(single["data"], data[comment_ids[0].to_string()]);

    // 无项目权限的用户不能读取。
    let outsider = create_user(&pool, "batch_outsider", "member").await;
    let (status, _) = send(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2/comment-attachments",
        &outsider.cookie,
        None,
    )
    .await;
    assert!(
        status == StatusCode::FORBIDDEN || status == StatusCode::NOT_FOUND,
        "outsider must be rejected, got {status}"
    );
}
