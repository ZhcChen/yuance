//! 并发写入正确性（体检 P1-3 / FR-008）：多连接文件库上并发执行先读后写的操作。

use yuance_api::domains::projects;

use crate::support::{bootstrap_admin_session, test_file_pool};

fn task_input(title: &str) -> projects::CreateWorkItemInput {
    projects::CreateWorkItemInput {
        project_key: "YCE".to_string(),
        item_type: "task".to_string(),
        title: title.to_string(),
        description: String::new(),
        priority: "P2".to_string(),
        assignee_username: String::new(),
        due_date: String::new(),
        parent_item_key: String::new(),
        actor_display_name_snapshot: "管理员".to_string(),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_work_item_creation_allocates_unique_numbers_without_lock_errors() {
    let pool = test_file_pool("concurrent-create").await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");

    let mut handles = Vec::new();
    for index in 0..12 {
        let pool = pool.clone();
        let actor = admin.user_id;
        handles.push(tokio::spawn(async move {
            projects::create_work_item(&pool, actor, task_input(&format!("并发任务 {index}")))
                .await
                .map(|item| item.item_key)
        }));
    }
    let mut keys = Vec::new();
    for handle in handles {
        match handle.await.expect("task should join") {
            Ok(key) => keys.push(key),
            Err(error) => panic!("concurrent create must not fail: {error}"),
        }
    }
    let unique: std::collections::HashSet<_> = keys.iter().collect();
    assert_eq!(
        unique.len(),
        keys.len(),
        "item keys must be unique: {keys:?}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_status_updates_never_record_a_stale_previous_status() {
    let pool = test_file_pool("concurrent-status").await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");

    for round in 0..6 {
        let item = projects::create_work_item(
            &pool,
            admin.user_id,
            task_input(&format!("流转竞态 {round}")),
        )
        .await
        .expect("work item should create");
        let initial_status = item.status.clone();
        let mut handles = Vec::new();
        for status in ["in_progress", "closed", "in_progress", "closed"] {
            let pool = pool.clone();
            let key = item.item_key.clone();
            let actor = admin.user_id;
            handles.push(tokio::spawn(async move {
                projects::update_work_item_status(&pool, actor, &key, status).await
            }));
        }
        let mut successes = 0;
        for handle in handles {
            match handle.await.expect("task should join") {
                Ok(_) => successes += 1,
                Err(yuance_api::platform::error::AppError::Conflict(_))
                | Err(yuance_api::platform::error::AppError::BadRequest(_)) => {}
                Err(error) => {
                    panic!("unexpected error (lock errors must not leak as 500): {error}")
                }
            }
        }

        // 每次成功的流转都必须基于当时真实的状态：按记录顺序回放，previous_status 应首尾衔接。
        let records: Vec<String> = sqlx::query_scalar(
            r#"
            SELECT pa.metadata FROM project_activities pa
            WHERE pa.action = 'work_item.status.updated' AND pa.target_id = ?1
            ORDER BY pa.id
            "#,
        )
        .bind(&item.item_key)
        .fetch_all(&pool)
        .await
        .expect("activities");
        assert_eq!(records.len(), successes, "round {round}: {records:?}");
        let mut expected_previous = initial_status.clone();
        for record in &records {
            let value: serde_json::Value = serde_json::from_str(record).expect("metadata json");
            assert_eq!(
                value["previous_status"], expected_previous,
                "round {round}: stale transition recorded: {records:?}"
            );
            expected_previous = value["status"].as_str().unwrap_or_default().to_string();
        }
        let final_status: String =
            sqlx::query_scalar("SELECT status FROM work_items WHERE item_key = ?1")
                .bind(&item.item_key)
                .fetch_one(&pool)
                .await
                .expect("final status");
        assert_eq!(final_status, expected_previous, "round {round}");
    }
}

#[tokio::test]
async fn work_item_edit_rejects_stale_expected_updated_at() {
    let pool = crate::support::test_pool().await;
    let admin = bootstrap_admin_session(&pool).await;
    projects::seed_demo_data(&pool, admin.user_id)
        .await
        .expect("demo seed");
    let item = projects::create_work_item(&pool, admin.user_id, task_input("乐观锁任务"))
        .await
        .expect("work item should create");
    sqlx::query("UPDATE work_items SET updated_at = '2026-01-01 00:00:00' WHERE item_key = ?1")
        .bind(&item.item_key)
        .execute(&pool)
        .await
        .expect("pin updated_at");
    let app = yuance_api::web::router::build_router(yuance_api::web::router::AppState::new(
        crate::support::test_settings(),
        Some(pool.clone()),
    ));
    let uri = format!("/api/v1/work-items/{}", item.item_key);

    let (status, body) = crate::support::send(
        &app,
        "PATCH",
        &uri,
        &admin.cookie,
        Some(serde_json::json!({ "title": "过期编辑", "expected_updated_at": "2025-12-31 23:59:59" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::CONFLICT, "{body}");
    let title: String = sqlx::query_scalar("SELECT title FROM work_items WHERE item_key = ?1")
        .bind(&item.item_key)
        .fetch_one(&pool)
        .await
        .expect("title");
    assert_eq!(title, "乐观锁任务");

    let (status, body) = crate::support::send(
        &app,
        "PATCH",
        &uri,
        &admin.cookie,
        Some(serde_json::json!({ "title": "最新编辑", "expected_updated_at": "2026-01-01 00:00:00" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{body}");

    // 不携带时保持原有行为。
    let (status, body) = crate::support::send(
        &app,
        "PATCH",
        &uri,
        &admin.cookie,
        Some(serde_json::json!({ "title": "无乐观锁编辑" })),
    )
    .await;
    assert_eq!(status, axum::http::StatusCode::OK, "{body}");
}
