# 本地开发套件复核

日期：2026-10-08
规格入口：`specs/001-local-development-toolkit/`

## 结果

通过。本地开发不再依赖远程 Docker 的 context、builder 或环境变量；统一入口提供原生开发和本机容器两种方式，数据库、文件密钥与正式环境隔离。正式运行目标与发布规则保留，共享构建脚本的正式调用显式选择原有制品模式。

## 独立审查

由只读 subagent 审查实现、测试、文档与规格，主线程修复后再独立复核，最终无阻断问题。

- 首次 migrate 建库后 seed 失败，旧实现会跳过管理员：改为首次空库先写 pending 标记，完成管理员 seed 后才移除，并增加失败重试测试。
- 已运行容器可能仍是旧镜像或旧端口：重复 up 比较镜像 ID 和端口，不一致时明确要求 down/up。
- 不同 checkout 固定 Compose 名称会相互停止服务：项目名绑定仓库 realpath 的哈希；本地套件 smoke 名称同样隔离。
- 共享脚本默认本地 tag/tar 后，备用正式示例可能误用旧 tar：正式调用与 Runbook 显式选择 `YUANCE_LOCAL_DOCKER=0`，保留原标签和 dist 口径。
- 实际 ready API 使用 data envelope；就绪检查核验 `data.service/status/environment`，避免 HTTP 200 或其他服务被误判。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `make dev-verify` | 9/9；远程 endpoint、全局覆盖、builder、origin、密钥和生命周期失败场景通过 |
| `node --test scripts/test-build-cleanup.mjs frontend/test/api-dockerfile.test.mjs` | 6/6 |
| `make spec-kit-verify` | 10/10 |
| shell 语法、`make deploy-validate` | 通过，包括当前 Compose config |
| `make dev-doctor` | Node 26.5 / npm 11.17 / Rust 1.94 / SQLite / OpenSSL / curl / lsof 可用 |
| `make dev-docker-doctor` | OrbStack Unix socket；Docker 29.4、Compose 5.1.2、BuildKit 0.29；单节点 docker driver |
| `make dev-docker-build` | 完整前端检查和原生 ARM64 镜像构建通过，load/save 成功 |
| `make dev-docker-up` | migration/core/local-admin、health/ready、loopback 端口绑定通过 |
| 本地 HTTP 登录 | 默认开发管理员登录 200，携带 cookie 的 `/api/v1/auth/me` 200 |
| `make dev-docker-down` 后再次 up | 已有用户保留、不重复 local-admin，runtime/file 密钥指纹不变 |
| `make dev-docker-smoke` | Web App 入口、asset/manifest 缓存合同和深链通过，临时容器清理 |
| `make dev-seed` / `dev-api` / `dev-web` | 原生空库 seed、API ready、Vite `/web/app/` 和代理登录通过 |
| 原生 API 停止后重启 | 数据和 session/storage/file 密钥保留 |
| 远程环境变量注入 | 设置假的 SSH host/context/builder 后 doctor 仍使用本机，检查前后全局 context 相同 |
| 密钥权限与数据隔离 | 四个本地密钥/环境文件均 0600；原生/容器文件密钥不同 |
| 最终临时进程清理 | 开发端口无监听，本项目验证容器无残留 |

本地镜像为 `yuance-api:local`（linux/arm64），tar 位于 `.local/images/yuance-api-native.tar`。开发数据与密钥保存在 `.local/development/`，未进入 Git 或 build context。smoke 证据保存在 `.artifacts/local-dev-image-smoke/`。

## 验证边界

- 未打开 Desktop GUI，未验证本轮桌面交互；沿用现有隔离启动器和 renderer 检查。
- AMD64 命令绑定本机构建器且已通过结构/平台支持检查，未进行完整 AMD64 镜像构建。
- 已有 npm 依赖可用，未重新执行全量 npm ci；setup 命令按现有三个 lockfile 安装。
- 未部署正式环境，未连接共享主机，未修改全局 Docker 配置或删除全局缓存。
