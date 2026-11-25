//! 附件公共流程：各目标（项目、工作项、评论、新建草稿、项目资料）的处理函数负责各自的授权，
//! 授权通过后的对象校验、上传登记与审计在这里统一实现，避免五处重复且行为漂移。

use super::*;

/// 附件所属目标：`kind` / `id` 对应附件表中的目标；审计字段保持各目标原有的记录口径。
pub(super) struct AttachmentTarget<'a> {
    pub kind: &'a str,
    pub id: i64,
    pub audit_target_type: &'a str,
    pub audit_target_id: String,
    pub audit_metadata: String,
}

/// 上传完成时的附加校验：资料附件支持客户端加密（需提交密文摘要）并校验 SVG 内容。
pub(super) struct UploadCompletionOptions<'a> {
    pub request_body: Option<&'a Bytes>,
    pub validate_svg: bool,
}

impl UploadCompletionOptions<'_> {
    pub const PLAIN: UploadCompletionOptions<'static> = UploadCompletionOptions {
        request_body: None,
        validate_svg: false,
    };
}

/// 校验对象存储中的实际对象（大小、类型、摘要），登记上传完成并写审计。
pub(super) async fn complete_attachment_upload(
    state: &AppState,
    pool: &SqlitePool,
    actor_user_id: i64,
    attachment: files::FileAttachmentSummary,
    target: AttachmentTarget<'_>,
    options: UploadCompletionOptions<'_>,
) -> AppResult<files::FileAttachmentSummary> {
    let attachment_id = attachment.id;
    let encrypted = match options.request_body {
        Some(_) => files::get_file_object_encryption(pool, attachment.file_object_id)
            .await?
            .is_some(),
        None => false,
    };
    let completed = if encrypted {
        let encrypted_checksum_sha256 =
            parse_mark_uploaded_request(options.request_body.unwrap_or(&Bytes::new()))?
                .and_then(|request| request.encrypted_sha256)
                .ok_or_else(|| {
                    AppError::BadRequest("加密附件上传完成登记缺少密文 SHA-256".to_string())
                })?;
        let encrypted_byte_size = i64::try_from(file_crypto::encrypted_total_size(
            attachment.byte_size as u64,
        ))
        .map_err(|_| AppError::BadRequest("加密文件大小超出系统支持范围".to_string()))?;
        let actual_checksum_sha256 = storage::verify_uploaded_object(
            pool,
            &state.settings,
            &attachment.object_key,
            encrypted_byte_size,
            "application/octet-stream",
        )
        .await?;
        if actual_checksum_sha256 != encrypted_checksum_sha256 {
            return Err(AppError::BadRequest(
                "上传对象 SHA-256 与提交的密文摘要不一致".to_string(),
            ));
        }
        if options.validate_svg {
            validate_svg_attachment_content(state, pool, &attachment).await?;
        }
        files::mark_attachment_uploaded_encrypted(
            pool,
            attachment_id,
            target.kind,
            target.id,
            encrypted_byte_size,
            &actual_checksum_sha256,
        )
        .await?
    } else {
        let actual_checksum_sha256 = storage::verify_uploaded_object(
            pool,
            &state.settings,
            &attachment.object_key,
            attachment.byte_size,
            &attachment.content_type,
        )
        .await?;
        if options.validate_svg {
            validate_svg_attachment_content(state, pool, &attachment).await?;
        }
        files::mark_attachment_uploaded_with_checksum(
            pool,
            attachment_id,
            target.kind,
            target.id,
            &actual_checksum_sha256,
        )
        .await?
    };
    audit::record(
        pool,
        Some(actor_user_id),
        "file.upload.completed",
        target.audit_target_type,
        &target.audit_target_id,
        &target.audit_metadata,
    )
    .await?;

    Ok(completed)
}
