use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

use crate::models::{BodyFormat, Priority, WorkItemStatus, WorkItemType};

#[derive(Debug, Parser)]
#[command(
    name = "yuance-agent",
    version,
    about = "通过元策 OpenAPI 操作项目工作项",
    propagate_version = true
)]
pub struct Cli {
    /// 缩进输出 JSON，便于人工阅读。
    #[arg(long, global = true)]
    pub pretty: bool,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// 查询当前 Token 对应的用户。
    Whoami,
    /// 检查 CLI 安装、配置和元策连接。
    Doctor {
        /// 只检查本地安装，不读取 Token 或访问网络。
        #[arg(long)]
        installation: bool,
    },
    /// 查询项目。
    Projects {
        #[command(subcommand)]
        command: ProjectsCommand,
    },
    /// 查询或操作需求、任务和 Bug。
    WorkItems {
        #[command(subcommand)]
        command: WorkItemsCommand,
    },
    /// 查询或发表工作项评论。
    Comments {
        #[command(subcommand)]
        command: CommentsCommand,
    },
    /// 查询和维护项目资料及其附件登记。
    Resources {
        #[command(subcommand)]
        command: ResourcesCommand,
    },
    /// 查询当前 Token 用户范围内的通知。
    Notifications {
        #[command(subcommand)]
        command: NotificationsCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum ResourcesCommand {
    List(ResourcesListArgs),
    Get {
        #[arg(long)]
        project_key: String,
        #[arg(long)]
        resource_id: i64,
    },
    Unlock(ResourcesUnlockArgs),
    Update(ResourcesUpdateArgs),
    Attachments {
        #[command(subcommand)]
        command: ResourceAttachmentsCommand,
    },
}

#[derive(Debug, Args)]
pub struct ResourcesListArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub q: Option<String>,
    #[arg(long)]
    pub category: Option<String>,
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long)]
    pub tag: Option<String>,
    #[arg(long)]
    pub related_work_item_key: Option<String>,
    #[arg(long)]
    pub related_cycle_id: Option<i64>,
}

#[derive(Debug, Args)]
pub struct ResourcesUnlockArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
}

#[derive(Debug, Args)]
pub struct ResourcesUpdateArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long)]
    pub category: Option<String>,
    #[arg(long, value_name = "PATH")]
    pub body_file: Option<PathBuf>,
    #[arg(long)]
    pub body_format: Option<String>,
    #[arg(long)]
    pub access_password_action: Option<String>,
    #[arg(long)]
    #[arg(long, conflicts_with = "body_file")]
    pub access_password_stdin: bool,
    #[arg(long)]
    pub tags: Option<Vec<String>>,
    #[arg(long)]
    pub related_work_item_key: Option<String>,
    #[arg(long)]
    pub related_cycle_id: Option<i64>,
}

#[derive(Debug, Subcommand)]
pub enum ResourceAttachmentsCommand {
    List(ResourceAttachmentAccessArgs),
    Create(ResourceAttachmentCreateArgs),
    UploadUrl(ResourceAttachmentAccessArgs),
    Complete(ResourceAttachmentCompleteArgs),
    DownloadUrl(ResourceAttachmentAccessArgs),
    Delete(ResourceAttachmentDeleteArgs),
}

#[derive(Debug, Args)]
pub struct ResourceAttachmentAccessArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
    #[arg(long)]
    pub attachment_id: Option<i64>,
    #[arg(long)]
    pub access_token_stdin: bool,
    #[arg(long)]
    pub expires_in_seconds: Option<u64>,
}

#[derive(Debug, Args)]
pub struct ResourceAttachmentCreateArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
    #[arg(long)]
    pub original_filename: String,
    #[arg(long)]
    pub content_type: String,
    #[arg(long)]
    pub byte_size: i64,
    #[arg(long)]
    pub checksum_sha256: Option<String>,
}

#[derive(Debug, Args)]
pub struct ResourceAttachmentCompleteArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
    #[arg(long)]
    pub attachment_id: i64,
    #[arg(long)]
    pub encrypted_sha256: Option<String>,
}

#[derive(Debug, Args)]
pub struct ResourceAttachmentDeleteArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub resource_id: i64,
    #[arg(long)]
    pub attachment_id: i64,
    #[arg(long)]
    pub if_match: String,
}

#[derive(Debug, Subcommand)]
pub enum NotificationsCommand {
    List(NotificationsListArgs),
}

#[derive(Debug, Args)]
pub struct NotificationsListArgs {
    #[arg(long)]
    pub filter: Option<String>,
    #[arg(long)]
    pub limit: Option<u32>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..))]
    pub page: Option<u32>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..=100))]
    pub per_page: Option<u32>,
}

#[derive(Debug, Subcommand)]
pub enum ProjectsCommand {
    /// 列出当前 Token 可见的项目。
    List(ProjectsListArgs),
    /// 获取项目详情。
    Get { project_key: String },
}

#[derive(Debug, Args)]
pub struct ProjectsListArgs {
    #[arg(long)]
    pub status: Option<String>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..))]
    pub page: Option<u32>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..=100))]
    pub per_page: Option<u32>,
}

#[derive(Debug, Subcommand)]
pub enum WorkItemsCommand {
    /// 按显式条件列出工作项。
    List(WorkItemsListArgs),
    /// 获取工作项详情。
    Get { item_key: String },
    /// 创建需求、任务或 Bug。
    Create(CreateWorkItemArgs),
    /// 更新工作项元数据；流转和指派请使用 handoff。
    Update(UpdateWorkItemArgs),
    /// 按服务端状态机流转并可同时指派工作项。
    Handoff(HandoffWorkItemArgs),
}

#[derive(Debug, Args)]
pub struct WorkItemsListArgs {
    #[arg(long)]
    pub item_type: Option<WorkItemType>,
    #[arg(long)]
    pub project_key: Option<String>,
    #[arg(long)]
    pub q: Option<String>,
    #[arg(long)]
    pub status: Option<WorkItemStatus>,
    #[arg(long)]
    pub priority: Option<Priority>,
    #[arg(long)]
    pub assignee_username: Option<String>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..))]
    pub page: Option<u32>,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..=100))]
    pub per_page: Option<u32>,
}

#[derive(Debug, Args)]
pub struct CreateWorkItemArgs {
    #[arg(long)]
    pub project_key: String,
    #[arg(long)]
    pub item_type: WorkItemType,
    #[arg(long)]
    pub title: String,
    #[arg(long, conflicts_with = "description_file")]
    pub description: Option<String>,
    /// 从文件读取描述；使用 - 从 stdin 读取。
    #[arg(long, value_name = "PATH", conflicts_with = "description")]
    pub description_file: Option<PathBuf>,
    #[arg(long)]
    pub priority: Option<Priority>,
    #[arg(long)]
    pub assignee_username: Option<String>,
    #[arg(long)]
    pub due_date: Option<String>,
    #[arg(long)]
    pub parent_item_key: Option<String>,
}

#[derive(Debug, Args)]
pub struct UpdateWorkItemArgs {
    pub item_key: String,
    #[arg(long)]
    pub title: Option<String>,
    #[arg(long, conflicts_with = "description_file")]
    pub description: Option<String>,
    /// 从文件读取描述；使用 - 从 stdin 读取。
    #[arg(long, value_name = "PATH", conflicts_with = "description")]
    pub description_file: Option<PathBuf>,
    #[arg(long)]
    pub priority: Option<Priority>,
    #[arg(long)]
    pub due_date: Option<String>,
    #[arg(long)]
    pub parent_item_key: Option<String>,
}

#[derive(Debug, Args)]
pub struct HandoffWorkItemArgs {
    pub item_key: String,
    #[arg(long)]
    pub status: WorkItemStatus,
    #[arg(long)]
    pub assignee_username: Option<String>,
    #[arg(long, conflicts_with = "body_file")]
    pub body: Option<String>,
    /// 从文件读取流转说明；使用 - 从 stdin 读取。
    #[arg(long, value_name = "PATH", conflicts_with = "body")]
    pub body_file: Option<PathBuf>,
    #[arg(long)]
    pub source_comment_id: Option<i64>,
}

#[derive(Debug, Subcommand)]
pub enum CommentsCommand {
    /// 列出工作项评论。
    List { item_key: String },
    /// 发表顶层评论或回复评论。
    Create(CreateCommentArgs),
}

#[derive(Debug, Args)]
pub struct CreateCommentArgs {
    pub item_key: String,
    #[arg(
        long,
        required_unless_present = "body_file",
        conflicts_with = "body_file"
    )]
    pub body: Option<String>,
    /// 从文件读取评论；使用 - 从 stdin 读取。
    #[arg(
        long,
        value_name = "PATH",
        required_unless_present = "body",
        conflicts_with = "body"
    )]
    pub body_file: Option<PathBuf>,
    #[arg(long, default_value = "html")]
    pub body_format: BodyFormat,
    #[arg(long)]
    pub parent_comment_id: Option<i64>,
}
