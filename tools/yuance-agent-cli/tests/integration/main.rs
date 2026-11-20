//! 集成测试统一入口：合并为单一测试二进制，只链接一次，并在同一进程内并行调度全部用例。
//! 新增会修改进程环境变量或工作目录的测试时，应放到独立测试文件，避免与并行用例互相干扰。

mod api_client;
mod cli_contract;
mod command_flow;
mod file_crypto;
mod openapi_contract;
mod skill_package;
