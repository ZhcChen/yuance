# Codex Skill 与 OpenAPI CLI 交付复核

日期：2026-07-31

## 结论

Rust CLI、Codex Skill、安装器、MCP 迁移和六平台 Release 已形成可回放闭环。当前修复版 `yuance-agent-v0.1.1` 已正式发布，默认安装目录已从错误的 `~/.agents/skills` 修正为 Codex 实际使用的 `~/.codex/skills`；六个平台资产、`SHA256SUMS`、GitHub artifact attestation 和固定版本真实安装均验证通过。

当前结论为**通过**。代码、发布链路、受限 PAT 读写闭环和全新 Codex 会话行为门禁均已完成，没有已知阻断缺陷。

## Release 证据

- Release：<https://github.com/ZhcChen/yuance/releases/tag/yuance-agent-v0.1.1>
- 成功工作流：<https://github.com/ZhcChen/yuance/actions/runs/30608039449>
- 标签提交：`828f3344e7567897c977a4cc3b19878fe00e5d10`
- 发布时间：`2026-07-31T06:00:19Z`
- Release 状态：非草稿、非 prerelease。

发布资产共七个：

```text
SHA256SUMS
yuance-agent-v0.1.1-aarch64-apple-darwin.tar.gz
yuance-agent-v0.1.1-x86_64-apple-darwin.tar.gz
yuance-agent-v0.1.1-aarch64-unknown-linux-musl.tar.gz
yuance-agent-v0.1.1-x86_64-unknown-linux-musl.tar.gz
yuance-agent-v0.1.1-aarch64-pc-windows-msvc.zip
yuance-agent-v0.1.1-x86_64-pc-windows-msvc.zip
```

发布后重新下载全部资产并执行了以下验证：

- `shasum -a 256 -c SHA256SUMS`：六个压缩包全部通过。
- `scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.1 <assets-dir>`：六个平台目录结构、可执行文件和 Skill 源文件一致性通过。
- `gh attestation verify <archive> --repo ZhcChen/yuance`：六个压缩包全部通过 provenance 验证。
- macOS ARM64 使用固定标签 Raw 安装脚本安装到隔离 `CODEX_HOME`，文件位于 `skills/yuance-agent`，`doctor --installation` 返回 `version=0.1.1`、`target=aarch64-macos`。
- 未配置 Token 时执行 `projects list` 返回退出码 `2`，结构化错误码为 `missing_api_token`。

## CI 与本地门禁

通过：

```text
cargo fmt -p yuance-agent -- --check
cargo clippy -p yuance-agent --all-targets -- -D warnings
cargo test -p yuance-agent
cargo test -p yuance-api --test routing_smoke
bash scripts/test-install-codex-skill.sh
bash scripts/test-yuance-agent-real-api.sh
scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.1 <assets-dir>
git diff --check
旧 MCP 实现路径、初始化标题和工具名前缀扫描（排除 docs/plans/**，预期无匹配）
```

Windows CI 的 `PowerShell installer quality` 已通过首次安装、升级、校验失败和回滚测试。六个平台 build job 均完成编译、`--version`、包布局验证和 artifact 上传；Windows ARM64 也在原生 runner 上通过运行验证。

`scripts/test-yuance-agent-real-api.sh` 构建并启动真实 `yuance-api` 与 `yuance-agent` 二进制，使用临时文件 SQLite 和三个仅限单项目的 PAT，完成以下运行验证：

- Token 只能列出授权项目，跨项目写入返回结构化 `403`。
- 项目查询、Bug 创建、详情读取、评论、回复、元数据更新和 handoff 全部成功。
- 只读 Token 写入返回退出码 `11` 和结构化 `403`。
- 删除 Token 后查询返回退出码 `10` 和结构化 `401`。

计划中的 `cargo fmt --all -- --check` 仍会报告本功能开始前已存在的 API 格式差异。为避免大范围无关格式 churn，本次没有执行 `cargo fmt --all` 写入；CLI 自身的格式门禁在本地和 CI 均通过。

## 需求覆盖

| 范围 | 证据 | 结果 |
|---|---|---|
| R1、R6 | 自包含 Skill 包、行为 references、安装后离线自检和 Skill package tests | 通过 |
| R2-R5 | CLI 命令流、HTTP client、错误映射、OpenAPI 契约测试 | 通过 |
| R7-R10 | Bash/PowerShell 安装器、六平台 workflow、Release 资产与 attestation | 通过 |
| R11-R12 | MCP 实现与现行文档删除、迁移 runbook、历史计划排除扫描 | 通过 |
| AE1-AE3、AE5-AE8 的可自动化部分 | 安装器测试、CI、真实 Release 安装、结构化缺 Token 错误 | 通过 |
| AE4 与受限 PAT 验收 | 真实 API/CLI 二进制、单项目 PAT、完整读写与 401/403 回放 | 通过 |
| 全新 Codex 会话行为门禁 | 显式触发、隐式触发、缺参阻塞、普通任务误触发控制和不支持能力边界 | 通过 |

## 失败与修复记录

首次标签运行 <https://github.com/ZhcChen/yuance/actions/runs/30606201605> 在聚合阶段发现 Windows checkout 将 `SKILL.md` 转为 CRLF，导致 Windows 包与标签源码字节不一致。没有放宽校验，而是在 `d63e7e0` 增加 `.gitattributes`，将发布包文本固定为 LF。标签在 Release 尚未创建时从 `0e16a73` 更新到 `d63e7e0`，重跑后六平台严格一致性校验通过。

`v0.1.0` 首版安装器把未设置 `CODEX_HOME` 的默认目录误写为 `~/.agents/skills/yuance-agent`，当前 Codex 无法从该位置发现 Skill。`828f334` 将 Bash、PowerShell、在线页面和 runbook 统一修正为 `~/.codex/skills/yuance-agent`，并发布 `v0.1.1`；`dec51b2` 进一步为 PowerShell 增加默认目录和旧目录禁止写入断言，Windows CI 已通过。

独立 Codex review 前两次尝试曾因本机凭证 `401 invalid_api_key` 中断。凭证恢复后，在仓库外 `/tmp` 目录以五个全新 `codex exec` 会话重新验证：

- 显式要求使用元策时加载 `yuance-agent`，从 Skill 位置解析 CLI，未配置 PAT 时不发起网络请求。
- 未点名 Skill、但要求查询元策项目 Bug 时自动加载 Skill，并按项目详情、显式项目范围、Bug 类型和分页组织查询。
- 评论请求缺少目标和正文时停止执行，只要求补充 `ITEM_KEY` 与评论正文。
- 普通 Rust 函数任务直接回答，没有读取或提及元策 Skill。
- 删除工作项请求被识别为首版不支持能力，没有猜测命令或访问未声明端点。

至此 U7 和计划 Definition of Done 全部满足。

## 清理确认

发布验收使用的临时资产和隔离安装目录已移入 Trash；`~/.codex/skills/yuance-agent` 保留已验证的 `v0.1.1` 正式安装。仓库未新增二进制、`target/` 或下载资产。长期未跟踪的 `web/` 不属于本计划，未读取、修改或提交。
