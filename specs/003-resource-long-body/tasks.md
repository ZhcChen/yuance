# 资料长正文任务

输入：`spec.md`、`plan.md`
状态：实现、验收与交付完成，未部署

## US1 长手册完整保存与重编辑

- [x] T001 [US1] FR-001 FR-002 FR-003 在 api/src/domains/project_resources.rs 移除HTML/plain正文字符限制并保留安全处理；核验SQLite TEXT主表及版本快照无需迁移。
- [x] T002 [US1] FR-004 FR-005 在 api/src/web/ 配置资料专用16MiB请求及JSON413错误；共享API正文只校验类型；依赖T001。
- [x] T003 [US1] FR-004 FR-005 在 desktop/src/renderer/platform/api-transport.js 和 desktop/src/network/ 取消资料字符限且保留专用字节保护，在 tools/yuance-agent-cli/src/client.rs 配置响应容量；依赖T002。
- [x] T004 [US1] FR-004 FR-005 更新 docs/openapi/yuance.openapi.json、skills/yuance-agent/、网关模板与Runbook，准确说明容量及发布前置；依赖T002/T003。
- [x] T005 [US1] FR-001 FR-002 FR-003 FR-005 FR-006 验证：后端真实router/SQLite保存回读、版本快照、补属性复现、传输超限不写入、安全回归；依赖T001/T002。
- [x] T006 [US1] FR-004 FR-006 验证：共享前端/ Desktop/CLI聚焦测试及检查；真实本机Web编辑器、OpenAPI和CLI长正文创建回读修改重存、章节点击与目录；依赖T001-T004。

## 复核与交付

- [x] T007 独立代码审查、converge，对照FR/SC并记录 docs/reviews/ 验收与边界；依赖T005/T006。
- [x] T008 检查diff、按小闭环提交推送当前分支；不部署、不改生产资料；依赖T007。

## 依赖与并行

T001 -> T002 -> T003 -> T004；T005/T006验证后T007 -> T008。读密集探索及review可并行，写入主线程串行集成。

## 验收证据

后端领域9/9、资源契约4/4、资料聚焦9/9、Desktop56/56、CLI31项、Web62/62及共享前端全量check通过。Playwright4/4：49363→57063字符重存、235597字符HTML三入口及章节点击、4620006字符CLI全文往返。网关隔离运行验证通过。已有附件测试与API严格Clippy问题、CLI1项跳过已记录，不宣称全量检查通过。完整证据：docs/reviews/2026-10-08-resource-long-body-review.md。正式未部署，BI正文未修改。
