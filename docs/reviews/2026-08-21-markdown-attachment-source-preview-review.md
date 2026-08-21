---
title: Markdown 附件原文预览复核
date: 2026-08-21
status: passed
---

# Markdown 附件原文预览复核

## 结论

通过。共享附件预览已恢复旧版的 Markdown 原文展示结果，不执行 Markdown 到 HTML 的渲染。Web 与 Desktop 共用 `strategy=text` 语义；API 和 Desktop 私有内容流统一使用 `text/plain; charset=utf-8`，避免历史 `application/octet-stream` 登记导致浏览器下载或空白。

Desktop 仅允许严格匹配 `app://yuance/.preview/ypv_<32 位 capability>` 的子 frame 导航，其他子 frame、附加路径、查询串和外部来源继续拒绝。

## 验证

- `cd frontend && npm run check`：通过。
- `cd web && npm run check`：通过。
- `cd desktop && npm run check`：通过。
- `cd api && cargo check --lib`：通过。
- API 文本 MIME 单测：通过。
- Desktop 导航策略、预览协调器和内容加载器聚焦测试：17 项通过。
- Web 项目资料 Markdown 原文预览 E2E：通过。
- Web 工作项评论文本附件预览及附件完整流程 E2E：通过。
- `make crg.review BASE=origin/main`：完成，未发现阻断项。

`cargo fmt --check` 仍会报告本轮未修改的 `api/src/web/router.rs` 既有格式差异；本轮修改文件没有新增格式差异。
