//! 附件流式下载与预览（体检 P0-5 / FR-011）：多分组、Range 跨块、篡改检测。

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tower::ServiceExt;
use yuance_api::{
    domains::{files, projects, storage},
    platform::file_crypto,
    web::router::{AppState, build_router},
};

use crate::support::{bootstrap_admin_session, test_pool, test_settings};

/// 约 6.5 个分块：跨越两个读取分组（每组 4 块）。
const PLAINTEXT_LEN: usize = 6 * 1024 * 1024 + 512 * 1024 + 7;

fn sample_plaintext() -> Vec<u8> {
    (0..PLAINTEXT_LEN)
        .map(|index| (index * 31 % 251) as u8)
        .collect()
}

struct Fixture {
    app: axum::Router,
    cookie: String,
    attachment_id: i64,
    plaintext: Vec<u8>,
}

async fn encrypted_fixture(tamper: bool) -> Fixture {
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
    .expect("memory storage config");
    let item = projects::get_work_item_detail(&pool, "YCE-TASK-2")
        .await
        .expect("work item")
        .expect("work item exists");
    let project = projects::get_project_detail(&pool, "YCE")
        .await
        .expect("project")
        .expect("project exists");
    let config = storage::active_config(&pool)
        .await
        .expect("config")
        .expect("config exists");
    let plaintext = sample_plaintext();
    let attachment = files::create_attachment_with_checksum_encrypted(
        &pool,
        &config,
        files::CreateAttachmentInput {
            folder_id: None,
            target_type: "work_item".to_string(),
            target_id: item.id,
            project_id: Some(project.id),
            original_filename: "large.pdf".to_string(),
            content_type: "application/pdf".to_string(),
            byte_size: plaintext.len() as i64,
            created_by_user_id: admin.user_id,
            created_by_display_name_snapshot: String::new(),
            activity_summary: None,
        },
        &hex::encode(Sha256::digest(&plaintext)),
        &test_settings().file_master_key,
    )
    .await
    .expect("encrypted attachment");
    let encryption = files::get_file_object_encryption(&pool, attachment.file_object_id)
        .await
        .expect("encryption")
        .expect("encryption exists");
    let data_key = file_crypto::open_data_key(
        &test_settings().file_master_key,
        &encryption.data_key_envelope,
        attachment.object_key.as_bytes(),
    )
    .expect("data key");
    let mut ciphertext =
        file_crypto::encrypt_plaintext(&data_key, attachment.file_object_id, &plaintext)
            .expect("encrypt");
    let encrypted_sha = hex::encode(Sha256::digest(&ciphertext));
    if tamper {
        // 篡改第二个读取分组中的一个字节：响应头已发出后应中断流，而不是输出被篡改的内容。
        let index = ciphertext.len() - 1024;
        ciphertext[index] ^= 0x5a;
    }
    let encrypted_len = ciphertext.len() as i64;
    storage::write_test_memory_object(
        &pool,
        &test_settings(),
        &attachment.object_key,
        "application/octet-stream",
        ciphertext,
    )
    .await
    .expect("write ciphertext");
    files::mark_attachment_uploaded_encrypted(
        &pool,
        attachment.id,
        "work_item",
        item.id,
        encrypted_len,
        &encrypted_sha,
    )
    .await
    .expect("mark uploaded");

    Fixture {
        app: build_router(AppState::new(test_settings(), Some(pool))),
        cookie: admin.cookie,
        attachment_id: attachment.id,
        plaintext,
    }
}

async fn get(
    fixture: &Fixture,
    uri: &str,
    range: Option<&str>,
) -> (StatusCode, axum::http::HeaderMap, Result<Vec<u8>, String>) {
    let mut builder = Request::builder()
        .uri(uri)
        .header(header::COOKIE, fixture.cookie.clone());
    if let Some(range) = range {
        builder = builder.header(header::RANGE, range);
    }
    let response = fixture
        .app
        .clone()
        .oneshot(builder.body(Body::empty()).expect("request"))
        .await
        .expect("router should respond");
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .into_body()
        .collect()
        .await
        .map(|collected| collected.to_bytes().to_vec())
        .map_err(|error| error.to_string());
    (status, headers, body)
}

#[tokio::test]
async fn encrypted_download_streams_full_plaintext_across_read_groups() {
    let fixture = encrypted_fixture(false).await;
    let uri = format!(
        "/web/work-items/YCE-TASK-2/attachments/{}/download",
        fixture.attachment_id
    );
    let (status, headers, body) = get(&fixture, &uri, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get(header::CONTENT_LENGTH).unwrap(),
        &PLAINTEXT_LEN.to_string()
    );
    let body = body.expect("body should stream completely");
    assert_eq!(body.len(), fixture.plaintext.len());
    assert!(body == fixture.plaintext, "downloaded plaintext must match");

    // 流式输出：每帧不超过一个读取分组（4MiB），整体分多帧，而不是整文件一次性缓冲。
    let response = fixture
        .app
        .clone()
        .oneshot(
            Request::builder()
                .uri(&uri)
                .header(header::COOKIE, fixture.cookie.clone())
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("router should respond");
    let mut body = response.into_body();
    let mut frames = Vec::new();
    while let Some(frame) = body.frame().await {
        if let Ok(data) = frame.expect("frame").into_data() {
            frames.push(data.len());
        }
    }
    assert!(frames.len() >= 2, "expected multiple frames: {frames:?}");
    assert!(
        frames
            .iter()
            .all(|len| *len <= 4 * file_crypto::FILE_CHUNK_SIZE),
        "frames must be bounded: {frames:?}"
    );
}

#[tokio::test]
async fn encrypted_preview_ranges_cut_mid_chunk_and_across_groups() {
    let fixture = encrypted_fixture(false).await;
    let uri = format!(
        "/api/v1/work-items/YCE-TASK-2/attachments/{}/preview/content",
        fixture.attachment_id
    );
    let chunk = file_crypto::FILE_CHUNK_SIZE;
    for (start, end) in [
        (0, 10),
        (chunk - 3, chunk + 3),
        (chunk / 2, 5 * chunk + 17),
        (PLAINTEXT_LEN - 5, PLAINTEXT_LEN - 1),
    ] {
        let (status, headers, body) =
            get(&fixture, &uri, Some(&format!("bytes={start}-{end}"))).await;
        assert_eq!(status, StatusCode::PARTIAL_CONTENT, "range {start}-{end}");
        assert_eq!(
            headers.get(header::CONTENT_RANGE).unwrap(),
            &format!("bytes {start}-{end}/{PLAINTEXT_LEN}")
        );
        let body = body.expect("range body");
        assert!(
            body == fixture.plaintext[start..=end],
            "range {start}-{end} content mismatch"
        );
    }
    let (status, _, body) = get(&fixture, &uri, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.expect("full preview body") == fixture.plaintext);
}

#[tokio::test]
async fn tampered_ciphertext_aborts_the_stream() {
    let fixture = encrypted_fixture(true).await;
    let uri = format!(
        "/web/work-items/YCE-TASK-2/attachments/{}/download",
        fixture.attachment_id
    );
    let (status, _, body) = get(&fixture, &uri, None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "headers are sent before the bad chunk"
    );
    assert!(
        body.is_err(),
        "stream must fail instead of returning tampered data"
    );
}
