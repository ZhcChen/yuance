# 任务：测试效率与正确性优化

关联：`specs/012-test-efficiency/spec.md`、`specs/012-test-efficiency/plan.md`

## 阶段 1：修复不可信的测试

- [x] T001 Spec Kit 测试版本断言同步到 1.2.3，并校验 `.specify` 下各版本元数据一致；Runbook 同步。FR-005
- [x] T002 e2e 长期失败用例逐个对齐当前产品行为（详情页、讨论区、弹窗底栏按钮、全局错误 toast、附件预览查询串、系统管理入口、关闭接口等），保留测试意图。FR-005
- [x] T003 消除 e2e 偶发失败：上传阶段改为轮询断言；旧刷新响应送达后再断言（避免空验证）；收尾卸载路由忽略在途错误。FR-005

## 阶段 2：Rust

- [x] T004 `[profile.dev.package."*"]` 仅优化第三方依赖。FR-001
- [x] T005 集成测试合并为单一二进制（`api/tests/integration/`、`tools/yuance-agent-cli/tests/integration/`），修改环境变量的测试保持独立；关闭空 doctest 与二进制测试目标。FR-002
- [x] T006 `.cargo/config.toml` 关闭 SQLite 内存统计，消除并行测试的全局分配锁争用。FR-001
- [x] T007 修复 Rust 1.99 clippy 新增 lint，恢复 `make api-clippy`。

## 阶段 3：前端

- [x] T008 并行检查执行器与 frontend / web / 根目录入口；eslint 缓存按包拆分。FR-003

## 阶段 4：e2e

- [x] T009 globalSetup + 用例级独立服务与模板库，`fullyParallel`；前置步骤接口化。FR-004
- [x] T010 视觉回归配置改用同一 fixture（独立数据目录），按当前界面全量重建像素基线，表格单元格中的短格式时间纳入屏蔽。

## 阶段 5：测试暴露的产品缺陷

- [x] T011 弹窗关闭后立即重新打开被遗留 close 事件关掉（Modal、附件预览）。修复前重复 20 次失败 3 次，修复后 30 次全部通过。
- [x] T012 文本类附件预览未声明字符集导致中文 Markdown 乱码；新增单测覆盖 text/markdown、text/csv、application/json。
- [x] T016 角色权限页后台刷新覆盖未保存勾选，保存时可能撤销角色全部权限。新增 e2e（修复前 5/5 失败，修复后 10/10 通过）。

## 阶段 6：入口、文档与验证

- [x] T013 `make test` / `rust-test` / `scripts-test` / `test-e2e`；`docs/runbooks/local-development.md` 测试入口与隔离约定。FR-006
- [x] T014 真实验证（见 `docs/reviews/2026-11-20-test-efficiency.md`）：测试数量与优化前一致；Rust、frontend、web、scripts 全部通过；e2e 全量通过且重复 3 次 378/378 通过、两套 e2e 并发运行均全部通过；clippy 全工作区通过。SC-001～SC-003
- [x] T015 独立代码复核，结论写入复核文档；复核意见（并发运行隔离、反向断言覆盖、服务存活断言、视觉遮罩误盖、脚本解析严格化）已全部处理。
