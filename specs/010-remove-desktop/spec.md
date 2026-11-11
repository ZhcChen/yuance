# 移除桌面端及其服务端支持

状态: 已完成（系统 Token scope 与旧权限行待用户决定）
来源：用户指令「废弃桌面端的版本，所有桌面端版本全部移除清理，只保留现在生产在用的 web 版本」；范围经用户确认：客户端 + 服务端代码，历史文档一并删除。

## 目标与范围

产品只保留 Web 版本。移除桌面端客户端、桌面发布与下载、设备授权与设备会话等只为桌面端服务的服务端能力，以及相关脚本、配置、测试、文档。

范围内：

- `desktop/` 目录（Electron 客户端、原生文件守卫、发布清单与工具）。
- 根目录与脚本：`Makefile`、`package.json`、`scripts/` 中的桌面端入口、发布脚本、本地验证与部署模板校验里的桌面段。
- 服务端代码：设备授权、设备会话、设备文件传输、桌面接入发现（`/.well-known/yuance-desktop`）、桌面下载页、系统发布管理（发布包上传、下载、撤回），及其配置、后台清理任务、模板、静态资源、测试。
- 前端：只服务桌面端的宿主适配、系统发布管理界面、`window.yuanceDesktop` 相关代码与测试，parity 合同中的桌面项。
- 文档：桌面端专属的历史文档（brainstorms、plans、reviews、solutions、旧 specs、runbooks）直接删除；现行文档中的桌面段落改写。

明确不做：

- 不新增删除数据库表的迁移。已发布的历史迁移保持不变；相关表在已有库中保留为闲置数据，是否清库另行决定。
- 不改 Web 端业务行为与视觉。
- 不部署正式环境。

## 用户场景与验收

### US1：仓库只剩 Web 产品

- 优先级：P0
- Given：当前仓库含 `desktop/` 与桌面相关服务端能力
- When：完成移除
- Then：仓库不再有 `desktop/` 目录；`make`/`npm` 入口、脚本、部署模板校验不再引用桌面端；服务端不再暴露设备授权、设备会话、桌面下载、系统发布相关路由
- 失败或边界：部署流水线脚本、生产发布安全测试仍然通过；已有生产库里的闲置表不影响启动

### US2：Web 功能无回归

- 优先级：P0
- Given：移除前的 Web 构建、前端检查、Rust 测试与 e2e 基线
- When：移除后重新执行
- Then：构建与检查全部通过，e2e 失败集合不超出移除前基线

## 功能要求

- FR-001：删除 `desktop/` 目录及其 `.gitignore`、`.dockerignore`、`Makefile` 清理项。
- FR-002：移除 `validation-desktop`、`dev-desktop`、`dev:desktop`、`check:frontend` 中的桌面段，端口分配不再保留 Desktop renderer。
- FR-003：删除 `scripts/publish-desktop-release.mjs` 及其测试、夹具；`validate-deploy-templates.sh` 与 `deploy-production.sh` 去掉桌面依赖安装与构建。
- FR-004：服务端删除设备授权、设备会话、设备文件传输、桌面接入发现、桌面下载页、系统发布管理的路由、领域代码、模板、静态资源、配置项与测试；`cargo build`、`clippy`、测试通过。
- FR-005：OpenAPI 合同同步移除对应路径与模型。
- FR-006：前端移除桌面宿主、系统发布界面及相关 API 客户端、路由、parity 条目与测试；`make frontend-check`、`make web-build` 通过。
- FR-007：删除桌面端专属历史文档；`README.md`、runbooks、standards、`AGENTS.md`、constitution 中的桌面内容改写或删除，不留悬空链接。

## 成功标准

- SC-001：`git ls-files | grep -i "^desktop/"` 为空；对非历史文件 `git grep -i "desktop\|electron"` 不再命中产品代码与现行文档（残留须逐条说明）。
- SC-002：`make frontend-check`、`make web-build`、`cargo build`、`cargo clippy`、`cargo test` 通过；视觉护栏通过；e2e 无新增失败。
- SC-003：本地生产镜像模拟启动，在含旧设备表的库上正常迁移与启动。

## 风险与验证要求

- 服务端删除涉及公共契约（OpenAPI）与部署，需独立复核；以编译与测试为准，不依赖静态检查。
- 生产库保留旧表：用现有迁移链在新旧库上各启动一次验证。
- 生产发布安全测试（`scripts/test/production-release-safety.test.cjs`）与 `make deploy-validate` 须通过。

## 未决事项

- 闲置的设备与发布相关数据库表是否清库：本次不处理，待用户另行决定。
