use clap::ValueEnum;
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, ValueEnum)]
#[serde(rename_all = "snake_case")]
#[value(rename_all = "snake_case")]
pub enum WorkItemType {
    Requirement,
    Task,
    Bug,
}

#[derive(Clone, Copy, Debug, Serialize, ValueEnum)]
#[serde(rename_all = "UPPERCASE")]
#[value(rename_all = "UPPER")]
pub enum Priority {
    P0,
    P1,
    P2,
    P3,
}

#[derive(Clone, Copy, Debug, Serialize, ValueEnum)]
#[serde(rename_all = "snake_case")]
#[value(rename_all = "snake_case")]
pub enum WorkItemStatus {
    Open,
    InProgress,
    PendingConfirmation,
    Done,
    Resolved,
    Verified,
    Closed,
    Cancelled,
}

#[derive(Clone, Copy, Debug, Default, Serialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
#[value(rename_all = "lower")]
pub enum BodyFormat {
    Plain,
    #[default]
    Html,
}

#[derive(Debug, Serialize)]
pub struct CreateWorkItemRequest {
    pub project_key: String,
    pub item_type: WorkItemType,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_item_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateWorkItemRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_item_key: Option<String>,
}

impl UpdateWorkItemRequest {
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.priority.is_none()
            && self.due_date.is_none()
            && self.parent_item_key.is_none()
    }
}

#[derive(Debug, Serialize)]
pub struct HandoffWorkItemRequest {
    pub status: WorkItemStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_comment_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CreateCommentRequest {
    pub body: String,
    pub body_format: BodyFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_comment_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct UnlockProjectResourceRequest {
    pub access_password: String,
}

#[derive(Debug, Serialize)]
pub struct CreateProjectResourceRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_work_item_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_cycle_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct UpdateProjectResourceRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_password_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_work_item_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_cycle_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CreateAttachmentRequest {
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checksum_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompleteAttachmentUploadRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentSignedUrlEnvelope {
    pub data: AttachmentSignedUrlPayload,
}

#[derive(Deserialize)]
pub struct AttachmentSignedUrlPayload {
    pub attachment: AttachmentPayload,
    pub request: SignedObjectRequest,
    pub expires_in_seconds: u64,
    pub expires_at: String,
    pub checksum_sha256: String,
    pub encryption: Option<AttachmentEncryptionPayload>,
}

impl std::fmt::Debug for AttachmentSignedUrlPayload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AttachmentSignedUrlPayload")
            .field("attachment", &self.attachment)
            .field("request", &"[REDACTED]")
            .field("expires_in_seconds", &self.expires_in_seconds)
            .field("expires_at", &self.expires_at)
            .field("checksum_sha256", &self.checksum_sha256)
            .field("encryption", &self.encryption)
            .finish()
    }
}

#[derive(Debug, Deserialize)]
pub struct AttachmentPayload {
    pub id: i64,
    pub file_object_id: i64,
    pub filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub status: String,
}

#[derive(Deserialize)]
pub struct SignedObjectRequest {
    pub method: String,
    pub url: String,
    #[serde(default, deserialize_with = "deserialize_signed_headers")]
    pub headers: BTreeMap<String, String>,
}

#[derive(Deserialize)]
pub struct AttachmentEncryptionPayload {
    pub algorithm: String,
    pub format: String,
    pub chunk_size: i64,
    pub key: String,
    pub file_object_id: i64,
    pub plaintext_byte_size: i64,
    pub plaintext_sha256: String,
    pub encrypted_byte_size: i64,
    pub encrypted_checksum_sha256: String,
}

impl std::fmt::Debug for AttachmentEncryptionPayload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AttachmentEncryptionPayload")
            .field("algorithm", &self.algorithm)
            .field("format", &self.format)
            .field("chunk_size", &self.chunk_size)
            .field("key", &"[REDACTED]")
            .field("file_object_id", &self.file_object_id)
            .field("plaintext_byte_size", &self.plaintext_byte_size)
            .field("plaintext_sha256", &self.plaintext_sha256)
            .field("encrypted_byte_size", &self.encrypted_byte_size)
            .field("encrypted_checksum_sha256", &self.encrypted_checksum_sha256)
            .finish()
    }
}

fn deserialize_signed_headers<'de, D>(deserializer: D) -> Result<BTreeMap<String, String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum HeaderShape {
        Map(BTreeMap<String, String>),
        Pairs(Vec<(String, String)>),
    }

    Ok(match Option::<HeaderShape>::deserialize(deserializer)? {
        None => BTreeMap::new(),
        Some(HeaderShape::Map(headers)) => headers,
        Some(HeaderShape::Pairs(headers)) => headers.into_iter().collect(),
    })
}

#[derive(Debug, Deserialize)]
pub struct ApiErrorEnvelope {
    pub error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
pub struct ApiErrorBody {
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorEnvelope<'a> {
    pub error: ErrorBody<'a>,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody<'a> {
    pub kind: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    pub code: &'a str,
    pub message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_sha256: Option<&'a str>,
}
