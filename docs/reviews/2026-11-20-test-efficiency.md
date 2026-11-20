# 测试效率与正确性优化复核

## 标题信息

- 主题：在保证测试正确性的前提下优化全部测试的效率
- 关联计划：`specs/012-test-efficiency/`（spec / plan / tasks）
- 审查范围：`c853ed6c..HEAD` 全部提交
- 负责人：Claude Code（实现）；独立复核由单独代理完成（仅提供代码，不提供实现者结论）
- 日期：2026-11-20

## 目标对齐

用户要求“进行所有测试优化，保证测试正确性的前提下，优化测试效率，提升开发效率”。本次覆盖 Rust、frontend、web、脚本测试与 Playwright e2e（含视觉回归），不删除用例、不放宽断言；修复长期失败与不稳定的用例，并修复测试暴露的产品缺陷。

## 耗时对比

同一台 18 核机器；测量期间存在其他项目进程，负载在 14～50 之间波动，数值为同条件下的代表值。

| 入口 | 优化前 | 优化后 |
| --- | --- | --- |
| 改一行后端代码后重新编译测试 | 19.5s | 12.5s |
| `cargo test -p yuance-api`（已编译） | 115s | 7～10s |
| 其中集成测试（合并后单一二进制） | 顺序执行合计约 86s | 约 5s（sys 169s → 2.5s） |
| `npm --prefix frontend run check` | 21.8s | 2.5～5.7s |
| `npm --prefix web run check` | 3.8s | 1.3～1.5s |
| `npm run check:frontend` | 约 25.6s | 约 4s |
| `scripts/test/*.test.cjs` | 约 10.5s（且 spec-kit 失败） | 约 4.5s，全部通过 |
| `make test`（Rust 工作区 + 前端检查 + 脚本测试） | — | 约 20s |
| Playwright e2e 全量 | 17.1 分钟，29 失败 | 约 1 分钟（含构建 64s），0 失败 |

## 已执行验证

- 测试数量：api 集成测试标注 254 与执行数一致（与 HEAD 相同），lib 70；agent 44 + 2；frontend 291、web 68 与串行执行一致；脚本测试 37。
- Rust：`cargo test --workspace` 全部通过；`cargo clippy --workspace --all-targets -- -D warnings` 通过（修复了 Rust 1.99 新 lint 导致的既有失败）。
- 并行检查器：以故意失败的用例验证失败传播（退出码 1 并打印失败输出）；对无法识别的 package.json 脚本格式验证会直接失败。
- e2e：全量通过；`--repeat-each=3` 378/378 通过；两套 e2e 同时运行均 125/125 通过；运行目录在结束后清理，无残留服务进程。
- 视觉回归：按当前界面全量重建 13 张基线，`npm --prefix web run test:visual` 连续两次 9 项通过；抽查 dashboard desktop、requirements desktop、system users mobile 截图内容正常。
- 产品缺陷修复均做了“撤销修复”对照：弹窗遗留 close 事件（修复前 3/20 失败，修复后 0/30）；角色权限被后台刷新覆盖（修复前 5/5 失败，修复后 0/10）；Markdown 乱码先写失败单测再修复。

## 主要发现

### 测试暴露并已修复的产品缺陷

- 弹窗关闭动画结束后立即重新打开，会被上一次关闭遗留的 close 事件关掉（`Modal`、附件预览）。
- 角色权限页的后台刷新会覆盖未保存的勾选，保存时可能撤销角色全部权限。
- 文本类附件（如 `text/markdown`）预览未声明字符集，中文显示为乱码。

### 独立复核意见与处理

- 两次 e2e 同时运行可能抢占端口并连到对方服务、共享数据目录：改为系统分配端口、按运行 ID 隔离并清理目录、就绪后确认本进程存活。已用两套并发运行验证。
- “不得出现探测失败”的反向断言漏掉全局 toast：改为检查所有 alert。
- 服务在用例中途崩溃不会被发现：用例结束时断言服务仍存活。
- 视觉基线中短格式时间遮罩误盖统计卡片：仅在表格单元格内屏蔽，并以 `--update-snapshots=all` 重建（默认模式在低于差异阈值时不重写）。
- 并行检查对 package.json 脚本的解析可能静默丢参：改为格式不符即失败。

### 可接受的残留项

- `.cargo/config.toml` 关闭 SQLite 内存统计只作用于本地构建，正式镜像（`api/Dockerfile`）不读取该文件；该选项不影响 SQL 语义，是否在正式构建同样关闭可单独决定。
- `cargo fmt --check` 仍有 4 处与本次无关的既有格式差异（`api/src/domains/projects.rs`、`api/src/web/api/mod.rs`、`project_management_flow.rs`），未混入本次提交。
- e2e 目录不在 web 的 eslint 范围内（既有约定），本次未调整。
- 两套 e2e 并发运行时，若都未设置 `YUANCE_E2E_SKIP_BUILD=1`，仍会同时重建 `web/dist`；日常单套运行不受影响。

## 结论

可以合入。测试数量不变、断言未放宽，长期失败与偶发失败已清零，并修复 3 个由测试暴露的真实产品缺陷。
