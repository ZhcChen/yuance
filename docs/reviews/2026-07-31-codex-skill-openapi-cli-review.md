# Codex Skill 与 OpenAPI CLI 交付复核

日期：2026-07-31

## 结论

Rust CLI、Codex Skill、安装器、MCP 迁移和六平台 Release 已形成可回放闭环。`yuance-agent-v0.1.0` 已正式发布，六个平台资产、`SHA256SUMS`、GitHub artifact attestation 和固定版本真实安装均验证通过。

当前结论为**有条件通过**。代码与发布链路没有已知阻断缺陷，但以下两项需要外部凭证才能完成，不能以模拟结果替代：

- 当前环境没有受限测试 `YUANCE_API_TOKEN`，尚未对正式服务执行项目查询和工作项写入闭环。
- 独立 `codex exec` 会话因本机 Codex 凭证返回 `401 invalid_api_key`，尚未完成全新会话中的 Skill 触发和误触发验证。

## Release 证据

- Release：<https://github.com/ZhcChen/yuance/releases/tag/yuance-agent-v0.1.0>
- 成功工作流：<https://github.com/ZhcChen/yuance/actions/runs/30606563801>
- 标签提交：`d63e7e07fedddfce1c391dfb8aee3b91032c2f6e`
- 发布时间：`2026-07-31T05:27:30Z`
- Release 状态：非草稿、非 prerelease。

发布资产共七个：

```text
SHA256SUMS
yuance-agent-v0.1.0-aarch64-apple-darwin.tar.gz
yuance-agent-v0.1.0-x86_64-apple-darwin.tar.gz
yuance-agent-v0.1.0-aarch64-unknown-linux-musl.tar.gz
yuance-agent-v0.1.0-x86_64-unknown-linux-musl.tar.gz
yuance-agent-v0.1.0-aarch64-pc-windows-msvc.zip
yuance-agent-v0.1.0-x86_64-pc-windows-msvc.zip
```

发布后重新下载全部资产并执行了以下验证：

- `shasum -a 256 -c SHA256SUMS`：六个压缩包全部通过。
- `scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.0 <assets-dir>`：六个平台目录结构、可执行文件和 Skill 源文件一致性通过。
- `gh attestation verify <archive> --repo ZhcChen/yuance`：六个压缩包全部通过 provenance 验证。
- macOS ARM64 使用固定标签 Raw 安装脚本真实安装，`doctor --installation` 返回 `version=0.1.0`、`target=aarch64-macos`。
- 未配置 Token 时执行 `projects list` 返回退出码 `2`，结构化错误码为 `missing_api_token`。

## CI 与本地门禁

通过：

```text
cargo fmt -p yuance-agent -- --check
cargo clippy -p yuance-agent --all-targets -- -D warnings
cargo test -p yuance-agent
cargo test -p yuance-api --test routing_smoke
bash scripts/test-install-codex-skill.sh
scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.0
git diff --check
rg -n "mcp/yuance-mcp|MCP 初始化|yuance_list_" --glob '!docs/plans/**' .
```

Windows CI 的 `PowerShell installer quality` 已通过首次安装、升级、校验失败和回滚测试。六个平台 build job 均完成编译、`--version`、包布局验证和 artifact 上传；Windows ARM64 也在原生 runner 上通过运行验证。

计划中的 `cargo fmt --all -- --check` 仍会报告本功能开始前已存在的 API 格式差异。为避免大范围无关格式 churn，本次没有执行 `cargo fmt --all` 写入；CLI 自身的格式门禁在本地和 CI 均通过。

## 需求覆盖

| 范围 | 证据 | 结果 |
|---|---|---|
| R1、R6 | 自包含 Skill 包、行为 references、安装后离线自检和 Skill package tests | 通过 |
| R2-R5 | CLI 命令流、HTTP client、错误映射、OpenAPI 契约测试 | 通过 |
| R7-R10 | Bash/PowerShell 安装器、六平台 workflow、Release 资产与 attestation | 通过 |
| R11-R12 | MCP 实现与现行文档删除、迁移 runbook、历史计划排除扫描 | 通过 |
| AE1-AE3、AE5-AE8 的可自动化部分 | 安装器测试、CI、真实 Release 安装、结构化缺 Token 错误 | 通过 |
| AE4 与受限 PAT 验收 | 正式服务读写需要测试 PAT | 阻塞 |
| 全新 Codex 会话行为门禁 | 子会话认证失败，未获得模型响应 | 阻塞 |

## 失败与修复记录

首次标签运行 <https://github.com/ZhcChen/yuance/actions/runs/30606201605> 在聚合阶段发现 Windows checkout 将 `SKILL.md` 转为 CRLF，导致 Windows 包与标签源码字节不一致。没有放宽校验，而是在 `d63e7e0` 增加 `.gitattributes`，将发布包文本固定为 LF。标签在 Release 尚未创建时从 `0e16a73` 更新到 `d63e7e0`，重跑后六平台严格一致性校验通过。

独立 Codex review 两次尝试均因本机 Codex 凭证 `401 invalid_api_key` 中断，没有将该尝试计为独立复核证据。本轮由当前会话完成安装安全、凭证处理、API 契约、删除范围和发布流程复核，独立性覆盖仍是残余风险。

## 剩余验收步骤

1. 提供只读、写入和已撤销三类测试 PAT，在测试项目回放查询、创建、详情、评论、回复、更新和 handoff，并验证 `401`、`403` 不重试。
2. 修复本机 Codex 登录凭证，在仓库外临时项目启动全新会话，验证直接触发、隐式触发、缺参阻塞、普通代码任务误触发控制和不支持能力边界。

上述步骤完成前，不将 U7 和计划 Definition of Done 标记为完全完成。

## 清理确认

发布资产、安装目录和失败尝试均位于系统临时目录并已移入 Trash；仓库未新增二进制、`target/` 或下载资产。长期未跟踪的 `web/` 不属于本计划，未读取、修改或提交。
