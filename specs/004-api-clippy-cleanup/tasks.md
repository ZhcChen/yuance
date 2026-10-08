# API 严格 Clippy 告警清理任务

输入：`spec.md`、`plan.md`
状态：实现及验收完成，交付中，未部署

## US1：质量门禁恢复

- [x] T001 [US1] FR-001 在 api/src/domains/、api/src/platform/、api/src/web/ 被告警定位的源码机械修正借用/条件/返回值，逐项核对行为。
- [x] T002 [US1] FR-001 FR-002 在对应模块及 api/tests/ 调整过多参数、复杂行类型、测试模块顺序、跨await锁与浮点比较，更新所有受影响调用点，保留NaN拒绝语义；依赖T001。
- [x] T003 [US1] FR-003 SC-001 SC-002 验证：运行API全目标严格Clippy、fmt、API测试及CLI契约回归，覆盖会话、加密、资料及附件保护；依赖T002。

## 复核与交付

- [x] T004 FR-004 SC-003 独立审查参数/SQL/控制流与安全行为，对照规格收敛，记录 docs/reviews/2026-10-08-api-clippy-cleanup-review.md；依赖T003。
- [ ] T005 SC-003 检查diff并提交推送当前分支；不部署、不更新安装包；依赖T004。

## 依赖与并行

T001 -> T002 -> T003 -> T004 -> T005。主线程串行写入；参数方案探索与后续独立审查由只读agent完成。

## 验收证据

基线严格Clippy为lib 51项、lib-test 53项；库告警消除后全目标暴露的测试告警也已修复。最终API全目标严格Clippy及fmt通过，API全量393/393、CLI四套32/32通过，无失败/忽略。独立正确性与安全/对抗审查无阻断问题，完整证据见docs/reviews/2026-10-08-api-clippy-cleanup-review.md。

## 验证发现的夹具兼容修复

- [x] T006 [US1] FR-003 在 api/tests/device_business_parity_flow.rs 验证有效章节属性而非无属性标题；在 api/tests/project_management_flow.rs 同步已有12项目演示数据的计数、暂停状态分页与默认项目选择断言，保持产品数据与行为不变；重跑聚焦与完整API回归，补独立审查；在T003/T004完成前执行。

- [x] T007 FR-004 在 docs/runbooks/api-v1-contract.md 补齐现有资料库关联路径及其实际方法，恢复routing_smoke路由文档覆盖；依赖全量验证发现，在T003/T004完成前执行。
