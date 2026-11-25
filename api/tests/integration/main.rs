//! 集成测试统一入口：合并为单一测试二进制，只链接一次，并在同一进程内并行调度全部用例。
//!
//! 各模块保持原文件内容与私有辅助函数，按模块隔离命名。会修改进程环境变量
//! （如 `YUANCE_WEB_DIST_DIR`）的测试不得放入本二进制，应保留为独立测试文件
//! （见 `tests/bootstrap_flow.rs`、`tests/routing_smoke.rs`），避免与并行用例互相干扰。

mod attachment_stream_flow;
mod audit_flow;
mod auth_csrf_refresh_flow;
mod auth_security_flow;
mod cli_files_flow;
mod cli_migrate_flow;
mod cli_seed_flow;
mod comment_attachments_batch_flow;
mod concurrency_flow;
mod observability_flow;
mod permission_boundaries_flow;
mod project_management_flow;
mod query_plan_flow;
mod rate_limit_flow;
mod resource_contract;
mod storage_config_flow;
mod support;
mod system_management_flow;
mod web_app_shell_flow;
mod work_item_draft_attachments_flow;
