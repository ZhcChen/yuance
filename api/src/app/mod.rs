pub mod migrate;
pub mod seed;
pub mod serve;

use clap::{Args, Parser, Subcommand};

use crate::platform::{config::Settings, error::AppResult};

#[derive(Debug, Parser)]
#[command(name = "yuance-api")]
#[command(about = "元策 API 服务", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// 启动 HTTP 服务。
    Serve(ServeArgs),
    /// 管理 SQLite 迁移。
    Migrate {
        #[command(subcommand)]
        command: MigrateCommand,
    },
    /// 写入基础或开发测试数据。
    Seed {
        #[command(subcommand)]
        command: SeedCommand,
    },
}

#[derive(Debug, Args)]
pub struct ServeArgs {
    /// HTTP 监听地址，默认 127.0.0.1:33033。
    #[arg(long, env = "YUANCE_HTTP_ADDR")]
    pub http_addr: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum MigrateCommand {
    /// 查看迁移状态。
    Status,
    /// 执行全部待执行迁移。
    Up,
    /// 执行到指定迁移版本。
    UpTo { version: i64 },
    /// 创建新迁移文件占位。
    Create { name: String },
}

#[derive(Debug, Subcommand)]
pub enum SeedCommand {
    /// 写入正式环境可用的基础权限和系统数据。
    Core,
    /// 写入本地演示数据，仅限开发 / 测试环境。
    Demo,
    /// 创建开发测试固定超级管理员，仅限 development / test / local。
    LocalAdmin,
}

pub async fn run_cli() -> AppResult<()> {
    Settings::load_dotenv();

    let cli = Cli::parse();
    match cli
        .command
        .unwrap_or(Command::Serve(ServeArgs { http_addr: None }))
    {
        Command::Serve(args) => serve::run(args).await,
        Command::Migrate { command } => migrate::run(command).await,
        Command::Seed { command } => seed::run(command).await,
    }
}
