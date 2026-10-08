# 资料同文档章节引用任务

输入：`spec.md`、`plan.md`
状态：实施与验收完成，待交付

## 维护与阅读闭环

- [x] T001 [US1] FR-001 FR-004 FR-005 在 api/src/domains/project_resources.rs 限定清洗属性、生成/去重/持久化标识，验证幂等与危险 HTML。
- [x] T002 [US1] FR-002 FR-003 FR-006 在 frontend/packages/ui/src/ 实施共享章节机制、正文与目录定位、编辑器章节选择和保存保留；依赖 T001 合同。
- [x] T003 [US1] FR-007 更新 docs/openapi/yuance.openapi.json、skills/yuance-agent/ 文档与 docs/runbooks/resource-chapter-links.md，明确 CLI 透传与生命周期；依赖 T001/T002。
- [x] T004 验证：执行后端与 UI 聚焦测试、前端类型/lint 检查、真实 API 保存回读和 Playwright 详情/编辑器/目录回归；依赖 T001-T003。
- [x] T005 独立代码审查、converge 并记录 docs/reviews/ 验收证据；依赖 T004。
- [ ] T006 检查 diff，分闭环提交推送并记录完成；不部署正式环境。

## 依赖与并行

T001 -> T002 -> T003 -> T004 -> T005 -> T006。只读探索和 review 可并行；写入由主线程串行集成。

## 验收证据

后端正文测试 8/8、资源契约 4/4、共享 UI 93/93、Web 62/62、CLI/Skill 契约与流程 20/20 通过；共享前端全量 check、Desktop renderer check/build 通过。

Playwright 4/4：真实 PAT 保存回读、正文/表格/目录点击、编辑器创建并重存、改名和前置标题插入、删除目标；另有历史阅读/迁移与目录宽度回归。独立 review 修复旧别名误绑，最终无阻断。FR/SC 收敛无新增实现缺口。

完整证据及未验证边界：`docs/reviews/2026-10-08-resource-chapter-links-review.md`。本机测试服务已关闭；未部署或发布 Skill 包。
