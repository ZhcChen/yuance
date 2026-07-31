use clap::{Parser, Subcommand};

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
}
