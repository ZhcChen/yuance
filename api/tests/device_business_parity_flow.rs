use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
    response::Response,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use http_body_util::BodyExt;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;
use yuance_api::{
    domains::{bootstrap, device_sessions, projects, storage, users},
    platform::{config::Settings, db, realtime},
    web::router::{AppState, build_router},
};

const CODE_VERIFIER: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~";

#[tokio::test]
async fn device_principal_matches_business_read_write_and_revocation_contract() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    seed_memory_storage(&pool, admin_id).await;
    let credentials = issue_device_credentials(&pool, admin_id, "business-parity").await;
    let app = test_app(pool.clone());

    for path in [
        "/api/v1/auth/me",
        "/api/v1/projects",
        "/api/v1/projects/YCE",
        "/api/v1/projects/YCE/members",
        "/api/v1/projects/YCE/my-analysis",
        "/api/v1/projects/YCE/resources",
        "/api/v1/current-project",
        "/api/v1/topbar/status",
        "/api/v1/notifications",
        "/api/v1/work-item-list-view?item_type=task&project_key=YCE",
        "/api/v1/work-item-detail-view/YCE-TASK-2",
        "/api/v1/work-items?project_key=YCE",
        "/api/v1/work-items/YCE-TASK-2",
        "/api/v1/work-items/YCE-TASK-2/comments",
        "/api/v1/work-items/YCE-TASK-2/attachments",
    ] {
        let response = request(&app, "GET", path, &credentials.access_token, None).await;
        assert_eq!(response.status(), StatusCode::OK, "path: {path}");
    }

    let response = request(
        &app,
        "GET",
        "/api/v1/projects/YCE/my-analysis",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let analysis = json_body(response).await;
    let data = &analysis["data"];
    assert_eq!(data["username"], "admin");
    assert!(data["display_name"].is_string());
    assert!(data["joined_at"].is_string());
    for field in ["requirements", "tasks", "bugs"] {
        assert!(data["pending"][field].is_i64(), "pending field: {field}");
    }
    for field in ["daily_average", "monthly_average"] {
        assert!(data[field].is_number(), "average field: {field}");
    }
    assert!(data["recent_completions"].is_array());

    let response = request(
        &app,
        "PATCH",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        Some(serde_json::json!({"title": "Device parity mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await["data"]["title"],
        "Device parity mutation"
    );
    let response = request(
        &app,
        "PATCH",
        "/api/v1/work-items/YCE-TASK-2/primary-post",
        &credentials.access_token,
        Some(serde_json::json!({
            "body": "<p>Device <strong>primary post</strong><script>alert(1)</script></p>",
            "body_format": "html"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["body_format"], "html");
    assert!(
        body["data"]["body"]
            .as_str()
            .unwrap()
            .contains("<strong>primary post</strong>")
    );
    assert!(!body["data"]["body"].as_str().unwrap().contains("<script"));
    projects::archive_work_item(&pool, admin_id, "YCE-TASK-2")
        .await
        .expect("fixture work item should archive");
    let response = request(
        &app,
        "POST",
        "/api/v1/work-items/YCE-TASK-2/restore",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["deleted_at"], "");
    assert_eq!(
        projects::get_work_item_detail(&pool, "YCE-TASK-2")
            .await
            .unwrap()
            .unwrap()
            .deleted_at,
        ""
    );

    let response = request(
        &app,
        "PATCH",
        "/api/v1/projects/YCE",
        &credentials.access_token,
        Some(serde_json::json!({"description": "Device project mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await["data"]["description"],
        "Device project mutation"
    );

    let response = request(
        &app,
        "POST",
        "/api/v1/projects/YCE/cycles",
        &credentials.access_token,
        Some(serde_json::json!({
            "name": "Device parity cycle", "goal": "Verify cycle parity", "description": "",
            "owner_username": "admin", "start_date": "2026-08-01", "end_date": "2026-08-31"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let cycle_id = json_body(response).await["data"]["id"].as_i64().unwrap();
    let response = request(
        &app,
        "POST",
        "/api/v1/work-items",
        &credentials.access_token,
        Some(serde_json::json!({
            "project_key": "YCE", "item_type": "task", "title": "Device parity creation",
            "description": "Created through the fixed Desktop operation", "priority": "P1",
            "assignee_username": "admin", "cycle_id": cycle_id, "parent_item_key": "YCE-REQ-1"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let created_item_key = json_body(response).await["data"]["key"]
        .as_str()
        .unwrap()
        .to_string();
    let created_item = projects::get_work_item_detail(&pool, &created_item_key)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(created_item.cycle_id, Some(cycle_id));
    assert_eq!(created_item.parent_item_key, "YCE-REQ-1");
    let response = request(
        &app,
        "POST",
        "/api/v1/work-items/batch",
        &credentials.access_token,
        Some(serde_json::json!({
            "project_key": "YCE", "item_type": "task", "item_keys": [created_item_key.clone()],
            "action": "priority", "priority": "P2"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let batch_result = json_body(response).await;
    assert_eq!(batch_result["data"]["updated_count"], 1);
    assert_eq!(batch_result["data"]["failed_count"], 0);
    assert_eq!(
        projects::get_work_item_detail(&pool, &created_item_key)
            .await
            .unwrap()
            .unwrap()
            .priority,
        "P2"
    );
    let response = request(
        &app,
        "GET",
        &format!("/api/v1/projects/YCE/cycles/{cycle_id}"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(json_body(response).await["data"]["work_items"].is_array());
    let response = request(
        &app,
        "POST",
        &format!("/api/v1/projects/YCE/cycles/{cycle_id}/close"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["is_closed"], true);

    let response = request(
        &app,
        "POST",
        "/api/v1/projects/YCE/resources",
        &credentials.access_token,
        Some(serde_json::json!({
            "title": "Device parity resource", "category": "integration",
            "body": "<h2 onclick=\"alert(1)\">device-resource-body</h2><script>alert(2)</script><a href=\"javascript:alert(3)\">bad</a><pre><code>cargo test</code></pre>", "body_format": "html",
            "tags": ["device-parity"]
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let created_resource = json_body(response).await;
    let resource_id = created_resource["data"]["id"].as_i64().unwrap();
    let sanitized_body = created_resource["data"]["body"].as_str().unwrap();
    assert!(sanitized_body.contains("<h2>device-resource-body</h2>"));
    assert!(sanitized_body.contains("<pre><code>cargo test</code></pre>"));
    assert!(!sanitized_body.contains("onclick"));
    assert!(!sanitized_body.contains("<script"));
    assert!(!sanitized_body.contains("javascript:"));
    let response = request(
        &app,
        "PATCH",
        &format!("/api/v1/projects/YCE/resources/{resource_id}"),
        &credentials.access_token,
        Some(serde_json::json!({
            "title": "Device parity resource updated", "body": "updated-device-resource-body"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await["data"]["title"],
        "Device parity resource updated"
    );
    let mut realtime_receiver = realtime::subscribe_user_realtime();
    let response = request(
        &app,
        "POST",
        &format!("/api/v1/projects/YCE/resources/{resource_id}/password/reset"),
        &credentials.access_token,
        Some(serde_json::json!({
            "access_password_action": "set", "access_password": "DeviceReset2026!"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["is_protected"], true);
    let realtime_event = tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            let event = realtime_receiver
                .recv()
                .await
                .expect("password reset realtime channel should remain available");
            if event.kind == "topbar" && event.user_ids.contains(&admin_id) {
                break event;
            }
        }
    })
    .await
    .expect("password reset should publish a topbar refresh event");
    assert!(realtime_event.user_ids.contains(&admin_id));

    let attachment_content = b"protected resource attachment".to_vec();
    let attachment_checksum = format!("{:x}", Sha256::digest(&attachment_content));
    let attachment_collection = format!("/api/v1/projects/YCE/resources/{resource_id}/attachments");
    let response = request(
        &app,
        "POST",
        &attachment_collection,
        &credentials.access_token,
        Some(serde_json::json!({
            "original_filename": "protected-resource.txt",
            "content_type": "text/plain",
            "byte_size": attachment_content.len(),
            "checksum_sha256": attachment_checksum
        })),
    )
    .await;
    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(status, StatusCode::CREATED, "body: {body}");
    let attachment_id = body["data"]["id"].as_i64().unwrap();
    let attachment_member = format!("{attachment_collection}/{attachment_id}");
    let object_key = sqlx::query_scalar::<_, String>(
        "SELECT object_key FROM file_objects WHERE id = (SELECT file_object_id FROM file_attachments WHERE id = ?1)",
    )
    .bind(attachment_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &object_key,
        "text/plain",
        attachment_content,
    )
    .await
    .unwrap();
    let response = request(
        &app,
        "POST",
        &format!("{attachment_member}/uploaded"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "GET",
        &attachment_collection,
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = request(
        &app,
        "POST",
        &format!("/api/v1/projects/YCE/resources/{resource_id}/unlock"),
        &credentials.access_token,
        Some(serde_json::json!({"access_password": "DeviceReset2026!"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let access_token = json_body(response).await["data"]["access_token"]
        .as_str()
        .unwrap()
        .to_string();
    let access_query = serde_urlencoded::to_string([("access", access_token.as_str())]).unwrap();
    let response = request(
        &app,
        "GET",
        &format!("{attachment_collection}?{access_query}"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"][0]["id"], attachment_id);
    let preview_path = format!("{attachment_member}/preview?{access_query}");
    let response = request(
        &app,
        "GET",
        &format!("{attachment_member}/preview"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = request(&app, "GET", &preview_path, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    let preview = json_body(response).await;
    assert_eq!(preview["data"]["attachment"]["id"], attachment_id);
    assert_eq!(preview["data"]["preview"]["kind"], "document");
    assert_eq!(preview["data"]["preview"]["content_enabled"], true);
    assert!(
        preview["data"]["content_url"]
            .as_str()
            .unwrap()
            .ends_with(&format!("/preview/content?{access_query}"))
    );
    assert!(
        preview["data"]["download_url"]
            .as_str()
            .unwrap()
            .ends_with(&format!("/download-url?{access_query}"))
    );
    let response = request_with_headers(
        &app,
        "GET",
        &format!("{attachment_member}/preview/content?{access_query}"),
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=10-17")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 10-17/29");
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"resource");
    let response = request(
        &app,
        "GET",
        &format!("{attachment_member}/download-url?{access_query}"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await["data"]["request"]["method"],
        "GET"
    );

    let response = request(
        &app,
        "POST",
        &format!("/api/v1/projects/YCE/resources/{resource_id}/password/reset"),
        &credentials.access_token,
        Some(serde_json::json!({
            "access_password_action": "set", "access_password": "RotatedDeviceReset2026!"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "GET",
        &format!("{attachment_collection}?{access_query}"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = request(&app, "GET", &preview_path, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = request(
        &app,
        "POST",
        &format!("/api/v1/projects/YCE/resources/{resource_id}/password/reset"),
        &credentials.access_token,
        Some(serde_json::json!({"access_password_action": "clear"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["is_protected"], false);
    let response = request(
        &app,
        "DELETE",
        &format!("/api/v1/projects/YCE/resources/{resource_id}"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["status"], "archived");

    device_sessions::revoke_family_for_user(
        &pool,
        admin_id,
        &credentials.family_id,
        Utc::now(),
        "business_parity",
    )
    .await
    .unwrap();
    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn device_principal_does_not_bypass_project_membership_or_viewer_role() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    let viewer_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "parity_viewer".to_string(),
            display_name: "Parity Viewer".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "ViewerPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .unwrap();
    let credentials = issue_device_credentials(&pool, viewer_id, "viewer-parity").await;
    let app = test_app(pool.clone());

    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let project_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM projects WHERE project_key = 'YCE'")
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, member_role) VALUES (?1, ?2, 'viewer')",
    )
    .bind(project_id)
    .bind(viewer_id)
    .execute(&pool)
    .await
    .unwrap();

    let response = request(
        &app,
        "GET",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "GET",
        "/api/v1/projects/YCE/cycles",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "POST",
        "/api/v1/projects/YCE/cycles",
        &credentials.access_token,
        Some(serde_json::json!({
            "name": "forbidden", "start_date": "2026-08-01", "end_date": "2026-08-31"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = request(
        &app,
        "PATCH",
        "/api/v1/work-items/YCE-TASK-2",
        &credentials.access_token,
        Some(serde_json::json!({"title": "forbidden viewer mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = request(
        &app,
        "GET",
        "/api/v1/projects/YCE",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "GET",
        "/api/v1/projects/YCE/members",
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let response = request(
        &app,
        "PATCH",
        "/api/v1/projects/YCE",
        &credentials.access_token,
        Some(serde_json::json!({"description": "forbidden viewer project mutation"})),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let response = request(
        &app,
        "POST",
        "/api/v1/projects/YCE/resources",
        &credentials.access_token,
        Some(serde_json::json!({
            "title": "forbidden viewer resource", "category": "other", "body": "no"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let admin_credentials = issue_device_credentials(&pool, admin_id, "password-reset-admin").await;
    let response = request(
        &app,
        "POST",
        "/api/v1/projects/YCE/resources",
        &admin_credentials.access_token,
        Some(serde_json::json!({
            "title": "password reset permission fixture", "category": "other", "body": "secret"
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let resource_id = json_body(response).await["data"]["id"].as_i64().unwrap();
    for role in ["viewer", "maintainer"] {
        sqlx::query(
            "UPDATE project_members SET member_role = ?3 WHERE project_id = ?1 AND user_id = ?2",
        )
        .bind(project_id)
        .bind(viewer_id)
        .bind(role)
        .execute(&pool)
        .await
        .unwrap();
        let response = request(
            &app,
            "POST",
            &format!("/api/v1/projects/YCE/resources/{resource_id}/password/reset"),
            &credentials.access_token,
            Some(serde_json::json!({"access_password_action": "clear"})),
        )
        .await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "role: {role}");
    }
}

#[tokio::test]
async fn device_principal_completes_work_item_and_comment_attachment_signing_lifecycle() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    seed_memory_storage(&pool, admin_id).await;
    let credentials = issue_device_credentials(&pool, admin_id, "attachment-parity").await;
    let app = test_app(pool.clone());

    run_attachment_lifecycle(
        &app,
        &pool,
        &credentials.access_token,
        "/api/v1/work-items/YCE-TASK-2/attachments",
        "device-item.txt",
    )
    .await;

    let comment_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM work_item_comments WHERE work_item_id = (SELECT id FROM work_items WHERE item_key = 'YCE-TASK-2') AND is_draft = 0 ORDER BY id LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    run_attachment_lifecycle(
        &app,
        &pool,
        &credentials.access_token,
        &format!("/api/v1/work-items/YCE-TASK-2/comments/{comment_id}/attachments"),
        "device-comment.txt",
    )
    .await;
}

#[tokio::test]
async fn device_project_attachment_lifecycle_enforces_permissions_and_audit_principals() {
    let pool = test_pool().await;
    let manager_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, manager_id).await.unwrap();
    seed_memory_storage(&pool, manager_id).await;

    let viewer_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "attachment_viewer".to_string(),
            display_name: "Attachment Viewer".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "ViewerPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .unwrap();
    projects::add_project_member(&pool, manager_id, "YCE", "attachment_viewer", "viewer")
        .await
        .unwrap();
    let outsider_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "attachment_outsider".to_string(),
            display_name: "Attachment Outsider".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "OutsiderPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .unwrap();

    let manager = issue_device_credentials(&pool, manager_id, "project-attachment-manager").await;
    let viewer = issue_device_credentials(&pool, viewer_id, "project-attachment-viewer").await;
    let outsider =
        issue_device_credentials(&pool, outsider_id, "project-attachment-outsider").await;
    let app = test_app(pool.clone());
    let collection_path = "/api/v1/projects/YCE/attachments";

    let response = request(&app, "GET", collection_path, &manager.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"], serde_json::json!([]));

    let content = b"device project attachment parity".to_vec();
    let checksum_sha256 = format!("{:x}", Sha256::digest(&content));
    let response = request(
        &app,
        "POST",
        collection_path,
        &manager.access_token,
        Some(serde_json::json!({
            "original_filename": "device-project.txt",
            "content_type": "text/plain",
            "byte_size": content.len(),
            "checksum_sha256": checksum_sha256
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let attachment = json_body(response).await;
    let attachment_id = attachment["data"]["id"].as_i64().unwrap();
    let member_path = format!("{collection_path}/{attachment_id}");

    for (method, path) in [
        ("POST", collection_path.to_string()),
        ("GET", format!("{member_path}/upload-url")),
        ("POST", format!("{member_path}/uploaded")),
        ("DELETE", member_path.clone()),
    ] {
        let payload = (method == "POST" && path == collection_path).then(|| {
            serde_json::json!({
                "original_filename": "viewer-forbidden.txt",
                "content_type": "text/plain",
                "byte_size": 1
            })
        });
        let response = request(&app, method, &path, &viewer.access_token, payload).await;
        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "viewer path: {path}"
        );
    }

    let response = request(
        &app,
        "GET",
        &format!("{member_path}/upload-url"),
        &manager.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let signed = json_body(response).await;
    assert_eq!(signed["data"]["request"]["method"], "PUT");
    assert_eq!(signed["data"]["checksum_sha256"], checksum_sha256);

    let object_key = sqlx::query_scalar::<_, String>(
        "SELECT object_key FROM file_objects WHERE id = (SELECT file_object_id FROM file_attachments WHERE id = ?1)",
    )
    .bind(attachment_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    storage::write_test_memory_object(&pool, &test_settings(), &object_key, "text/plain", content)
        .await
        .unwrap();

    let response = request(
        &app,
        "POST",
        &format!("{member_path}/uploaded"),
        &manager.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["status"], "uploaded");

    let response = request(&app, "GET", collection_path, &viewer.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    let listed = json_body(response).await;
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);
    assert_eq!(listed["data"][0]["id"], attachment_id);

    let response = request(
        &app,
        "GET",
        &format!("{member_path}/download-url"),
        &viewer.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let signed = json_body(response).await;
    assert_eq!(signed["data"]["request"]["method"], "GET");
    assert_eq!(signed["data"]["attachment"]["id"], attachment_id);

    for path in [
        collection_path.to_string(),
        format!("{member_path}/download-url"),
    ] {
        let response = request(&app, "GET", &path, &outsider.access_token, None).await;
        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "outsider path: {path}"
        );
    }
    let response = request(
        &app,
        "GET",
        "/api/v1/projects/OPS/attachments",
        &viewer.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = request(
        &app,
        "GET",
        &format!("/api/v1/projects/OPS/attachments/{attachment_id}/download-url"),
        &manager.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let response = request(
        &app,
        "GET",
        &format!("{member_path}/download-url"),
        &manager.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let response = request(&app, "DELETE", &member_path, &manager.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["status"], "deleted");

    for path in [
        format!("{member_path}/upload-url"),
        format!("{member_path}/download-url"),
    ] {
        let response = request(&app, "GET", &path, &manager.access_token, None).await;
        assert_eq!(
            response.status(),
            StatusCode::BAD_REQUEST,
            "archived path: {path}"
        );
    }

    let audit_rows = sqlx::query_as::<_, (String, Option<i64>)>(
        r#"
        SELECT action, actor_user_id
        FROM audit_logs
        WHERE target_type = 'project'
          AND target_id = 'YCE'
          AND action IN ('file.attach.project', 'file.upload.completed', 'file.download.url', 'file.archive')
        ORDER BY id
        "#,
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(audit_rows.contains(&("file.attach.project".to_string(), Some(manager_id))));
    assert!(audit_rows.contains(&("file.upload.completed".to_string(), Some(manager_id))));
    assert!(audit_rows.contains(&("file.download.url".to_string(), Some(viewer_id))));
    assert!(audit_rows.contains(&("file.download.url".to_string(), Some(manager_id))));
    assert!(audit_rows.contains(&("file.archive".to_string(), Some(manager_id))));

    let archived_by = sqlx::query_as::<_, (Option<i64>, String)>(
        r#"
        SELECT actor_user_id, metadata
        FROM project_activities
        WHERE action = 'file.archived'
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(archived_by.0, Some(manager_id));
    assert_eq!(
        serde_json::from_str::<Value>(&archived_by.1).unwrap()["attachment_id"],
        attachment_id
    );
}

#[tokio::test]
async fn device_project_attachment_preview_supports_metadata_navigation_and_byte_ranges() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    seed_memory_storage(&pool, admin_id).await;
    let credentials = issue_device_credentials(&pool, admin_id, "project-attachment-preview").await;
    let app = test_app(pool.clone());
    let collection_path = "/api/v1/projects/YCE/attachments";

    let mut attachment_ids = Vec::new();
    for (filename, content_type, content) in [
        (
            "preview-first.md",
            "text/markdown",
            b"first preview".as_slice(),
        ),
        (
            "preview-second.pdf",
            "application/pdf",
            b"0123456789".as_slice(),
        ),
        (
            "preview-legacy.doc",
            "application/msword",
            b"legacy".as_slice(),
        ),
    ] {
        let checksum_sha256 = format!("{:x}", Sha256::digest(content));
        let response = request(
            &app,
            "POST",
            collection_path,
            &credentials.access_token,
            Some(serde_json::json!({
                "original_filename": filename,
                "content_type": content_type,
                "byte_size": content.len(),
                "checksum_sha256": checksum_sha256
            })),
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let attachment_id = json_body(response).await["data"]["id"].as_i64().unwrap();
        attachment_ids.push(attachment_id);
        let object_key = sqlx::query_scalar::<_, String>(
            "SELECT object_key FROM file_objects WHERE id = (SELECT file_object_id FROM file_attachments WHERE id = ?1)",
        )
        .bind(attachment_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        storage::write_test_memory_object(
            &pool,
            &test_settings(),
            &object_key,
            content_type,
            content.to_vec(),
        )
        .await
        .unwrap();
        let response = request(
            &app,
            "POST",
            &format!("{collection_path}/{attachment_id}/uploaded"),
            &credentials.access_token,
            None,
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
    }

    let preview_path = format!("{collection_path}/{}/preview", attachment_ids[1]);
    let response = request(&app, "GET", &preview_path, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    let metadata = json_body(response).await;
    assert_eq!(metadata["data"]["attachment"]["id"], attachment_ids[1]);
    assert_eq!(metadata["data"]["preview"]["strategy"], "pdf");
    assert_eq!(metadata["data"]["preview"]["file_type"], "pdf");
    assert_eq!(metadata["data"]["preview"]["legacy_preview_enabled"], false);
    assert_eq!(metadata["data"]["preview"]["content_enabled"], true);
    assert_eq!(metadata["data"]["navigation"]["position"], 1);
    assert_eq!(metadata["data"]["navigation"]["total"], 2);
    assert!(metadata["data"]["navigation"]["previous"].is_null());
    assert_eq!(
        metadata["data"]["navigation"]["next"]["id"],
        attachment_ids[0]
    );

    let legacy_response = request(
        &app,
        "GET",
        &format!("{collection_path}/{}/preview", attachment_ids[2]),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(legacy_response.status(), StatusCode::OK);
    let legacy = json_body(legacy_response).await;
    assert_eq!(legacy["data"]["preview"]["strategy"], "legacy-doc");
    assert_eq!(legacy["data"]["preview"]["content_enabled"], false);

    let content_path = format!("{preview_path}/content");
    let response = request_with_headers(
        &app,
        "GET",
        &content_path,
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=2-5")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "4");
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/pdf");
    assert_eq!(
        response.headers()[header::X_CONTENT_TYPE_OPTIONS],
        "nosniff"
    );
    assert_eq!(
        response.headers()[header::CACHE_CONTROL],
        "private, no-store"
    );
    assert_eq!(
        response.headers()[header::CONTENT_SECURITY_POLICY],
        "default-src 'none'; sandbox"
    );
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"2345");

    let response = request_with_headers(
        &app,
        "HEAD",
        &content_path,
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=2-5")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "4");
    assert!(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .is_empty()
    );

    let response = request_with_headers(
        &app,
        "GET",
        &content_path,
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=20-30")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes */10");
    assert_eq!(response.headers()[header::ACCEPT_RANGES], "bytes");
}

#[tokio::test]
async fn device_work_item_attachment_preview_enforces_contract_and_ownership() {
    let pool = test_pool().await;
    let admin_id = bootstrap_admin(&pool).await;
    projects::seed_demo_data(&pool, admin_id).await.unwrap();
    seed_memory_storage(&pool, admin_id).await;
    let credentials = issue_device_credentials(&pool, admin_id, "work-item-preview").await;
    let app = test_app(pool.clone());
    let collection_path = "/api/v1/work-items/YCE-TASK-2/attachments";

    let first_id = create_uploaded_attachment_fixture(
        &app,
        &pool,
        &credentials.access_token,
        collection_path,
        "preview-first.md",
        "text/markdown",
        b"first preview",
    )
    .await;
    let selected_id = create_uploaded_attachment_fixture(
        &app,
        &pool,
        &credentials.access_token,
        collection_path,
        "preview-second.pdf",
        "application/pdf",
        b"0123456789",
    )
    .await;
    let unsupported_id = create_uploaded_attachment_fixture(
        &app,
        &pool,
        &credentials.access_token,
        collection_path,
        "preview-unsupported.bin",
        "application/octet-stream",
        b"unsupported",
    )
    .await;
    let pending_response = request(
        &app,
        "POST",
        collection_path,
        &credentials.access_token,
        Some(serde_json::json!({
            "original_filename": "preview-pending.png",
            "content_type": "image/png",
            "byte_size": 4,
            "checksum_sha256": format!("{:x}", Sha256::digest(b"png!"))
        })),
    )
    .await;
    assert_eq!(pending_response.status(), StatusCode::CREATED);
    let pending_id = json_body(pending_response).await["data"]["id"]
        .as_i64()
        .unwrap();

    let preview_path = format!("{collection_path}/{selected_id}/preview");
    let response = request(&app, "GET", &preview_path, &credentials.access_token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    let metadata = json_body(response).await;
    assert_eq!(metadata["data"]["attachment"]["id"], selected_id);
    assert_eq!(metadata["data"]["preview"]["kind"], "document");
    assert_eq!(metadata["data"]["preview"]["strategy"], "pdf");
    assert_eq!(metadata["data"]["preview"]["content_enabled"], true);
    assert_eq!(metadata["data"]["navigation"]["position"], 1);
    assert_eq!(metadata["data"]["navigation"]["total"], 2);
    assert!(metadata["data"]["navigation"]["previous"].is_null());
    assert_eq!(metadata["data"]["navigation"]["next"]["id"], first_id);

    for (attachment_id, expected_kind) in [
        (unsupported_id, serde_json::Value::Null),
        (pending_id, serde_json::Value::String("image".to_string())),
    ] {
        let response = request(
            &app,
            "GET",
            &format!("{collection_path}/{attachment_id}/preview"),
            &credentials.access_token,
            None,
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let metadata = json_body(response).await;
        assert_eq!(metadata["data"]["preview"]["kind"], expected_kind);
        assert_eq!(metadata["data"]["preview"]["content_enabled"], false);
        assert_eq!(metadata["data"]["navigation"]["position"], 0);
        assert_eq!(metadata["data"]["navigation"]["total"], 2);
    }

    let content_path = format!("{preview_path}/content");
    let response = request_with_headers(
        &app,
        "GET",
        &content_path,
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=2-5")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "4");
    assert_eq!(response.headers()[header::CONTENT_TYPE], "application/pdf");
    assert_eq!(
        &response.into_body().collect().await.unwrap().to_bytes()[..],
        b"2345"
    );

    let response = request_with_headers(
        &app,
        "HEAD",
        &content_path,
        &credentials.access_token,
        &[(header::RANGE.as_str(), "bytes=2-5")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    assert!(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .is_empty()
    );

    let other_id = create_uploaded_attachment_fixture(
        &app,
        &pool,
        &credentials.access_token,
        "/api/v1/work-items/YCE-BUG-1/attachments",
        "other-item.pdf",
        "application/pdf",
        b"other",
    )
    .await;
    let response = request(
        &app,
        "GET",
        &format!("{collection_path}/{other_id}/preview"),
        &credentials.access_token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let outsider_id = users::create_user(
        &pool,
        users::CreateUserInput {
            username: "work_item_preview_outsider".to_string(),
            display_name: "Work Item Preview Outsider".to_string(),
            email: String::new(),
            mobile: String::new(),
            password: "OutsiderPass2026!".to_string(),
            role_code: "member".to_string(),
        },
    )
    .await
    .unwrap();
    let outsider = issue_device_credentials(&pool, outsider_id, "work-item-preview-outsider").await;
    let response = request(&app, "GET", &preview_path, &outsider.access_token, None).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

async fn run_attachment_lifecycle(
    app: &Router,
    pool: &SqlitePool,
    token: &str,
    collection_path: &str,
    filename: &str,
) {
    let content = b"device attachment parity".to_vec();
    let checksum_sha256 = format!("{:x}", Sha256::digest(&content));
    let invalid = request(
        app,
        "POST",
        collection_path,
        token,
        Some(serde_json::json!({
            "original_filename": "invalid-checksum.txt",
            "content_type": "text/plain",
            "byte_size": content.len(),
            "checksum_sha256": "ABC"
        })),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    let response = request(
        app,
        "POST",
        collection_path,
        token,
        Some(serde_json::json!({
            "original_filename": filename,
            "content_type": "text/plain",
            "byte_size": content.len(),
            "checksum_sha256": checksum_sha256
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let body = json_body(response).await;
    let attachment_id = body["data"]["id"].as_i64().unwrap();

    let member_path = format!("{collection_path}/{attachment_id}");
    let response = request(
        app,
        "GET",
        &format!("{member_path}/upload-url"),
        token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let signed = json_body(response).await;
    assert_eq!(signed["data"]["request"]["method"], "PUT");
    assert_eq!(signed["data"]["checksum_sha256"], checksum_sha256);
    assert!(signed["data"]["expires_at"].as_str().is_some());

    let object_key = sqlx::query_scalar::<_, String>(
        "SELECT object_key FROM file_objects WHERE id = (SELECT file_object_id FROM file_attachments WHERE id = ?1)",
    )
    .bind(attachment_id)
    .fetch_one(pool)
    .await
    .unwrap();
    storage::write_test_memory_object(pool, &test_settings(), &object_key, "text/plain", content)
        .await
        .unwrap();

    let response = request(app, "POST", &format!("{member_path}/uploaded"), token, None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(json_body(response).await["data"]["status"], "uploaded");

    let response = request(
        app,
        "GET",
        &format!("{member_path}/download-url"),
        token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let signed = json_body(response).await;
    assert_eq!(signed["data"]["request"]["method"], "GET");
    assert_eq!(signed["data"]["attachment"]["id"], attachment_id);
}

async fn create_uploaded_attachment_fixture(
    app: &Router,
    pool: &SqlitePool,
    token: &str,
    collection_path: &str,
    filename: &str,
    content_type: &str,
    content: &[u8],
) -> i64 {
    let response = request(
        app,
        "POST",
        collection_path,
        token,
        Some(serde_json::json!({
            "original_filename": filename,
            "content_type": content_type,
            "byte_size": content.len(),
            "checksum_sha256": format!("{:x}", Sha256::digest(content))
        })),
    )
    .await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let attachment_id = json_body(response).await["data"]["id"].as_i64().unwrap();
    let object_key = sqlx::query_scalar::<_, String>(
        "SELECT object_key FROM file_objects WHERE id = (SELECT file_object_id FROM file_attachments WHERE id = ?1)",
    )
    .bind(attachment_id)
    .fetch_one(pool)
    .await
    .unwrap();
    storage::write_test_memory_object(
        pool,
        &test_settings(),
        &object_key,
        content_type,
        content.to_vec(),
    )
    .await
    .unwrap();
    let response = request(
        app,
        "POST",
        &format!("{collection_path}/{attachment_id}/uploaded"),
        token,
        None,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    attachment_id
}

async fn seed_memory_storage(pool: &SqlitePool, actor_user_id: i64) {
    storage::save_config(
        pool,
        &test_settings(),
        actor_user_id,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIADEVICEPARITY".to_string(),
            access_key_secret: "DeviceParitySecret2026!".to_string(),
            activate: true,
        },
    )
    .await
    .unwrap();
}

async fn bootstrap_admin(pool: &SqlitePool) -> i64 {
    bootstrap::bootstrap_init(
        pool,
        bootstrap::BootstrapInitInput {
            username: "admin".to_string(),
            display_name: "系统管理员".to_string(),
            password: "AdminPass2026!".to_string(),
            password_confirm: "AdminPass2026!".to_string(),
        },
    )
    .await
    .unwrap()
    .user_id
}

async fn issue_device_credentials(
    pool: &SqlitePool,
    user_id: i64,
    installation_id: &str,
) -> device_sessions::InitialDeviceCredentials {
    let now = Utc::now();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(CODE_VERIFIER.as_bytes()));
    let policy = device_sessions::DeviceSessionPolicy {
        server_instance_id: "device-business-parity".to_string(),
        authorization_ttl_seconds: 600,
        access_ttl_seconds: 900,
        refresh_sliding_ttl_seconds: 30 * 24 * 60 * 60,
        refresh_absolute_ttl_seconds: 90 * 24 * 60 * 60,
        idempotency_ttl_seconds: 24 * 60 * 60,
        poll_interval_seconds: 5,
    };
    let started = device_sessions::start_authorization(
        pool,
        &test_settings().security_master_key,
        &policy,
        device_sessions::StartAuthorizationInput {
            code_challenge: challenge,
            installation_id: installation_id.to_string(),
            device_name: installation_id.to_string(),
            platform: "test".to_string(),
            client_version: "0.1.0-test".to_string(),
        },
        now,
    )
    .await
    .unwrap();
    device_sessions::approve_authorization(pool, &started.authorization_id, user_id, now)
        .await
        .unwrap();
    device_sessions::exchange_authorization(
        pool,
        &test_settings().security_master_key,
        &policy,
        device_sessions::ExchangeAuthorizationInput {
            device_code: started.device_code,
            code_verifier: CODE_VERIFIER.to_string(),
            exchange_transaction_id: Uuid::new_v4().to_string(),
        },
        now,
    )
    .await
    .unwrap()
}

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    payload: Option<Value>,
) -> Response {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    let body = if let Some(payload) = payload {
        request = request.header(header::CONTENT_TYPE, "application/json");
        Body::from(payload.to_string())
    } else {
        Body::empty()
    };
    app.clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap()
}

async fn request_with_headers(
    app: &Router,
    method: &str,
    path: &str,
    access_token: &str,
    headers: &[(&str, &str)],
) -> Response {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"));
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    app.clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn json_body(response: Response) -> Value {
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn test_pool() -> SqlitePool {
    let settings = test_settings();
    let pool = db::connect_pool(&settings).await.unwrap();
    db::run_migrations(&pool).await.unwrap();
    pool
}

fn test_app(pool: SqlitePool) -> Router {
    build_router(AppState::new(test_settings(), Some(pool)))
}

fn test_settings() -> Settings {
    let mut settings = Settings {
        http_addr: "127.0.0.1:33034".parse().unwrap(),
        database_url: format!(
            "sqlite:file:device-business-parity-{}?mode=memory&cache=shared",
            Uuid::new_v4()
        ),
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
    };
    settings.device_sessions.server_instance_id = "device-business-parity".to_string();
    settings.device_sessions.trusted_proxy_cidrs.clear();
    settings
}
