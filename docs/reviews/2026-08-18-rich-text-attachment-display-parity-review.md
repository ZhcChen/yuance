---
title: 富文本附件编辑态与详情态展示一致性复核
type: review
status: completed
date: 2026-08-18
---

# 富文本附件编辑态与详情态展示一致性复核

## 结论

通过。正式文件附件的卡片基础样式、文件扩展名 badge、文件类型配色、暗色主题变量和 hover/focus 状态已迁移到共享 UI 样式层，编辑器、工作项主帖、评论和项目资料详情正文现在使用同一套规则。上传中的进度、失败、重试和移除控件仍保留为独立状态层。

## 实现范围

- `frontend/packages/ui/src/styles.css` 新增 `.yc-rich-text-input` 与 `.yc-rich-text-content` 共享的正式文件卡片规则，覆盖 word、sheet、slide、pdf、text、code、archive 类型及暗色主题。
- `frontend/packages/app-shell/src/application.css` 删除项目资料详情重复的正式文件卡片规则，保留资料正文的段落、表格、标题、代码块和媒体布局。
- `frontend/packages/ui/test/rich-text.test.mjs` 增加共享选择器和类型配色契约测试，并防止 app-shell 重新出现资料详情专用文件卡片规则。
- `web/e2e/app-shell.spec.mjs` 增加工作项主帖、评论和编辑器使用同一附件 HTML 的计算样式 parity 测试。

## 已执行验证

```bash
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs -g 'work item rich text file cards'
npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs -g 'shared project resource attachments render inline|shared project resources create edit password'
```

- Frontend 全量检查通过，UI 富文本测试 66 项通过。
- Web 全量检查通过，Web 单测 52 项通过。
- Desktop renderer 检查、TypeScript 校验、ESLint 和 renderer build 通过。
- 新增工作项附件 parity E2E 通过；项目资料附件渲染/编辑删除 E2E 通过。
- `git diff --check` 通过。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- 既有 `work item comments create rich mentions, reply, and edit through one shared composer` E2E 当前查找“发布评论”按钮，但运行界面实际文案为“发表”；该失败与本轮附件样式改动无关，且在本轮代码不变的情况下单独重跑仍复现。建议后续单独统一测试与当前产品文案。

## 与计划的一致性

- 正式附件样式已从 app-shell 资料详情作用域收敛到共享 UI 层，覆盖编辑器和所有详情正文。
- 未改变附件上传、签名、下载、预览、权限和正文 HTML 数据契约。
- pending upload 继续保留独立状态节点，完成后替换为共享正式卡片，避免破坏重试/移除交互。

## 回归与风险

- 未发现本轮 CSS 迁移导致的图片、视频、资料附件预览或正文附件删除回归。
- 仍需后续处理既有评论 E2E 的按钮文案断言，避免掩盖真正的评论流程回归。

## 结论

- 结论：通过。
- 下一步：进入提交并推送。
