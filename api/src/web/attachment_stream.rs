//! 附件按块流式读取（体检 P0-5 / FR-011）。
//!
//! 下载与预览不再把整个文件读入内存：按分组从对象存储读取一段密文（或明文），
//! 加密附件在阻塞线程池中逐块解密后立即写出。单个请求的缓冲上限约为
//! `STREAM_GROUP_CHUNKS * FILE_CHUNK_SIZE` 的两倍（读取中的一组 + 解密结果），与文件大小无关。

use std::sync::Arc;

use axum::body::{Body, Bytes};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

use crate::{
    domains::{files, storage},
    platform::{
        config::Settings,
        error::{AppError, AppResult},
        file_crypto::{self, FileEncryptionHeader},
    },
    web::router::AppState,
};

/// 每次从对象存储读取的分块数（每块 1MiB）。
const STREAM_GROUP_CHUNKS: u32 = 4;
/// 明文（未加密）对象每次读取的字节数。
const PLAIN_READ_BYTES: u64 = STREAM_GROUP_CHUNKS as u64 * file_crypto::FILE_CHUNK_SIZE as u64;

/// 已解析好头部、可按块读取的加密附件。
pub struct EncryptedAttachmentSource {
    pool: SqlitePool,
    settings: Settings,
    object_key: String,
    file_object_id: i64,
    data_key: [u8; 32],
    header: Arc<FileEncryptionHeader>,
    header_len: usize,
}

impl EncryptedAttachmentSource {
    pub async fn open(
        state: &AppState,
        pool: &SqlitePool,
        attachment: &files::FileAttachmentSummary,
        encryption: &files::FileObjectEncryption,
    ) -> AppResult<Self> {
        let data_key = file_crypto::open_data_key(
            &state.settings.file_master_key,
            &encryption.data_key_envelope,
            attachment.object_key.as_bytes(),
        )?;
        let header_len = file_crypto::header_len_for(attachment.byte_size as u64);
        let header_bytes = storage::read_object_range(
            pool,
            &state.settings,
            &attachment.object_key,
            0,
            header_len as u64,
        )
        .await?;
        let header = file_crypto::parse_encryption_header(&header_bytes)?;
        // 响应头中的 Content-Length / Content-Range 按数据库记录的大小计算，与加密头不一致时
        // 在发出响应头前失败，避免声明长度与实际输出不符导致客户端挂起。
        if header.plaintext_byte_size != attachment.byte_size as u64 {
            return Err(AppError::Crypto(
                "附件加密头记录的大小与登记信息不一致".to_string(),
            ));
        }
        Ok(Self {
            pool: pool.clone(),
            settings: state.settings.clone(),
            object_key: attachment.object_key.clone(),
            file_object_id: attachment.file_object_id,
            data_key,
            header: Arc::new(header),
            header_len,
        })
    }

    pub fn plaintext_len(&self) -> usize {
        self.header.plaintext_byte_size as usize
    }

    /// 流式输出明文 `[start, end_exclusive)`。
    ///
    /// 完整性主要由分块 AES-GCM 保证（AAD 含文件与块序号，篡改、换序、截断都会解密失败并中断流）。
    /// 完整读取时另外累计整文件 SHA-256 作为兜底；但声明了 Content-Length 时，HTTP 层写满字节后
    /// 可能不再轮询流尾，因此该校验不保证一定执行。
    pub fn into_body(self, start: usize, end_exclusive: usize) -> Body {
        let total = self.plaintext_len();
        let end_exclusive = end_exclusive.min(total);
        if start >= end_exclusive {
            return Body::empty();
        }
        let chunk_size = self.header.chunk_size;
        let first_chunk = (start / chunk_size) as u32;
        let last_chunk_exclusive = ((end_exclusive - 1) / chunk_size) as u32 + 1;
        let verify_full = start == 0 && end_exclusive == total;
        let state = StreamState {
            source: self,
            next_chunk: first_chunk,
            last_chunk_exclusive,
            start,
            end_exclusive,
            hasher: verify_full.then(Sha256::new),
        };
        Body::from_stream(futures::stream::try_unfold(state, next_encrypted_group))
    }
}

struct StreamState {
    source: EncryptedAttachmentSource,
    next_chunk: u32,
    last_chunk_exclusive: u32,
    start: usize,
    end_exclusive: usize,
    hasher: Option<Sha256>,
}

async fn next_encrypted_group(
    mut state: StreamState,
) -> Result<Option<(Bytes, StreamState)>, std::io::Error> {
    if state.next_chunk >= state.last_chunk_exclusive {
        if let Some(hasher) = state.hasher.take()
            && hasher.finalize()[..] != state.source.header.plaintext_sha256[..]
        {
            return Err(stream_error(AppError::Crypto(
                "文件明文校验值不匹配".to_string(),
            )));
        }
        return Ok(None);
    }
    let group_start = state.next_chunk;
    let group_end = (group_start + STREAM_GROUP_CHUNKS).min(state.last_chunk_exclusive);
    let source = &state.source;
    let body_start =
        source.header_len + file_crypto::body_offset_for_chunk(&source.header, group_start);
    let body_len: usize = (group_start..group_end)
        .map(|index| file_crypto::chunk_ciphertext_len(&source.header, index))
        .sum();
    let body = storage::read_object_range(
        &source.pool,
        &source.settings,
        &source.object_key,
        body_start as u64,
        (body_start + body_len) as u64,
    )
    .await
    .map_err(stream_error)?;

    let chunk_size = source.header.chunk_size;
    let plaintext_start = state.start.max(group_start as usize * chunk_size);
    let plaintext_end = state.end_exclusive.min(group_end as usize * chunk_size);
    let data_key = source.data_key;
    let file_object_id = source.file_object_id;
    let header = Arc::clone(&source.header);
    let plaintext = tokio::task::spawn_blocking(move || {
        file_crypto::decrypt_body_range(
            &data_key,
            file_object_id,
            &header,
            &body,
            group_start..group_end,
            plaintext_start..plaintext_end,
        )
    })
    .await
    .map_err(|error| stream_error(AppError::Crypto(format!("附件解密任务失败：{error}"))))?
    .map_err(stream_error)?;

    if let Some(hasher) = state.hasher.as_mut() {
        hasher.update(&plaintext);
    }
    state.next_chunk = group_end;
    Ok(Some((Bytes::from(plaintext), state)))
}

/// 流式输出未加密对象的 `[start, end_exclusive)`。
pub fn plain_object_body(
    pool: &SqlitePool,
    settings: &Settings,
    object_key: &str,
    start: u64,
    end_exclusive: u64,
) -> Body {
    if start >= end_exclusive {
        return Body::empty();
    }
    let state = (
        pool.clone(),
        settings.clone(),
        object_key.to_string(),
        start,
        end_exclusive,
    );
    Body::from_stream(futures::stream::try_unfold(
        state,
        |(pool, settings, object_key, offset, end_exclusive)| async move {
            if offset >= end_exclusive {
                return Ok(None);
            }
            let next = (offset + PLAIN_READ_BYTES).min(end_exclusive);
            let bytes = storage::read_object_range(&pool, &settings, &object_key, offset, next)
                .await
                .map_err(stream_error)?;
            if bytes.is_empty() {
                return Err(stream_error(AppError::BadRequest(
                    "对象存储返回的数据比预期短".to_string(),
                )));
            }
            let read = bytes.len() as u64;
            Ok(Some((
                Bytes::from(bytes),
                (pool, settings, object_key, offset + read, end_exclusive),
            )))
        },
    ))
}

/// 响应头已发出后无法再返回错误状态，只能中断流；完整错误写入日志。
fn stream_error(error: AppError) -> std::io::Error {
    tracing::error!(%error, "attachment stream failed");
    std::io::Error::other("附件读取失败")
}
