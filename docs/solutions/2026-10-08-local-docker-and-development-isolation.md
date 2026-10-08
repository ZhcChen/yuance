# 本地 Docker 与开发数据隔离

本地 Docker 操作统一经过 `scripts/ops/local-docker.cjs`，操作说明见 `docs/runbooks/local-development.md`。

- 安装本机 Docker 不代表构建发生在本机：既要核验 context 的 Unix socket，也要显式选中并核验对应单节点 docker driver builder。当前 Buildx inspect 不支持 JSON format，不能臆造 `--format`。
- `DOCKER_HOST/CONTEXT` 和 Buildx 覆盖必须在检查与执行的同一子进程环境中清除；`-c`、`--config`、inspect 的显式 builder 名称以及 legacy/Compose build 都可能绕开首次校验，开发包装需拒绝这些旁路。
- Compose 父环境的优先级高于 env-file；仅生成独立开发 env 文件仍可能继承正式凭证。调用 Compose 前清除同名 session/storage/file 和目录覆盖。
- 已创建 SQLite 文件不代表 seed 完成。首次初始化必须有成功后才移除的 pending 状态，失败重试才能继续创建管理员，而已有库不被自动重置。
- Compose 名称应绑定 checkout 路径；重复 up 要核验镜像 ID/端口，不把旧容器视为新代码。
- 原生 API 自动加载 api/.env。显式导出空文件主密钥可阻止继承，再由各自数据目录生成/复用密钥；恢复数据时必须同时保存该密钥。

以上边界已由聚焦失败测试和真实本机 build/seed/login/restart 验证，详情见 `docs/reviews/2026-10-08-local-development-toolkit-review.md`。
