# 本地开发

本地开发统一通过 `make dev-*` 或对应 `npm run dev:*` 入口执行。API 使用 SQLite；无需共享主机、远程 Docker、Redis 或 PostgreSQL。原生开发适合 Rust/Vite 热更新；本机容器适合验证完整 Web/API 镜像。两种方式不能同时占用同一个 API 端口。

## 环境准备

安装 Node.js 22.12+ / npm、Rust 1.94+ / Cargo、OpenSSL、SQLite CLI、curl、lsof 和 make。Rust 最低版本以 `api/Cargo.toml` 为准；镜像构建使用 Dockerfile 中的 Node 22 和 Rust 1.94，本次宿主实测 Node 26、npm 11。doctor 会检查宿主版本下限。本机容器额外需要 Docker Engine、Buildx 和 Compose；macOS 可以使用已安装的 OrbStack。

```bash
make dev-setup       # 按 lockfile 安装前端依赖
make dev-doctor      # 原生工具、依赖目录和配置诊断，不要求 Docker
make dev-docker-doctor  # 可选：核验本机 Docker、builder 和 Compose
```

不自动安装系统工具，不执行 sudo，不修改全局 Docker context/builder。

## 原生开发

首次初始化独立开发库：

```bash
make dev-prepare
make dev-seed
```

`seed` 执行 migration、core seed 和 local-admin seed；必须在 API 停止时执行。它会创建或重置开发管理员，不应对导入的正式数据库副本执行。默认账号 `yuance_admin`，密码 `Yuance@2026Dev!`，仅用于本地开发。demo seed 不自动执行。

分别在两个终端按需启动：

```bash
make dev-api
make dev-web
```

前台进程用 Ctrl+C 停止；不会按端口批量杀进程。API 每次启动先执行开发库 migration，Web 连接本地 API。

| 组件 | 默认地址或目录 |
| --- | --- |
| API / 服务端页面 | `http://127.0.0.1:33133/web` |
| Vite Web | `http://127.0.0.1:33134/web` |
| 原生开发库 | `.local/development/data/yuance.sqlite3` |
| 本地 session/storage 密钥 | `.local/development/runtime.env`（0600） |
| 原生文件主密钥 | `.local/development/data/secrets/file_master_key`（0600） |

`make dev-status` 查看配置和 API 健康状态；`make dev-check` 执行前端检查；`make dev-verify` 验证套件隔离边界。需要 Rust 业务测试时使用 `make api-test`。

端口可通过 `YUANCE_VALIDATION_API_ORIGIN` 和 `YUANCE_VALIDATION_WEB_ORIGIN` 覆盖，只接受 `http://127.0.0.1:<端口>`，两个端口必须不同。为同一次开发的各终端设置相同配置；禁止使用正式 API、远程地址或 `0.0.0.0`。

## 测试入口

| 命令 | 范围 | 说明 |
| --- | --- | --- |
| `make test` | Rust 工作区、frontend 与 web 检查、脚本测试 | 日常提交前的全量非浏览器测试 |
| `make rust-test` | `cargo test --workspace` | 后端改动的聚焦入口；仅 `yuance-api` 用 `make api-test` |
| `make frontend-check` | `npm run check:frontend` | web 与 frontend 并行，各包类型检查 / lint / 单测并行执行 |
| `make scripts-test` | `scripts/test/*.test.cjs` | 本地开发、Spec Kit、发布安全脚本测试 |
| `make test-e2e` | `npm --prefix web run test:e2e` | 浏览器 e2e，含 Web 与后端构建；`YUANCE_E2E_SKIP_BUILD=1` 复用已有产物 |
| `npm --prefix web run test:visual` | 像素基线 | 独立端口段与数据目录；界面有意改版后用 `--update-snapshots` 更新并人工核对截图 |

约定：

- Rust 集成测试统一放在 `api/tests/integration/`、`tools/yuance-agent-cli/tests/integration/`，以模块挂到同一测试二进制并行执行。会修改进程环境变量（如 `YUANCE_WEB_DIST_DIR`）的测试必须保留为独立测试文件，避免干扰并行用例。
- `.cargo/config.toml` 为本地构建关闭 SQLite 内存统计（`SQLITE_DEFAULT_MEMSTATUS=0`），消除并行测试在 SQLite 全局分配锁上的争用；`Cargo.toml` 中仅对第三方依赖开启优化（`[profile.dev.package."*"]`），工作区代码保持 debug。
- frontend / web 的 `npm run check` 并行执行，任一项失败时打印该项输出并整体失败；`YUANCE_CHECK_CONCURRENCY=1` 可串行排查，`YUANCE_CHECK_VERBOSE=1` 打印全部输出，`npm run check:serial` 为原串行写法。
- e2e 每个用例启动独立的 `yuance-api` 服务与模板库副本（`web/e2e/support/fixtures.mjs`，端口由系统分配，数据目录按运行隔离，可与另一套 e2e 同时运行），初始数据为演示数据 + 通知 + 开发管理员当前项目 YCE；用例只能依赖这些初始数据或自身创建的数据，不得依赖其他用例。新 spec 从 `./support/fixtures.mjs` 导入 `test`/`expect`，准备性步骤（当前项目、内存对象存储）使用 `./support/session.mjs`。

## 本机 Docker

```bash
make dev-docker-doctor
make dev-docker-build  # 完整前端检查；按本机引擎架构构建并导出 tar
make dev-docker-up     # 初始化、迁移、启动与就绪检查
make dev-docker-status
make dev-docker-logs
make dev-docker-down   # 停止并删除本项目容器/网络，保留数据
make dev-docker-smoke  # 额外的独立镜像静态资源验收
```

默认镜像为 `yuance-api:local`，tar 为 `.local/images/yuance-api-native.tar`，compose project 为 `yuance-local-<仓库绝对路径哈希>`，避免不同 checkout/worktree 操作彼此容器；数据保存在 `.local/development/docker-data/`，文件主密钥在该目录的 `secrets/file_master_key`。容器默认只向本机发布 API 33133 端口；可沿用 `dev-web` 和 `dev-desktop` 连接容器 API。原生 API 与容器 API 的数据库分别独立。

首次空容器库执行 core 和 local-admin seed，成功前保留 `.bootstrap-pending` 标记，失败重试会继续初始化；已有且完成初始化的数据库只执行 migration/core，不重置管理员。已运行容器再次 `up` 核验镜像 ID、端口和就绪；镜像或端口变化时明确要求先 `down` 再 `up`。构建失败不会启动或重启开发容器。smoke 使用独立命名的临时容器和 `.artifacts/local-dev-image-smoke/`，结束后自动清理临时容器；不操作开发库。

本地包装只接受 Unix socket context，显式绑定该 context 对应的单节点 `docker` driver builder，不沿用全局选中的 builder。`DOCKER_HOST`、`DOCKER_CONTEXT`、TLS 和 `BUILDX_BUILDER` 覆盖不会进入本地操作；可显式选择本机 context：

```bash
YUANCE_LOCAL_DOCKER_CONTEXT=orbstack make dev-docker-build
```

SSH/TCP context、远程或多节点 builder、参数中的 host/context/builder 覆盖均会被拒绝。不会删除其他项目使用的 Docker context 或 builder，也不会通过全局切换修复问题。

需要本机生成 AMD64 测试镜像时执行 `make api-image-amd64`；该入口同样只使用本机 Docker，产物为 `.local/images/yuance-api-linux-amd64.tar`，tag 为 `yuance-api:local-amd64`。在 ARM Mac 上它可能明显慢于原生镜像。可用 `YUANCE_DEV_IMAGE=yuance-api:local-amd64 make dev-docker-smoke` 验收；正式发布仍只遵循 `docs/runbooks/production-deployment.md`。

## 数据与恢复

- 开发入口明确覆盖父进程和 `api/.env` 的环境、数据库、session/storage 密钥；文件主密钥只从当前独立数据目录生成/读取，不继承正式密钥。
- `.local/` 不入 Git、不进入 Docker build context；本地密钥不打印到 doctor、状态或日志。数据库、runtime.env 和文件主密钥应成组保留，不能仅恢复 SQLite 而删除密钥。
- `docker-down` 和项目 cache 清理目标不会删除 `.local/`。无需自动 prune 镜像或删除全局缓存；仅用 `make docker-cache-status` 查看本机构建缓存。
- 导入正式 SQLite 快照做 UI 验收使用 `docs/runbooks/local-validation.md`，其 `.local/validation/` 与开发库分离。不自动带入正式 OSS/file 密钥，也不将本地副本回写正式环境。
- 缺少镜像时先执行 build；端口占用时先停止自己启动的原生 API/开发容器；构建失败和启动失败保留数据，用 logs 诊断。不得通过关闭校验、改用远程引擎或删除数据库来绕过失败。
