use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::{Duration, Utc};
use yuance_api::{
    domains::{files, storage},
    platform::{config::Settings, db},
};

#[tokio::test]
async fn cleanup_pending_marks_only_expired_pending_file_objects_deleted() {
    let root = temp_root("files-cleanup-domain");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let settings = settings(&root, &database_url);
    let pool = db::connect_pool(&settings)
        .await
        .expect("database should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    seed_test_user(&pool).await;
    let config = seed_storage_config(&pool).await;

    let old_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "old-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("old pending should create");
    let fresh_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "fresh-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("fresh pending should create");
    let in_flight_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "in-flight-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("in-flight pending should create");
    let safe_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "safe-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("safe pending should create");
    let invalid_expiry_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "invalid-expiry-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("invalid expiry pending should create");
    let renewed_pending = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "renewed-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("renewed pending should create");
    let uploaded = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "uploaded.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("uploaded should create");
    files::mark_file_uploaded(&pool, uploaded.id)
        .await
        .expect("uploaded should mark");
    sqlx::query(
        "UPDATE file_objects SET created_at = datetime('now', '-48 hours') WHERE id IN (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(old_pending.id)
    .bind(uploaded.id)
    .bind(in_flight_pending.id)
    .bind(safe_pending.id)
    .bind(invalid_expiry_pending.id)
    .bind(renewed_pending.id)
    .execute(&pool)
    .await
    .expect("timestamps should update");
    let in_flight_expiry = (Utc::now().naive_utc() - Duration::hours(4))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    files::extend_file_object_upload_url_expiration(&pool, in_flight_pending.id, &in_flight_expiry)
        .await
        .expect("a recently expired upload grant should be recorded");
    let renewed_expiry = (Utc::now().naive_utc() + Duration::hours(1))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    files::extend_file_object_upload_url_expiration(&pool, renewed_pending.id, &renewed_expiry)
        .await
        .expect("a renewed upload grant should extend the recorded expiry");
    sqlx::query(
        r#"
        UPDATE file_objects
        SET upload_url_expires_at = CASE id
            WHEN ?1 THEN datetime('now', '-4 hours', '-6 minutes')
            WHEN ?2 THEN 'not-a-timestamp'
        END
        WHERE id IN (?1, ?2)
        "#,
    )
    .bind(safe_pending.id)
    .bind(invalid_expiry_pending.id)
    .execute(&pool)
    .await
    .expect("upload expiry timestamps should update");

    let dry_run = files::cleanup_pending_file_objects(&pool, 24, true)
        .await
        .expect("dry run should succeed");
    assert_eq!(dry_run.matched_count, 2);
    assert_eq!(dry_run.deleted_count, 0);
    assert_eq!(file_status(&pool, old_pending.id).await, "pending");

    let applied = files::cleanup_pending_file_objects(&pool, 24, false)
        .await
        .expect("cleanup should succeed");
    assert_eq!(applied.matched_count, 2);
    assert_eq!(applied.deleted_count, 2);
    assert_eq!(file_status(&pool, old_pending.id).await, "deleted");
    assert_eq!(file_status(&pool, safe_pending.id).await, "deleted");
    assert_eq!(file_status(&pool, fresh_pending.id).await, "pending");
    assert_eq!(file_status(&pool, in_flight_pending.id).await, "pending");
    assert_eq!(file_status(&pool, renewed_pending.id).await, "pending");
    assert_eq!(
        file_status(&pool, invalid_expiry_pending.id).await,
        "pending"
    );
    assert_eq!(file_status(&pool, uploaded.id).await, "uploaded");
    let signing_after_cleanup = files::extend_file_object_upload_url_expiration(
        &pool,
        old_pending.id,
        &Utc::now()
            .naive_utc()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
    )
    .await;
    assert!(matches!(
        signing_after_cleanup,
        Err(yuance_api::platform::error::AppError::Conflict(_))
    ));

    pool.close().await;
    cleanup(root);
}

#[tokio::test]
async fn files_cleanup_pending_cli_supports_dry_run_and_apply() {
    let root = temp_root("files-cleanup-cli");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let migrate = run_command(&root, &database_url, &["migrate", "up"]);
    assert!(migrate.status.success(), "stderr: {}", stderr(&migrate));

    let pool = db::connect_pool(&settings(&root, &database_url))
        .await
        .expect("database should connect");
    sqlx::query(
        r#"
        INSERT INTO storage_configs (
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_secret_ciphertext,
            status
        )
        VALUES ('aliyun_oss', 'https://oss-cn-hangzhou.aliyuncs.com', 'cn-hangzhou', 'yuance-cli', 'AKIA...TEST', 'cipher', 'active');
        "#,
    )
    .execute(&pool)
    .await
    .expect("storage config should insert");
    insert_file_object(&pool, "uploads/pending/old.txt", "old.txt", "pending", true).await;
    insert_file_object(
        &pool,
        "uploads/pending/new.txt",
        "new.txt",
        "pending",
        false,
    )
    .await;
    insert_file_object(
        &pool,
        "uploads/pending/uploaded.txt",
        "uploaded.txt",
        "uploaded",
        true,
    )
    .await;
    pool.close().await;

    let dry_run = run_command(
        &root,
        &database_url,
        &[
            "files",
            "cleanup-pending",
            "--older-than-hours",
            "24",
            "--dry-run",
        ],
    );
    assert!(dry_run.status.success(), "stderr: {}", stderr(&dry_run));
    assert!(stdout(&dry_run).contains("dry-run: matched=1 older_than_hours=24"));

    let apply = run_command(
        &root,
        &database_url,
        &["files", "cleanup-pending", "--older-than-hours", "24"],
    );
    assert!(apply.status.success(), "stderr: {}", stderr(&apply));
    assert!(stdout(&apply).contains("applied: matched=1 deleted=1 older_than_hours=24"));

    let pool = db::connect_pool(&settings(&root, &database_url))
        .await
        .expect("database should connect");
    let deleted_count = file_count(&pool, "old.txt", "deleted").await;
    let fresh_pending_count = file_count(&pool, "new.txt", "pending").await;
    let uploaded_count = file_count(&pool, "uploaded.txt", "uploaded").await;
    assert_eq!(deleted_count, 1);
    assert_eq!(fresh_pending_count, 1);
    assert_eq!(uploaded_count, 1);
    pool.close().await;

    cleanup(root);
}

#[tokio::test]
async fn files_cleanup_deleted_cli_respects_due_jobs_and_completes_missing_objects() {
    let root = temp_root("files-cleanup-deleted-cli");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let migrate = run_command(&root, &database_url, &["migrate", "up"]);
    assert!(migrate.status.success(), "stderr: {}", stderr(&migrate));

    let pool = db::connect_pool(&settings(&root, &database_url))
        .await
        .expect("database should connect");
    seed_test_user(&pool).await;
    storage::save_config(
        &pool,
        &settings(&root, &database_url),
        1,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-cli".to_string(),
            access_key_id: "AKIATESTKEYID".to_string(),
            access_key_secret: "SecretForTests2026".to_string(),
            activate: true,
        },
    )
    .await
    .expect("test storage config should save");
    let file_object_id = insert_file_object(
        &pool,
        "uploads/deleted/old.txt",
        "old-deleted.txt",
        "deleted",
        false,
    )
    .await;
    sqlx::query(
        r#"
        INSERT INTO file_object_deletion_jobs (
            file_object_id, storage_config_id, provider, endpoint, region,
            bucket, object_key, next_attempt_at
        )
        SELECT fo.id, fo.storage_config_id, fo.provider, sc.endpoint, sc.region,
               fo.bucket, fo.object_key, datetime('now', '-1 minute')
        FROM file_objects fo
        JOIN storage_configs sc ON sc.id = fo.storage_config_id
        WHERE fo.id = ?1
        "#,
    )
    .bind(file_object_id)
    .execute(&pool)
    .await
    .expect("due deletion job should insert");
    pool.close().await;

    let dry_run = run_command(
        &root,
        &database_url,
        &["files", "cleanup-deleted", "--dry-run", "--limit", "10"],
    );
    assert!(dry_run.status.success(), "stderr: {}", stderr(&dry_run));
    assert!(stdout(&dry_run).contains("dry-run: due=1 not_due=0 limit=10 pending=1"));

    let apply = run_command(
        &root,
        &database_url,
        &["files", "cleanup-deleted", "--limit", "10"],
    );
    assert!(apply.status.success(), "stderr: {}", stderr(&apply));
    assert!(stdout(&apply).contains(
        "applied: due=1 not_due=0 processed=1 completed=1 failed=0 lease_lost=0 pending=0"
    ));

    let pool = db::connect_pool(&settings(&root, &database_url))
        .await
        .expect("database should reconnect");
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM file_object_deletion_jobs WHERE file_object_id = ?1",
    )
    .bind(file_object_id)
    .fetch_one(&pool)
    .await
    .expect("deletion job status should load");
    assert_eq!(status, "completed");
    pool.close().await;

    cleanup(root);
}

#[tokio::test]
async fn files_cleanup_deleted_cli_reports_failure_and_can_retry_after_repair() {
    let root = temp_root("files-cleanup-diagnostics-cli");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let settings_value = settings(&root, &database_url);
    let pool = db::connect_pool(&settings_value)
        .await
        .expect("database should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    seed_test_user(&pool).await;
    storage::save_config(
        &pool,
        &settings_value,
        1,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-cli".to_string(),
            access_key_id: "AKIATESTKEYID".to_string(),
            access_key_secret: "SecretForTests2026".to_string(),
            activate: true,
        },
    )
    .await
    .expect("test storage config should save");
    let file_object_id = insert_file_object(
        &pool,
        "uploads/deleted/diagnostic.txt",
        "diagnostic-deleted.txt",
        "deleted",
        false,
    )
    .await;
    sqlx::query(
        r#"
        INSERT INTO file_object_deletion_jobs (
            file_object_id, storage_config_id, provider, endpoint, region,
            bucket, object_key, next_attempt_at
        )
        SELECT fo.id, NULL, fo.provider, sc.endpoint, sc.region,
               fo.bucket, fo.object_key, datetime('now', '-1 minute')
        FROM file_objects fo
        JOIN storage_configs sc ON sc.id = fo.storage_config_id
        WHERE fo.id = ?1
        "#,
    )
    .bind(file_object_id)
    .execute(&pool)
    .await
    .expect("broken deletion job should insert");
    pool.close().await;

    let failed = run_command(
        &root,
        &database_url,
        &["files", "cleanup-deleted", "--limit", "10"],
    );
    assert!(!failed.status.success());
    assert!(stdout(&failed).contains("failed=1"));
    assert!(stderr(&failed).contains("files deletion-jobs"));

    let diagnostics = run_command(&root, &database_url, &["files", "deletion-jobs"]);
    assert!(
        diagnostics.status.success(),
        "stderr: {}",
        stderr(&diagnostics)
    );
    assert!(stdout(&diagnostics).contains("status=pending attempts=1"));
    assert!(stdout(&diagnostics).contains("删除任务缺少原存储配置 ID"));

    let pool = db::connect_pool(&settings_value)
        .await
        .expect("database should reconnect");
    sqlx::query(
        "UPDATE file_object_deletion_jobs SET storage_config_id = 1, next_attempt_at = datetime('now', '-1 minute') WHERE file_object_id = ?1",
    )
    .bind(file_object_id)
    .execute(&pool)
    .await
    .expect("task should be repaired and made due");
    pool.close().await;

    let retried = run_command(
        &root,
        &database_url,
        &["files", "cleanup-deleted", "--limit", "10"],
    );
    assert!(retried.status.success(), "stderr: {}", stderr(&retried));
    assert!(stdout(&retried).contains("completed=1 failed=0"));

    let pool = db::connect_pool(&settings_value)
        .await
        .expect("database should reconnect after retry");
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM file_object_deletion_jobs WHERE file_object_id = ?1",
    )
    .bind(file_object_id)
    .fetch_one(&pool)
    .await
    .expect("repaired task status should load");
    assert_eq!(status, "completed");
    pool.close().await;
    cleanup(root);
}

#[tokio::test]
async fn deletion_job_migration_preserves_historical_deleted_objects_without_queueing_them() {
    let root = temp_root("files-deletion-migration");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let settings = settings(&root, &database_url);
    let pool = db::connect_pool(&settings)
        .await
        .expect("database should connect");
    db::MIGRATOR
        .run_to(202609110002, &pool)
        .await
        .expect("previous migrations should run");
    sqlx::query(
        r#"
        INSERT INTO storage_configs (id, provider, endpoint, region, bucket, status)
        VALUES (1, 'aliyun_oss', 'https://oss-cn-hangzhou.aliyuncs.com', 'cn-hangzhou', 'legacy', 'active')
        "#,
    )
    .execute(&pool)
    .await
    .expect("legacy config should insert");
    sqlx::query(
        r#"
        INSERT INTO file_objects (id, storage_config_id, provider, bucket, object_key, status)
        VALUES (1, 1, 'aliyun_oss', 'legacy', 'uploads/legacy/deleted.txt', 'deleted')
        "#,
    )
    .execute(&pool)
    .await
    .expect("historical deleted object should insert");

    db::run_migrations(&pool)
        .await
        .expect("new cleanup migration should apply");
    let status = file_status(&pool, 1).await;
    let job_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM file_object_deletion_jobs WHERE file_object_id = 1",
    )
    .fetch_one(&pool)
    .await
    .expect("historical deletion job count should load");
    assert_eq!(status, "deleted");
    assert_eq!(job_count, 0);

    pool.close().await;
    cleanup(root);
}

#[tokio::test]
async fn concurrent_cleanup_workers_claim_each_due_job_once() {
    let root = temp_root("files-cleanup-concurrent");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let settings_value = settings(&root, &database_url);
    let pool = db::connect_pool(&settings_value)
        .await
        .expect("database should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    seed_test_user(&pool).await;
    storage::save_config(
        &pool,
        &settings_value,
        1,
        storage::SaveStorageConfigInput {
            endpoint: storage::TEST_MEMORY_ENDPOINT.to_string(),
            region: "test".to_string(),
            bucket: "yuance-cli".to_string(),
            access_key_id: "AKIATESTKEYID".to_string(),
            access_key_secret: "SecretForTests2026".to_string(),
            activate: true,
        },
    )
    .await
    .expect("test storage config should save");
    let file_object_id = insert_file_object(
        &pool,
        "uploads/deleted/concurrent.txt",
        "concurrent-deleted.txt",
        "deleted",
        false,
    )
    .await;
    sqlx::query(
        r#"
        INSERT INTO file_object_deletion_jobs (
            file_object_id, storage_config_id, provider, endpoint, region,
            bucket, object_key, next_attempt_at
        )
        SELECT fo.id, fo.storage_config_id, fo.provider, sc.endpoint, sc.region,
               fo.bucket, fo.object_key, datetime('now', '-1 minute')
        FROM file_objects fo
        JOIN storage_configs sc ON sc.id = fo.storage_config_id
        WHERE fo.id = ?1
        "#,
    )
    .bind(file_object_id)
    .execute(&pool)
    .await
    .expect("due deletion job should insert");

    let second_pool = db::connect_pool(&settings_value)
        .await
        .expect("second database pool should connect");
    let second_settings = settings(&root, &database_url);
    let (left, right) = tokio::join!(
        files::cleanup_deleted_file_objects(&pool, &settings_value, false, 10),
        files::cleanup_deleted_file_objects(&second_pool, &second_settings, false, 10)
    );
    let left = left.expect("first worker should finish");
    let right = right.expect("second worker should finish");
    assert_eq!(left.processed_count + right.processed_count, 1);
    assert_eq!(left.completed_count + right.completed_count, 1);
    let job = sqlx::query_as::<_, (String, i64)>(
        "SELECT status, attempt_count FROM file_object_deletion_jobs WHERE file_object_id = ?1",
    )
    .bind(file_object_id)
    .fetch_one(&pool)
    .await
    .expect("concurrent task state should load");
    assert_eq!(job.0, "completed");
    assert_eq!(job.1, 1);

    pool.close().await;
    second_pool.close().await;
    cleanup(root);
}

#[tokio::test]
async fn audit_file_objects_counts_attached_and_orphan_records() {
    let root = temp_root("files-audit-domain");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);
    let settings = settings(&root, &database_url);
    let pool = db::connect_pool(&settings)
        .await
        .expect("database should connect");
    db::run_migrations(&pool)
        .await
        .expect("migrations should run");
    seed_test_user(&pool).await;
    let config = seed_storage_config(&pool).await;

    let attached = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "attached.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("attached file should create");
    insert_attachment(&pool, attached.id, "project", 1).await;

    files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "orphan-pending.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("pending orphan should create");
    let uploaded_orphan = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "orphan-uploaded.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("uploaded orphan should create");
    files::mark_file_uploaded(&pool, uploaded_orphan.id)
        .await
        .expect("uploaded orphan should mark");
    let release_owned = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "release-owned.bin".to_string(),
            content_type: "application/octet-stream".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("release-owned file should create");
    files::mark_file_uploaded(&pool, release_owned.id)
        .await
        .expect("release-owned file should mark uploaded");
    let release_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO system_release_versions (version_name) VALUES ('audit-release') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("release version should create");
    sqlx::query(
        "INSERT INTO system_release_assets (release_id, file_object_id, platform) VALUES (?1, ?2, 'windows')",
    )
    .bind(release_id)
    .bind(release_owned.id)
    .execute(&pool)
    .await
    .expect("release asset should link");
    sqlx::query(
        "INSERT INTO system_release_assets (release_id, file_object_id, platform) VALUES (?1, ?2, 'macos')",
    )
    .bind(release_id)
    .bind(attached.id)
    .execute(&pool)
    .await
    .expect("a file object can have more than one owner relationship");
    let deleted_orphan = files::create_file_object(
        &pool,
        &config,
        files::CreateFileObjectInput {
            folder_id: None,
            original_filename: "orphan-deleted.txt".to_string(),
            content_type: "text/plain".to_string(),
            byte_size: 10,
            created_by_user_id: 1,
        },
    )
    .await
    .expect("deleted orphan should create");
    sqlx::query("UPDATE file_objects SET status = 'deleted' WHERE id = ?1")
        .bind(deleted_orphan.id)
        .execute(&pool)
        .await
        .expect("deleted orphan should mark");

    let default_summary = files::audit_file_objects(&pool, false)
        .await
        .expect("audit should succeed");
    assert_eq!(default_summary.total_count, 4);
    assert_eq!(default_summary.attached_count, 2);
    assert_eq!(default_summary.orphan_count, 2);
    assert_eq!(default_summary.pending_orphan_count, 1);
    assert_eq!(default_summary.uploaded_orphan_count, 1);
    assert_eq!(default_summary.deleted_orphan_count, 0);
    assert!(!default_summary.include_deleted);

    let include_deleted = files::audit_file_objects(&pool, true)
        .await
        .expect("audit with deleted should succeed");
    assert_eq!(include_deleted.total_count, 5);
    assert_eq!(include_deleted.attached_count, 2);
    assert_eq!(include_deleted.orphan_count, 3);
    assert_eq!(include_deleted.pending_orphan_count, 1);
    assert_eq!(include_deleted.uploaded_orphan_count, 1);
    assert_eq!(include_deleted.deleted_orphan_count, 1);
    assert!(include_deleted.include_deleted);

    pool.close().await;
    cleanup(root);
}

#[tokio::test]
async fn files_audit_objects_cli_reports_default_and_include_deleted_counts() {
    let root = temp_root("files-audit-cli");
    let database_path = root.join("yuance.sqlite3");
    let database_url = database_url(&database_path);

    let migrate = run_command(&root, &database_url, &["migrate", "up"]);
    assert!(migrate.status.success(), "stderr: {}", stderr(&migrate));

    let pool = db::connect_pool(&settings(&root, &database_url))
        .await
        .expect("database should connect");
    sqlx::query(
        r#"
        INSERT INTO storage_configs (
            id,
            provider,
            endpoint,
            region,
            bucket,
            access_key_id_hint,
            access_key_secret_ciphertext,
            status
        )
        VALUES (1, 'aliyun_oss', 'https://oss-cn-hangzhou.aliyuncs.com', 'cn-hangzhou', 'yuance-cli', 'AKIA...TEST', 'cipher', 'active');
        "#,
    )
    .execute(&pool)
    .await
    .expect("storage config should insert");
    let attached = insert_file_object(
        &pool,
        "uploads/audit/attached.txt",
        "attached.txt",
        "uploaded",
        false,
    )
    .await;
    insert_attachment(&pool, attached, "project", 1).await;
    let release_owned = insert_file_object(
        &pool,
        "uploads/audit/release-owned.bin",
        "release-owned.bin",
        "uploaded",
        false,
    )
    .await;
    let release_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO system_release_versions (version_name) VALUES ('audit-cli-release') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("release version should insert");
    sqlx::query(
        "INSERT INTO system_release_assets (release_id, file_object_id, platform) VALUES (?1, ?2, 'windows')",
    )
    .bind(release_id)
    .bind(release_owned)
    .execute(&pool)
    .await
    .expect("release asset should insert");
    sqlx::query(
        "INSERT INTO system_release_assets (release_id, file_object_id, platform) VALUES (?1, ?2, 'macos')",
    )
    .bind(release_id)
    .bind(attached)
    .execute(&pool)
    .await
    .expect("a file object can have more than one owner relationship");
    insert_file_object(
        &pool,
        "uploads/audit/pending.txt",
        "pending.txt",
        "pending",
        false,
    )
    .await;
    insert_file_object(
        &pool,
        "uploads/audit/deleted.txt",
        "deleted.txt",
        "deleted",
        false,
    )
    .await;
    pool.close().await;

    let default_audit = run_command(&root, &database_url, &["files", "audit-objects"]);
    assert!(
        default_audit.status.success(),
        "stderr: {}",
        stderr(&default_audit)
    );
    assert!(stdout(&default_audit).contains(
        "file object audit: total=3 attached=2 orphan=1 pending_orphan=1 uploaded_orphan=0 deleted_orphan=0 include_deleted=false"
    ));

    let include_deleted = run_command(
        &root,
        &database_url,
        &["files", "audit-objects", "--include-deleted"],
    );
    assert!(
        include_deleted.status.success(),
        "stderr: {}",
        stderr(&include_deleted)
    );
    assert!(stdout(&include_deleted).contains(
        "file object audit: total=4 attached=2 orphan=2 pending_orphan=1 uploaded_orphan=0 deleted_orphan=1 include_deleted=true"
    ));

    cleanup(root);
}

async fn seed_storage_config(pool: &sqlx::SqlitePool) -> storage::StorageConfig {
    storage::save_config(
        pool,
        &settings(Path::new("/tmp"), "sqlite::memory:"),
        1,
        storage::SaveStorageConfigInput {
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            region: "cn-hangzhou".to_string(),
            bucket: "yuance-files".to_string(),
            access_key_id: "AKIATESTKEYID".to_string(),
            access_key_secret: "SecretForTests2026".to_string(),
            activate: true,
        },
    )
    .await
    .expect("storage config should save")
}

async fn seed_test_user(pool: &sqlx::SqlitePool) {
    sqlx::query(
        r#"
        INSERT INTO users (
            id,
            username,
            password_hash,
            display_name,
            status
        )
        VALUES (
            1,
            'file_tester',
            'not-used',
            '文件测试用户',
            'active'
        )
        ON CONFLICT(id) DO NOTHING
        "#,
    )
    .execute(pool)
    .await
    .expect("test user should insert");
}

async fn file_status(pool: &sqlx::SqlitePool, id: i64) -> String {
    sqlx::query_scalar::<_, String>("SELECT status FROM file_objects WHERE id = ?1")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("file status should load")
}

async fn insert_file_object(
    pool: &sqlx::SqlitePool,
    object_key: &str,
    original_filename: &str,
    status: &str,
    expired: bool,
) -> i64 {
    if expired {
        sqlx::query_scalar::<_, i64>(
            r#"
        INSERT INTO file_objects (
            storage_config_id,
            provider,
            bucket,
            object_key,
            original_filename,
            content_type,
            byte_size,
            status,
            created_at,
            updated_at
        )
        VALUES (
            1,
            'aliyun_oss',
            'yuance-cli',
            ?1,
            ?2,
            'text/plain',
            1,
            ?3,
            datetime('now', '-48 hours'),
            datetime('now', '-48 hours')
        )
        RETURNING id
        "#,
        )
        .bind(object_key)
        .bind(original_filename)
        .bind(status)
        .fetch_one(pool)
        .await
        .expect("expired file object should insert")
    } else {
        sqlx::query_scalar::<_, i64>(
            r#"
        INSERT INTO file_objects (
            storage_config_id,
            provider,
            bucket,
            object_key,
            original_filename,
            content_type,
            byte_size,
            status,
            created_at,
            updated_at
        )
        VALUES (
            1,
            'aliyun_oss',
            'yuance-cli',
            ?1,
            ?2,
            'text/plain',
            1,
            ?3,
            datetime('now'),
            datetime('now')
        )
        RETURNING id
        "#,
        )
        .bind(object_key)
        .bind(original_filename)
        .bind(status)
        .fetch_one(pool)
        .await
        .expect("fresh file object should insert")
    }
}

async fn insert_attachment(
    pool: &sqlx::SqlitePool,
    file_object_id: i64,
    target_type: &str,
    target_id: i64,
) {
    sqlx::query(
        r#"
        INSERT INTO file_attachments (
            file_object_id,
            target_type,
            target_id,
            created_by_user_id
        )
        VALUES (?1, ?2, ?3, NULL)
        "#,
    )
    .bind(file_object_id)
    .bind(target_type)
    .bind(target_id)
    .execute(pool)
    .await
    .expect("attachment should insert");
}

fn run_command(root: &Path, database_url: &str, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_yuance-api"));
    for arg in args {
        command.arg(arg);
    }
    command
        .current_dir(root)
        .env("YUANCE_DATABASE_URL", database_url)
        .env("YUANCE_DATA_DIR", root.join("data"))
        .env("YUANCE_ENV", "test")
        .env("YUANCE_SESSION_SECRET", "cli-test-session-secret")
        .env("YUANCE_SECURITY_MASTER_KEY", "cli-test-master-key-2026")
        .env("YUANCE_LOG_LEVEL", "off")
        .output()
        .expect("yuance-api command should run")
}

fn settings(root: &Path, database_url: &str) -> Settings {
    Settings {
        http_addr: "127.0.0.1:33033"
            .parse()
            .expect("test socket address should parse"),
        database_url: database_url.to_string(),
        data_dir: root.join("data").display().to_string(),
        session_secret: "cli-test-session-secret".to_string(),
        session_ttl: "2h".to_string(),
        refresh_session_ttl: "30d".to_string(),
        cache_session_ttl: "5m".to_string(),
        log_level: "off".to_string(),
        env: "test".to_string(),
        security_master_key: "cli-test-master-key-2026".to_string(),
        file_master_key: "test-file-master-key-that-is-long-enough".to_string(),
        device_sessions: Default::default(),
        experimental_legacy_preview_enabled: false,
    }
}

fn temp_root(name: &str) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be valid")
        .as_nanos();
    let root =
        std::env::temp_dir().join(format!("yuance-{name}-{}-{timestamp}", std::process::id()));
    fs::create_dir_all(&root).expect("temp root should create");
    root
}

fn database_url(path: &Path) -> String {
    format!("sqlite://{}", path.display())
}

async fn file_count(pool: &sqlx::SqlitePool, original_filename: &str, status: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM file_objects WHERE original_filename = ?1 AND status = ?2",
    )
    .bind(original_filename)
    .bind(status)
    .fetch_one(pool)
    .await
    .expect("file count should load")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

fn cleanup(root: PathBuf) {
    let _ = fs::remove_dir_all(root);
}
