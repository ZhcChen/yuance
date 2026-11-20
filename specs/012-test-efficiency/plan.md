# 方案：测试效率与正确性优化

关联规格：`specs/012-test-efficiency/spec.md`

## 基线（优化前，2026-11-20，18 核机器，存在其他项目的高负载，load average 约 45～50）

| 入口 | 耗时 | 结果 |
| --- | --- | --- |
| 改一行后端代码后 `cargo test -p yuance-api --no-run` | 19.5s | — |
| `cargo test -p yuance-api` 运行（已编译） | 115s（16 个测试二进制顺序执行，自报合计约 86s，另有 doctest 约 4s） | 全部通过 |
| `npm --prefix frontend run check` | 21.8s（26 次 `npm run` 串行） | 通过 |
| `npm --prefix web run check` | 3.8s | 通过 |
| `scripts/test/spec-kit.test.cjs` | 2.7s | **失败**（版本断言仍为 1.1.2，实际已升级到 1.2.3） |
| `web` Playwright e2e | 17.1 分钟 | **29 失败**、96 通过、4 跳过 |

## 根因与措施

### Rust

- argon2 等依赖在 debug 下极慢：每个用例都创建管理员并哈希密码。措施：`[profile.dev.package."*"] opt-level = 2, debug = false`，只优化第三方依赖，工作区代码保持 debug（增量编译与调试不受影响）。
- 16 个测试二进制各自链接一次（单个约 100MB）并顺序执行。措施：12 个集成测试文件合并为 `api/tests/integration/`（模块化保留原文件），`yuance-agent` 6 个合并为 `tools/yuance-agent-cli/tests/integration/`。修改 `YUANCE_WEB_DIST_DIR` 环境变量的 `bootstrap_flow`、`routing_smoke` 保持独立。
- 无文档测试却每次编译 rustdoc、二进制入口无单元测试却链接测试二进制。措施：`[lib] doctest = false`、`[[bin]] test = false`。

### 前端

- 各包检查经 `npm run` 层层串行。措施：`scripts/lib/run-tasks.mjs` 并行执行器，`frontend/scripts/check.mjs`、`web/scripts/check.mjs` 直接调用 `tsc`、`eslint`、`node --test`/`tsx --test`，检查项从各包 `package.json` 读取以保持单一来源；根目录 `check:frontend` 同时运行两者。保留 `check:serial` 作为串行对照。
- 各包 eslint 共用一个缓存文件，彼此覆盖。措施：按包拆分缓存文件。

### e2e

- 所有 spec 共用一个服务与数据库，并行 worker 互相修改当前项目、对象存储配置、项目列表，导致随机失败；`app-shell.spec.mjs` 97 个用例在单个 worker 内串行。措施：`globalSetup` 一次性构建并生成模板库；worker fixture 为每个 worker 复制模板库并启动独立服务（独立端口段、数据目录），覆盖 `baseURL`；开启 `fullyParallel`。
- 前置步骤依赖项目列表分页。措施：`e2e/support/session.mjs` 通过接口设置当前项目、激活内存对象存储。
- CLI 用例缺少 `yuance-agent` 产物。措施：`globalSetup` 同时构建 `yuance-api` 与 `yuance-agent`。
- 详情页、讨论区等 UI 改版后用例未更新。措施：逐个对齐当前界面，保留测试意图。

### 脚本测试

- Spec Kit 升级后版本断言未同步。措施：版本常量统一为 1.2.3，并校验 `.specify` 下各版本元数据一致；Runbook 同步。

## 验证

- 每项措施后对比测试数量与结果；并行执行器以故意失败用例验证失败传播。
- Rust 合并后多次重复运行，确认无全局状态导致的偶发失败。
- e2e 全量多次运行确认稳定。
- 同条件下前后耗时对比，写入 `docs/reviews/`；独立代码复核。
