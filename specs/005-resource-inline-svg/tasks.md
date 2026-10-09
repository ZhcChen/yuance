# 资料正文受控 SVG 展示任务

输入：`specs/005-resource-inline-svg/spec.md`、`specs/005-resource-inline-svg/plan.md`。
状态：实施中

## 阶段一：读者查看图片

- [x] T001 [US1] FR-001/FR-002 在 `web/e2e/resource-inline-svg.spec.mjs` 复现裸img和标准figure不显示。
- [x] T002 [US1] FR-001/FR-002/FR-004 修改 `frontend/packages/ui/src/rich-text.jsx` 与 `frontend/packages/app-shell/src/app.jsx`，复用受控Web解密预览并处理释放；依赖T001。
- [x] T003 [US1] FR-003/FR-004 验证新增SVG E2E、既有章节及Web加密协议测试，覆盖明文/加密、鉴权/校验失败与Blob释放；依赖T002。

## 阶段二：维护AI

- [x] T004 [US2] FR-005 更新 `skills/yuance-agent/SKILL.md` 及references、API契约、安装Runbook并同步本机安装，核验准确HTML与不泄露预览协议秘密。

## 复核与交付

- [x] T005 独立正确性/安全审查及前端聚焦检查，在 `docs/reviews/2026-10-09-resource-inline-svg-review.md` 保存证据；依赖T002/T003/T004。
- [x] T006 检查diff、收敛规格与任务，分闭环提交推送当前main；不自动发布。
- [ ] T007 [US1] FR-006 获得登录态且正式修复生效后，在资料P260713139801/30实际登录页面核验四图、网络与控制台，更新同一review；不删改资料/附件。

## 验收证据

本机7/7浏览器测试通过，含真实CLI四SVG加密上传、保存回读重存、下载解密及登录页显示；247项共享前端、62项Web及Desktop renderer检查通过，Skill校验及5项CLI包测试通过，独立审查无阻断。详细证据见 `docs/reviews/2026-10-09-resource-inline-svg-review.md`。

用户授权后已正式发布修复提交586deff，发布证据见 `docs/reviews/2026-10-09-resource-inline-svg-review.md`。T007仍待Web登录态；本轮未执行正式资料或附件写操作、无平行资料或重建附件。收敛核对未发现额外未实现代码，保留正式验收未完成状态。
