//! 项目成员与工作项关闭的权限边界（体检 P0-1、D3）。

use axum::http::StatusCode;
use yuance_api::{
    domains::projects,
    web::router::{AppState, build_router},
};

use crate::support::{bootstrap_admin_session, create_user, send, test_pool, test_settings};

async fn member_role(pool: &sqlx::SqlitePool, project_key: &str, username: &str) -> String {
    sqlx::query_scalar(
        r#"
        SELECT pm.member_role FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        JOIN users u ON u.id = pm.user_id
        WHERE p.project_key = ?1 AND u.username = ?2
        "#,
    )
    .bind(project_key)
    .bind(username)
    .fetch_one(pool)
    .await
    .expect("member role should exist")
}

#[tokio::test]
async fn maintainer_cannot_demote_owner_or_grant_owner_through_member_add() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    let maintainer = create_user(&pool, "maint_user", "member").await;
    create_user(&pool, "fresh_user", "member").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "maint_user", "maintainer")
        .await
        .expect("maintainer should join");
    let owner_username: String = sqlx::query_scalar(
        "SELECT u.username FROM projects p JOIN users u ON u.id = p.owner_user_id WHERE p.project_key = 'YCE'",
    )
    .fetch_one(&pool)
    .await
    .expect("project owner");
    assert_eq!(member_role(&pool, "YCE", &owner_username).await, "owner");

    // 领域层：维护者把负责人“重新添加”为只读被拒绝，负责人角色不变。
    let demoted = projects::add_project_members(
        &pool,
        maintainer.user_id,
        "YCE",
        std::slice::from_ref(&owner_username),
        "viewer",
    )
    .await;
    assert!(
        demoted.is_err(),
        "re-adding the owner must not change its role"
    );
    assert_eq!(member_role(&pool, "YCE", &owner_username).await, "owner");

    // 领域层：不能直接授予 owner。
    let granted = projects::add_project_members(
        &pool,
        maintainer.user_id,
        "YCE",
        &["fresh_user".to_string()],
        "owner",
    )
    .await;
    assert!(granted.is_err(), "member add must not grant owner");

    // 接口层：同样被拒绝，且不产生副作用。
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let (status, _) = send(
        &app,
        "POST",
        "/api/v1/projects/YCE/members/batch",
        &admin.cookie,
        Some(serde_json::json!({ "usernames": [owner_username], "member_role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, _) = send(
        &app,
        "POST",
        "/api/v1/projects/YCE/members",
        &admin.cookie,
        Some(serde_json::json!({ "username": "fresh_user", "member_role": "owner" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(member_role(&pool, "YCE", "admin").await, "owner");

    // 正常添加新成员仍然可用。
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/projects/YCE/members",
        &admin.cookie,
        Some(serde_json::json!({ "username": "fresh_user", "member_role": "member" })),
    )
    .await;
    assert!(status.is_success(), "{status} {body}");
    assert_eq!(member_role(&pool, "YCE", "fresh_user").await, "member");
}

#[tokio::test]
async fn viewer_cannot_close_work_item_but_writable_member_can() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    let viewer = create_user(&pool, "close_viewer", "member").await;
    let writer = create_user(&pool, "close_writer", "member").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "close_viewer", "viewer")
        .await
        .expect("viewer should join");
    projects::add_project_member(&pool, admin.user_id, "YCE", "close_writer", "member")
        .await
        .expect("writer should join");
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));

    let (status, view) = send(
        &app,
        "GET",
        "/api/v1/work-item-detail-view/YCE-TASK-2",
        &viewer.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{view}");
    assert_eq!(view["data"]["permissions"]["can_close_work_item"], false);
    let (status, _) = send(
        &app,
        "POST",
        "/api/v1/work-items/YCE-TASK-2/close",
        &viewer.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, view) = send(
        &app,
        "GET",
        "/api/v1/work-item-detail-view/YCE-TASK-2",
        &writer.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["data"]["permissions"]["can_close_work_item"], true);
    let (status, closed) = send(
        &app,
        "POST",
        "/api/v1/work-items/YCE-TASK-2/close",
        &writer.cookie,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{closed}");
    assert_eq!(closed["data"]["status"], "closed");
}

#[tokio::test]
async fn system_user_project_assign_skips_existing_memberships() {
    let pool = test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    create_user(&pool, "assign_user", "member").await;
    projects::add_project_member(&pool, admin.user_id, "YCE", "assign_user", "member")
        .await
        .expect("seed membership");
    let other_key: String = sqlx::query_scalar(
        "SELECT project_key FROM projects WHERE project_key <> 'YCE' AND status IN ('not_started','in_progress','acceptance') ORDER BY id LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .expect("another writable project");

    // 部分项目已是成员：跳过而非整体失败，且不改已有角色。
    let app = build_router(AppState::new(test_settings(), Some(pool.clone())));
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/system/users/assign_user/projects",
        &admin.cookie,
        Some(serde_json::json!({ "project_keys": ["YCE", other_key], "member_role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(member_role(&pool, "YCE", "assign_user").await, "member");
    assert_eq!(
        member_role(&pool, &other_key, "assign_user").await,
        "viewer"
    );

    // 全部已是成员时重复提交同样幂等。
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/system/users/assign_user/projects",
        &admin.cookie,
        Some(
            serde_json::json!({ "project_keys": ["YCE", other_key], "member_role": "maintainer" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(member_role(&pool, "YCE", "assign_user").await, "member");

    // 小写 key 同样识别为已有成员关系。
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/system/users/assign_user/projects",
        &admin.cookie,
        Some(serde_json::json!({ "project_keys": ["yce"], "member_role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(member_role(&pool, "YCE", "assign_user").await, "member");

    // 全部跳过时也要校验角色，且不写空的分配审计。
    let (status, body) = send(
        &app,
        "POST",
        "/api/v1/system/users/assign_user/projects",
        &admin.cookie,
        Some(serde_json::json!({ "project_keys": ["YCE"], "member_role": "owner" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    let assign_audits: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_logs WHERE action = 'user.project.assign' AND target_id = 'assign_user'",
    )
    .fetch_one(&pool)
    .await
    .expect("audit count");
    assert_eq!(
        assign_audits, 1,
        "only the call that actually assigned should be audited"
    );
}
