# 东八区业务时间显示修复任务

输入：`spec.md`、`plan.md`

状态：实现、独立审查与收敛完成

## 实施与验证

- [x] T001 [US1] FR-001/FR-003 在 frontend/packages/ui/src/formatters.js 实现统一 UTC 解析和 Asia/Shanghai 展示，导出公共入口；单元覆盖多宿主时区、等价偏移、跨日/跨年、空值和纯日期。
- [x] T002 [US1] FR-002/FR-004 修改 app-shell 与共享 work-item-detail/comments/attachments 的时间显示，复用 formatter；不改 DTO、比较和日期输入。依赖 T001。
- [x] T003 [US1] FR-001/FR-002 补 api/src/web/user/mod.rs 下载页时间转换和单元测试，api/templates/web/desktop_downloads.html 标注东八区，不修改存储。依赖 T001。
- [x] T004 [US1] FR-001 至 FR-004 执行 frontend/web check、Rust 时间测试和 web/e2e/business-timezone.spec.mjs 本机真实 API 与多时区浏览器验证，复用资料与工作项回归。依赖 T002/T003。
- [x] T005 独立 review、analyze/converge 复核，记录 docs/reviews/2026-10-09-business-timezone-review.md；git diff 检查并提交推送当前分支，不部署。依赖 T004。

## 验收证据

源码审计与 TZ=Asia/Shanghai 复现确认数据库 UTC 被前端当本地时间解释；数据库/API 不需要改写。

- frontend check 与 web check 通过，后者 68 项测试通过。
- Rust display_timestamp 单元测试及下载页跨年集成测试各 1 项通过；cargo fmt --all --check 通过。
- business-timezone E2E 在 UTC、Asia/Shanghai、America/Los_Angeles 三个浏览器时区全部通过；仅操作本机临时数据库。
- 既有聚焦回归 7 项最终全部通过；附件回归首次失败暴露 query fixture 不匹配和中文 TXT charset 问题，最小修复后失败用例复跑通过。
- 独立 correctness 审查发现个人分析 joined_at 漏转换，补齐并增加断言后复核无剩余发现。完整证据见 docs/reviews/2026-10-09-business-timezone-review.md。
