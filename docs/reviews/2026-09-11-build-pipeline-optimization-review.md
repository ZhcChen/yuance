# 编译与构建链优化复核

## 标题信息

- 主题：编译、Docker 构建缓存与生成物清理入口优化
- 关联计划：[2026-09-11-build-pipeline-optimization-plan.md](../plans/2026-09-11-build-pipeline-optimization-plan.md)
- 审查范围：`api/Dockerfile`、正式镜像构建脚本、`.dockerignore`、`Makefile`、Dockerfile 静态测试、构建测量脚本和清理测试
- 负责人：Codex
- 日期：2026-09-11

## 结论摘要

本轮优化通过。正式冷基线到最终确认样本的完整流水线从 `415.896s` 降至 `252.567s`，减少 `163.329s`，约 `39.3%`；其中 API 镜像构建从 `396.277s` 降至 `238.423s`，减少 `157.854s`，约 `39.8%`。最终版本另有暖构建样本 `17.901s`，但由于缓存状态和工作负载不同，不将它与冷基线合并计算。

本轮没有执行正式环境部署，也没有执行 `make clean`、`make clean-deep`、全局 Docker prune 或用户级缓存清理。

## 优化前后对比

### 1. 构建流水线耗时

测量命令：`YUANCE_MEASURE_NO_CACHE=1 node scripts/measure-build-pipeline.mjs`。完整流水线为外部前端检查加 API 镜像构建；镜像构建内部传入 `YUANCE_SKIP_FRONTEND_CHECK=1`，避免同一轮正式脚本重复执行 Web 检查。

| 指标 | 优化前正式冷基线 | 优化后最终确认 | 变化 | 变化比例 |
| --- | ---: | ---: | ---: | ---: |
| 前端检查 | 19.619s | 14.144s | -5.475s | -27.9% |
| API 镜像构建 | 396.277s | 238.423s | -157.854s | -39.8% |
| 完整流水线 | 415.896s | 252.567s | -163.329s | -39.3% |

优化后第一次冷构建样本为前端 `16.013s`、镜像 `249.720s`、完整流水线 `265.733s`；第二次冷构建确认样本为上表数值。两次均通过前端检查和镜像构建门禁，最终采用第二次样本作为确认值。

### 2. 缓存状态下的构建

| 场景 | 前端检查 | API 镜像构建 | 完整流水线 | 说明 |
| --- | ---: | ---: | ---: | --- |
| 历史暖层参考 | 未记录 | 202.62s | 未记录 | 旧流程直接 `docker buildx build`，复用了已有依赖层，不是完整流水线冷基线 |
| 优化后暖构建 | 11.393s | 6.508s | 17.901s | Docker 层和 BuildKit cache mount 均命中，不与冷基线直接合并计算 |

仅修改发布版本参数的分层验证：新 runtime apt 层第一次建立耗时 `56.98s`；移动参数后再次改变发布版本，耗时 `2.65s`，减少约 `54.33s`，日志确认 runtime apt 层命中 `CACHED`。

### 3. 构建上下文与本地占用

| 项目 | 优化前 | 优化后 | 结果 |
| --- | ---: | ---: | --- |
| Docker build context | 约 1.56MB | 约 49.19KB | 减少约 96.9%，排除验证产物、CRG 数据、运行时目录和其它生成物 |
| 仓库 `target/` | 约 14GB | 约 14GB | 保留，未执行清理；新增 `make clean-rust` 提供明确入口 |
| Docker builder 可回收缓存 | 未作为项目基线 | 约 93.72GB | 仅查看；这是主机级 builder 数据，不能全部归因于本项目，未执行 prune |

### 4. 本地构建耗时样本

| 命令/阶段 | 优化后样本 |
| --- | ---: |
| `npm run check:frontend` | 12.78s |
| Web 构建 | 1.12s |
| API debug 构建 | 1.08s |
| API release 构建 | 0.51s |

这些样本用于确认本地编译链仍可工作，不作为与正式冷基线的同口径替代值。

## 实施内容

- `api/Dockerfile`：为 npm、Cargo registry、Cargo git 和按架构隔离的 Cargo target 接入 BuildKit cache mount；补齐 `app-shell` manifest；将二进制从 cache mount 复制到 `/tmp` 后再进入 runtime；将发布版本参数移到 runtime apt 层之后，减少仅改版本号造成的 apt 层失效。
- `scripts/build-api-image-amd64.sh`：启动前检查 Buildx/BuildKit，并传入 `YUANCE_SKIP_FRONTEND_CHECK=1`。
- `.dockerignore`：排除 `.artifacts`、`.context`、`.local`、CRG、覆盖率、测试结果和前端生成物等非镜像输入。
- `Makefile`：新增 `cache-status`、`docker-cache-status`、`clean-rust`、`clean-generated`、`clean-frontend-dist` 和 `clean-node-cache`；清理目标只作用于仓库内明确路径，不执行 `cargo clean`、全局 Docker prune，也不删除 `.local`、`data`、`backups`。
- 测试：扩展 `frontend/test/api-dockerfile.test.mjs`，新增 `scripts/test-build-cleanup.mjs`，覆盖分层输入、缓存挂载、构建参数、产物复制和清理边界。

## 验证结果

- Dockerfile 与清理静态测试：6 项通过。
- Docker BuildKit `--check`：通过。
- `scripts/build-api-image-amd64.sh` shell 语法检查：通过。
- 默认 Dockerfile 检查路径：Web 侧 60 个测试通过；默认路径仍执行 `npm run check && npm run build`。
- 最终镜像 smoke：迁移、seed、健康检查和 Web 静态资源检查通过。
- `make deploy-validate`：通过。
- `make crg.guard`：通过。
- 正式镜像脚本验证：成功生成 `linux/amd64` 镜像 tar；该临时 tar 已在本次收尾阶段删除。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- 远程 BuildKit `cache-from/cache-to` 未接入，避免新增 registry 凭证和外部状态；后续如需跨机器复用缓存，应单独设计并测量。
- Rust release profile、LTO、strip 和静态资源外置未调整；这些会改变产物大小、运行性能或调试边界，应另行建立基线。
- `target/` 仍约 `14GB`，这是有意保留的本地生成物；清理入口已实现并通过静态边界测试，但本轮没有实际执行清理。
- Docker builder 的约 `93.72GB` 可回收缓存属于主机级资源，不能直接视为本项目收益或成本。

### 建议后续跟进

- 在需要跨机器或 CI 复用编译缓存时，单独评估远程 cache 的凭证、失效策略、容量和命中率。
- 针对 release 产物大小、启动时间和运行性能建立独立测量，再决定是否调整 profile。

## 与计划的一致性

- 符合：完成 Docker 分层与 BuildKit 缓存、本地缓存可观测性、分层清理入口、Dockerfile 静态测试、前后耗时测量和复核记录。
- 未偏离：没有引入新包管理器，没有修改数据库、正式部署流程或运行时数据目录，没有删除用户级缓存或执行全局 Docker prune。
- 说明：历史 `202.62s` 仅作为暖层参考，本轮正式比较使用同一测量脚本产生的 `415.896s` 冷基线和 `252.567s` 最终确认值。

## 回归与风险

- 是否发现明显回归：未发现。
- 仍需关注的风险：BuildKit cache mount 依赖可用的 Buildx builder；脚本已增加启动检查，直接 Dockerfile 构建仍保留默认前端检查作为安全默认值。暖构建收益依赖缓存状态，不应直接外推到无缓存环境。

## 结论

- 结论：通过
- 下一步：提交并推送到 `main`
