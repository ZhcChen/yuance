use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::Duration,
};

use chrono::Utc;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::{
    cli::{
        ResourceAttachmentAccessArgs, ResourceAttachmentCompleteArgs, ResourceAttachmentCreateArgs,
        ResourceAttachmentDeleteArgs, ResourceAttachmentDownloadArgs, ResourceAttachmentUploadArgs,
        ResourceAttachmentUploadUrlArgs, ResourceAttachmentsCommand, ResourcesCommand,
        ResourcesCreateArgs, ResourcesListArgs, ResourcesUnlockArgs, ResourcesUpdateArgs,
    },
    client::ApiClient,
    error::AgentError,
    file_crypto::{EncryptedFileBody, hash_file},
    models::{
        CompleteAttachmentUploadRequest, CreateAttachmentRequest, CreateProjectResourceRequest,
        UnlockProjectResourceRequest, UpdateProjectResourceRequest,
    },
};

use super::{
    projects::{push_option, query_refs},
    read_secret_stdin, read_text, require_non_empty,
};

pub async fn run(client: &ApiClient, command: ResourcesCommand) -> Result<Value, AgentError> {
    match command {
        ResourcesCommand::List(args) => list(client, args).await,
        ResourcesCommand::Get {
            project_key,
            resource_id,
        } => {
            client
                .get_segments(
                    &[
                        "api",
                        "v1",
                        "projects",
                        &project_key,
                        "resources",
                        &resource_id.to_string(),
                    ],
                    &[],
                )
                .await
        }
        ResourcesCommand::Create(args) => create(client, args).await,
        ResourcesCommand::Unlock(args) => unlock(client, args).await,
        ResourcesCommand::Update(args) => update(client, args).await,
        ResourcesCommand::Attachments { command } => attachments(client, command).await,
    }
}

async fn download_attachment(
    client: &ApiClient,
    args: ResourceAttachmentDownloadArgs,
) -> Result<Value, AgentError> {
    validate_download_output_path(&args.output)?;
    let signed = signed_url(
        client,
        ResourceAttachmentAccessArgs {
            project_key: args.project_key,
            resource_id: args.resource_id,
            attachment_id: Some(args.attachment_id),
            access_token_stdin: args.access_token_stdin,
            expires_in_seconds: Some(60),
        },
        "download-url",
    )
    .await?;
    let signed = serde_json::from_value::<crate::models::AttachmentSignedUrlEnvelope>(signed)
        .map_err(|_| download_error("invalid_download_contract", "下载签名响应格式无效"))?
        .data;
    let contract = crate::transfer::ValidatedDownloadContract::parse(
        signed,
        &format!("{}/", client.api_origin()),
        Utc::now(),
    )?;
    let transport = crate::transfer::SignedObjectTransport::new(Duration::from_secs(60))
        .map_err(|_| download_error("download_transport_unavailable", "无法初始化附件下载"))?;
    let ciphertext = transport.get(&contract).await?;
    let plaintext = if let Some(encryption) = &contract.encryption {
        let encrypted_sha256 = hex::encode(Sha256::digest(&ciphertext));
        if encrypted_sha256 != encryption.encrypted_checksum_sha256 {
            return Err(download_error(
                "encrypted_checksum_mismatch",
                "附件密文校验失败",
            ));
        }
        crate::file_crypto::decrypt_file(
            &ciphertext,
            encryption.file_object_id,
            encryption.key,
            encryption.plaintext_byte_size as u64,
            &encryption.plaintext_sha256,
        )
        .map_err(|_| download_error("decryption_failed", "附件解密或完整性校验失败"))?
    } else {
        ciphertext
    };
    let plaintext_sha256 = hex::encode(Sha256::digest(&plaintext));
    let expected_plaintext_bytes = contract
        .encryption
        .as_ref()
        .map_or(contract.expected_bytes, |value| value.plaintext_byte_size);
    if i64::try_from(plaintext.len()).ok() != Some(expected_plaintext_bytes)
        || contract
            .checksum_sha256
            .as_ref()
            .is_some_and(|expected| plaintext_sha256 != *expected)
    {
        return Err(download_error(
            "plaintext_checksum_mismatch",
            "附件明文校验失败",
        ));
    }
    write_download_output(&args.output, &plaintext)?;

    Ok(serde_json::json!({
        "data": {
            "status": "downloaded",
            "attachment_id": contract.attachment_id,
            "filename": contract.filename,
            "content_type": contract.content_type,
            "byte_size": plaintext.len(),
            "sha256": plaintext_sha256,
            "path": args.output.display().to_string()
        }
    }))
}

fn validate_download_output_path(path: &Path) -> Result<(), AgentError> {
    if path.as_os_str().is_empty() || path == Path::new("-") || path.file_name().is_none() {
        return Err(download_error(
            "invalid_output_path",
            "必须提供有效的本地输出路径，不能写入 stdout",
        ));
    }
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !fs::metadata(parent).is_ok_and(|metadata| metadata.is_dir()) {
        return Err(download_error(
            "invalid_output_path",
            "输出目录不存在或不是目录",
        ));
    }
    match fs::symlink_metadata(path) {
        Ok(_) => Err(download_error(
            "output_already_exists",
            "输出文件已存在；请选择新的路径",
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(download_error(
            "output_path_unavailable",
            "无法检查输出路径",
        )),
    }
}

fn write_download_output(path: &Path, bytes: &[u8]) -> Result<(), AgentError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            download_error("output_already_exists", "输出文件已存在；请选择新的路径")
        } else {
            download_error("output_write_failed", "无法创建附件输出文件")
        }
    })?;
    if file
        .write_all(bytes)
        .and_then(|()| file.sync_all())
        .is_err()
    {
        return Err(if file.set_len(0).and_then(|()| file.sync_all()).is_ok() {
            download_error("output_write_failed", "写入附件失败，已清空不完整文件")
        } else {
            download_error(
                "output_cleanup_failed",
                "写入附件失败，且无法清空不完整文件",
            )
        });
    }
    Ok(())
}

fn redact_signed_contract(payload: Value) -> Value {
    let Some(data) = payload.get("data").and_then(Value::as_object) else {
        return serde_json::json!({"data": {}});
    };
    let attachment = selected_fields(
        data.get("attachment"),
        &[
            "id",
            "file_object_id",
            "filename",
            "content_type",
            "byte_size",
            "status",
        ],
    );
    let request_method = data
        .get("request")
        .and_then(|request| request.get("method"))
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "GET" | "PUT"))
        .map(|value| Value::String(value.to_string()))
        .unwrap_or(Value::Null);
    let encryption = match data.get("encryption") {
        Some(Value::Null) => Value::Null,
        Some(value) if value.is_object() => {
            let mut safe = selected_fields(
                Some(value),
                &[
                    "algorithm",
                    "format",
                    "chunk_size",
                    "file_object_id",
                    "plaintext_byte_size",
                    "plaintext_sha256",
                    "encrypted_byte_size",
                    "encrypted_checksum_sha256",
                ],
            );
            safe["key"] = Value::String("[redacted]".to_string());
            safe
        }
        _ => Value::Null,
    };
    serde_json::json!({
        "data": {
            "attachment": attachment,
            "request": {"method": request_method, "url": "[redacted]", "headers": {}},
            "expires_in_seconds": data.get("expires_in_seconds"),
            "expires_at": data.get("expires_at"),
            "checksum_sha256": data.get("checksum_sha256"),
            "encryption": encryption
        }
    })
}

fn selected_fields(value: Option<&Value>, fields: &[&str]) -> Value {
    let mut selected = serde_json::Map::new();
    if let Some(object) = value.and_then(Value::as_object) {
        for field in fields {
            if let Some(value) = object.get(*field) {
                selected.insert((*field).to_string(), value.clone());
            }
        }
    }
    Value::Object(selected)
}

fn download_error(code: &'static str, message: &str) -> AgentError {
    AgentError::Download {
        stage: "downloading",
        code,
        message: message.to_string(),
        attachment_id: None,
    }
}

async fn create(client: &ApiClient, args: ResourcesCreateArgs) -> Result<Value, AgentError> {
    require_non_empty(&args.title, "资料标题")?;
    if let Some(value) = &args.category {
        require_non_empty(value, "资料分类")?;
    }
    if let Some(value) = &args.body_format {
        require_non_empty(value, "资料正文格式")?;
    }
    if args.access_password_stdin && args.body_file.as_deref() == Some(Path::new("-")) {
        return Err(AgentError::Config {
            code: "conflicting_stdin_inputs",
            message: "资料正文和访问密码不能同时从 stdin 读取".to_string(),
        });
    }

    let body = read_text(None, args.body_file.as_deref(), "资料正文")?;
    let access_password = if args.access_password_stdin {
        Some(read_secret_stdin("访问密码")?)
    } else {
        None
    };
    let request = CreateProjectResourceRequest {
        title: args.title,
        category: args.category,
        body,
        body_format: args.body_format,
        access_password,
        tags: args.tags,
        related_work_item_key: args.related_work_item_key,
        related_cycle_id: args.related_cycle_id,
    };

    client
        .post_segments(
            &["api", "v1", "projects", &args.project_key, "resources"],
            &request,
        )
        .await
}

async fn list(client: &ApiClient, args: ResourcesListArgs) -> Result<Value, AgentError> {
    let mut query = Vec::new();
    push_option(&mut query, "q", args.q);
    push_option(&mut query, "category", args.category);
    push_option(&mut query, "status", args.status);
    push_option(&mut query, "tag", args.tag);
    push_option(
        &mut query,
        "related_work_item_key",
        args.related_work_item_key,
    );
    push_option(
        &mut query,
        "related_cycle_id",
        args.related_cycle_id.map(|value| value.to_string()),
    );
    client
        .get_segments(
            &["api", "v1", "projects", &args.project_key, "resources"],
            &query_refs(&query),
        )
        .await
}

async fn unlock(client: &ApiClient, args: ResourcesUnlockArgs) -> Result<Value, AgentError> {
    let access_password = read_secret_stdin("访问密码")?;
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "unlock",
            ],
            &UnlockProjectResourceRequest { access_password },
        )
        .await
}

async fn update(client: &ApiClient, args: ResourcesUpdateArgs) -> Result<Value, AgentError> {
    let body = read_text(None, args.body_file.as_deref(), "资料正文")?;
    if let Some(value) = &args.access_password_action {
        require_non_empty(value, "访问密码动作")?;
    }
    let access_password = if args.access_password_stdin {
        Some(read_secret_stdin("访问密码")?)
    } else {
        None
    };
    let request = UpdateProjectResourceRequest {
        title: args.title,
        category: args.category,
        body,
        body_format: args.body_format,
        access_password_action: args.access_password_action,
        access_password,
        tags: args.tags,
        related_work_item_key: args.related_work_item_key,
        related_cycle_id: args.related_cycle_id,
    };
    client
        .patch_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
            ],
            &request,
        )
        .await
}

async fn attachments(
    client: &ApiClient,
    command: ResourceAttachmentsCommand,
) -> Result<Value, AgentError> {
    match command {
        ResourceAttachmentsCommand::List(args) => list_attachments(client, args).await,
        ResourceAttachmentsCommand::Create(args) => create_attachment(client, args).await,
        ResourceAttachmentsCommand::Upload(args) => upload_attachment(client, args).await,
        ResourceAttachmentsCommand::Download(args) => download_attachment(client, args).await,
        ResourceAttachmentsCommand::UploadUrl(args) => {
            upload_url(client, args).await.map(redact_signed_contract)
        }
        ResourceAttachmentsCommand::DownloadUrl(args) => signed_url(client, args, "download-url")
            .await
            .map(redact_signed_contract),
        ResourceAttachmentsCommand::Complete(args) => complete_attachment(client, args).await,
        ResourceAttachmentsCommand::Delete(args) => delete_attachment(client, args).await,
    }
}

async fn upload_attachment(
    client: &ApiClient,
    args: ResourceAttachmentUploadArgs,
) -> Result<Value, AgentError> {
    let filename = args
        .file
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| upload_error("local-validation", "文件名无效", None, None))?
        .to_string();
    let metadata = fs::metadata(&args.file).map_err(|error| {
        upload_error(
            "local-validation",
            &format!("读取上传文件元数据失败: {error}"),
            None,
            None,
        )
    })?;
    ensure_cli_upload_size(metadata.len())?;
    let digest = hash_file(&args.file).map_err(|error| {
        upload_error(
            "local-validation",
            &format!("读取上传文件失败: {error}"),
            None,
            None,
        )
    })?;
    ensure_cli_upload_size(digest.byte_size)?;
    let content_type = args
        .content_type
        .or_else(|| infer_content_type(&filename).map(str::to_string))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let created = client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
            ],
            &CreateAttachmentRequest {
                original_filename: filename,
                content_type,
                byte_size: i64::try_from(digest.byte_size).map_err(|_| {
                    upload_error("local-validation", "文件大小超出支持范围", None, None)
                })?,
                checksum_sha256: Some(digest.sha256.clone()),
            },
        )
        .await
        .map_err(|error| upload_error("registering", &error.to_string(), None, None))?;
    let attachment_id = created
        .get("data")
        .and_then(|value| value.get("id"))
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)
        .ok_or_else(|| upload_error("registering", "附件登记响应缺少有效 ID", None, None))?;

    let signed = upload_url(
        client,
        ResourceAttachmentUploadUrlArgs {
            project_key: args.project_key.clone(),
            resource_id: args.resource_id,
            attachment_id,
            expires_in_seconds: Some(60),
        },
    )
    .await
    .map_err(|error| upload_error("signing", &error.to_string(), Some(attachment_id), None))?;
    let signed = serde_json::from_value::<crate::models::AttachmentSignedUrlEnvelope>(signed)
        .map_err(|_| upload_error("signing", "签名响应格式无效", Some(attachment_id), None))?
        .data;
    let contract = crate::transfer::ValidatedUploadContract::parse(
        signed,
        &format!("{}/", client.api_origin()),
        Utc::now(),
    )
    .map_err(|error| upload_error("signing", &error.to_string(), Some(attachment_id), None))?;
    if contract.attachment_id != attachment_id
        || contract.plaintext_bytes != i64::try_from(digest.byte_size).unwrap_or(-1)
        || contract.plaintext_sha256 != digest.sha256
    {
        return Err(upload_error(
            "signing",
            "签名响应与本地文件元数据不匹配",
            Some(attachment_id),
            None,
        ));
    }

    let transport =
        crate::transfer::SignedObjectTransport::new(Duration::from_secs(30)).map_err(|error| {
            upload_error("uploading", &error.to_string(), Some(attachment_id), None)
        })?;
    let (body, encrypted_digest) = if let Some(encryption) = &contract.encryption {
        let body = EncryptedFileBody::open(
            &args.file,
            encryption.file_object_id,
            encryption.key,
            &digest,
        )
        .map_err(|error| {
            upload_error(
                "uploading",
                &format!("加密文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        let digest_handle = body.digest();
        (body.into_body(), Some(digest_handle))
    } else {
        let file = tokio::fs::File::open(&args.file).await.map_err(|error| {
            upload_error(
                "uploading",
                &format!("打开上传文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        let stream = tokio_util::io::ReaderStream::new(file);
        (reqwest::Body::wrap_stream(stream), None)
    };
    if let Err(error) = transport.put(&contract, body).await {
        let recoverable_digest = encrypted_digest
            .as_ref()
            .and_then(|handle| handle.encrypted_sha256().ok());
        return Err(upload_error(
            "uploading-uncertain",
            &format!("PUT 响应不确定 ({error})；先检查附件状态，不要重复上传"),
            Some(attachment_id),
            recoverable_digest,
        ));
    }
    let encrypted_sha256 = if let Some(handle) = encrypted_digest {
        Some(handle.encrypted_sha256().map_err(|error| {
            upload_error(
                "uploading-uncertain",
                &format!("读取密文摘要失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?)
    } else {
        let current = hash_file(&args.file).map_err(|error| {
            upload_error(
                "uploading-uncertain",
                &format!("复核上传文件失败: {error}"),
                Some(attachment_id),
                None,
            )
        })?;
        if current != digest {
            return Err(upload_error(
                "uploading-uncertain",
                "文件在上传期间发生变化",
                Some(attachment_id),
                None,
            ));
        }
        None
    };
    let completed = client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &attachment_id.to_string(),
                "uploaded",
            ],
            &CompleteAttachmentUploadRequest {
                encrypted_sha256: encrypted_sha256.clone(),
            },
        )
        .await
        .map_err(|error| {
            let uncertain = confirmation_result_uncertain(&error);
            upload_error(
                if uncertain {
                    "confirming-uncertain"
                } else {
                    "confirming-rejected"
                },
                &error.to_string(),
                uncertain.then_some(attachment_id),
                if uncertain {
                    encrypted_sha256.clone()
                } else {
                    None
                },
            )
        })?;
    if completed
        .get("data")
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        != Some("uploaded")
    {
        return Err(upload_error(
            "confirming-uncertain",
            "完成响应未确认 status=uploaded；请先读取附件状态，不要重新上传",
            Some(attachment_id),
            encrypted_sha256,
        ));
    }
    Ok(completed)
}

fn confirmation_result_uncertain(error: &AgentError) -> bool {
    match error {
        AgentError::Http { status, .. } => !(400..500).contains(status),
        _ => true,
    }
}

fn ensure_cli_upload_size(byte_size: u64) -> Result<(), AgentError> {
    if byte_size > crate::transfer::MAX_TRANSFER_BYTES as u64 {
        return Err(upload_error(
            "local-validation",
            "CLI 附件上传上限为 128 MiB；未创建远端附件",
            None,
            None,
        ));
    }
    Ok(())
}

fn infer_content_type(filename: &str) -> Option<&'static str> {
    match filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
    {
        Some(extension) if extension == "svg" => Some("image/svg+xml"),
        Some(extension) if extension == "png" => Some("image/png"),
        Some(extension) if extension == "jpg" || extension == "jpeg" => Some("image/jpeg"),
        Some(extension) if extension == "gif" => Some("image/gif"),
        Some(extension) if extension == "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn upload_error(
    stage: &'static str,
    message: &str,
    attachment_id: Option<i64>,
    encrypted_sha256: Option<String>,
) -> AgentError {
    AgentError::Upload {
        stage,
        code: "upload_failed",
        message: message.to_string(),
        attachment_id,
        encrypted_sha256,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confirmation_redirects_are_uncertain_but_client_errors_are_rejections() {
        let http_error = |status| AgentError::Http {
            status,
            code: "test".to_string(),
            message: "test".to_string(),
        };
        assert!(confirmation_result_uncertain(&http_error(302)));
        assert!(!confirmation_result_uncertain(&http_error(400)));
        assert!(!confirmation_result_uncertain(&http_error(409)));
        assert!(confirmation_result_uncertain(&http_error(500)));
    }

    #[test]
    fn upload_size_is_validated_against_hashed_size() {
        assert!(ensure_cli_upload_size(crate::transfer::MAX_TRANSFER_BYTES as u64).is_ok());
        assert!(ensure_cli_upload_size(crate::transfer::MAX_TRANSFER_BYTES as u64 + 1).is_err());
    }
}

async fn list_attachments(
    client: &ApiClient,
    args: ResourceAttachmentAccessArgs,
) -> Result<Value, AgentError> {
    let access = access_query(&args)?;
    let query_refs = access
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();
    client
        .get_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
            ],
            &query_refs,
        )
        .await
}

async fn create_attachment(
    client: &ApiClient,
    args: ResourceAttachmentCreateArgs,
) -> Result<Value, AgentError> {
    require_non_empty(&args.original_filename, "文件名")?;
    require_non_empty(&args.content_type, "媒体类型")?;
    if args.byte_size < 0 {
        return Err(AgentError::Config {
            code: "invalid_byte_size",
            message: "文件大小不能小于 0".to_string(),
        });
    }
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
            ],
            &CreateAttachmentRequest {
                original_filename: args.original_filename,
                content_type: args.content_type,
                byte_size: args.byte_size,
                checksum_sha256: args.checksum_sha256,
            },
        )
        .await
}

async fn signed_url(
    client: &ApiClient,
    args: ResourceAttachmentAccessArgs,
    action: &str,
) -> Result<Value, AgentError> {
    let attachment_id = args.attachment_id.ok_or_else(|| AgentError::Config {
        code: "missing_attachment_id",
        message: "该附件命令必须提供 --attachment-id".to_string(),
    })?;
    let mut query = access_query(&args)?;
    if let Some(value) = args.expires_in_seconds {
        query.push(("expires_in_seconds", value.to_string()));
    }
    let query_refs = query
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();
    client
        .get_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &attachment_id.to_string(),
                action,
            ],
            &query_refs,
        )
        .await
}

async fn upload_url(
    client: &ApiClient,
    args: ResourceAttachmentUploadUrlArgs,
) -> Result<Value, AgentError> {
    signed_url(
        client,
        ResourceAttachmentAccessArgs {
            project_key: args.project_key,
            resource_id: args.resource_id,
            attachment_id: Some(args.attachment_id),
            access_token_stdin: false,
            expires_in_seconds: args.expires_in_seconds,
        },
        "upload-url",
    )
    .await
}

async fn complete_attachment(
    client: &ApiClient,
    args: ResourceAttachmentCompleteArgs,
) -> Result<Value, AgentError> {
    client
        .post_segments(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &args.attachment_id.to_string(),
                "uploaded",
            ],
            &CompleteAttachmentUploadRequest {
                encrypted_sha256: args.encrypted_sha256,
            },
        )
        .await
}

async fn delete_attachment(
    client: &ApiClient,
    args: ResourceAttachmentDeleteArgs,
) -> Result<Value, AgentError> {
    require_non_empty(&args.if_match, "If-Match")?;
    client
        .delete_segments_with_if_match(
            &[
                "api",
                "v1",
                "projects",
                &args.project_key,
                "resources",
                &args.resource_id.to_string(),
                "attachments",
                &args.attachment_id.to_string(),
            ],
            &args.if_match,
        )
        .await
}

fn access_query(
    args: &ResourceAttachmentAccessArgs,
) -> Result<Vec<(&'static str, String)>, AgentError> {
    if !args.access_token_stdin {
        return Ok(Vec::new());
    }
    Ok(vec![("access", read_secret_stdin("资料访问凭证")?)])
}
