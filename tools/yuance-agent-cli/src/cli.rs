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
