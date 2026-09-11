# 编译与构建链优化计划

## 目标

在不改变正式部署产物行为的前提下，降低本地和正式镜像构建的重复工作，提升 Docker 增量构建命中率，并为编译产物、前端缓存和验证产物提供可见、可控的清理入口。

## 已有记录与当前基线

- `16953d0` 已为前端 TypeScript、ESLint 和 Desktop 主进程检查接入增量缓存与并行检查。
- `0124af1` 已新增 `make clean` 与 `make clean-deep`，但当前没有分层查看缓存大小的命令。
- `83abaa1`、`0349dfb`、`2b393a9`、`cbe476e` 已建立 Web 多阶段镜像、共享前端 workspace 输入和依赖安装层。
- 当前 Docker API 镜像基线构建约 `202.62s`，其中 Rust release 构建约 `197.7s`，Web 检查与构建约 `70.6s`。
- 当前仓库 `target/` 约 `14G`，其中 `target/debug` 约 `13G`；这些是本机生成物，不纳入版本控制。

## 本轮范围

### 1. Docker 分层与缓存

- 补齐 `app-shell` workspace manifest，使依赖层输入完整。
- 为 npm、Cargo registry、Cargo git 和 Cargo release target 接入 BuildKit cache mount。
- 将 Cargo 产物从 cache mount 复制到 builder 镜像的持久路径，确保 runtime 阶段仍能复制二进制。
- 通过构建参数区分“外部质量检查”和“镜像内 Web 构建”，避免正式脚本重复执行 Web 检查；直接调用 Dockerfile 时保留默认检查。
- 补充 `.dockerignore`，排除验证证据、运行时本地目录、CRG 数据和其它生成物。

### 2. 本地清理与可观测性

- 保留现有 `clean`、`clean-deep` 语义。
- 增加按范围查看本地构建占用的 `make cache-status`。
- 增加只删除前端工具缓存、生成物和 Rust 构建产物的分层入口，避免必须删除整个依赖目录才能回收编译缓存。
- 不新增默认的全局 Docker prune；Docker builder 缓存只提供查看和明确范围的操作建议。

### 3. 验证与记录

- 扩展 Dockerfile 静态测试，覆盖 workspace manifest、BuildKit cache mount、构建参数和缓存产物复制路径。
- 测量前端检查、Docker 镜像构建和完整流水线耗时。
- 执行聚焦检查、Web 构建、API debug/release 构建和镜像 smoke 验证。
- 将结果写入 `docs/reviews/`，并对照本计划复核范围漂移。

## 不在本轮范围

- 不迁移 npm workspace 或引入 pnpm 等新包管理器。
- 不调整 Rust release profile、LTO、strip 或静态资源外置；这些会改变产物和调试边界，应另行测量。
- 不清理 `~/.cargo`、`~/.npm`、`~/.rustup`、`~/Library/Caches` 或其它项目的 Docker 镜像/卷/缓存。
- 不修改数据库、正式部署流程或运行时数据目录。

## 执行顺序

1. 完成当前基线测量并确认优化范围。
2. 先修改 Docker 分层、缓存和重复检查路径。
3. 再补充清理入口与 Dockerfile 静态测试。
4. 执行聚焦验证和前后对比测量。
5. 记录复核结论，按项目规范提交并推送到 `main`。

## 回滚策略

- Docker cache mount 只影响构建缓存，不改变运行时镜像内容；如遇 BuildKit 兼容问题，可移除 cache mount，保留原有 `cargo build` 路径。
- 重复检查跳过参数默认关闭，直接 Dockerfile 构建仍会执行检查；正式脚本可恢复为不传该参数。
- 清理入口只作用于仓库内明确列出的生成物和缓存目录，不触碰业务数据。
