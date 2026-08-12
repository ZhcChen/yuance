# Review：富文本粘贴附件恢复为编辑器内上传进度节点

- 主题：粘贴图片或其他文件后，立即在富文本编辑器内显示上传节点，移除“已暂存 / 填写标题后自动上传”的外部提示
- 审查范围：`frontend/packages/ui/src/rich-text.jsx`、`frontend/packages/ui/src/styles.css`、
  `frontend/packages/app-shell/src/app.jsx`、`web/e2e/work-item-create-paste-auto-upload.spec.mjs`
- 负责人：Codex
- 日期：2026-08-12

## 原版交互与逻辑

- 旧版粘贴文件时调用 `insertRichFiles`，每个文件立即渲染为 `.rich-attachment` 节点：
  - 图片/视频使用 `URL.createObjectURL` 立即本地预览；
  - 普通文件显示文件图标、文件名和状态；
  - 节点 overlay 显示上传状态、重试和移除按钮，不在编辑器外显示附件提示。
- 新建工作项未填标题时，`ensureBugReportItemForRichUpload` 校验失败，节点进入错误态；
  填写标题后点击重试继续上传。
- 上传成功后节点原地替换为正式附件节点，正文序列化只保留正式附件 HTML。

## 当前实现

- `RichTextEditor` 增加编辑器内 pending upload 状态机：粘贴时立即插入本地节点，不等待上传完成。
- `onPasteFile` 扩展为 `(file, { onProgress, onError, isCurrent })`，各业务场景都走 inline 回调，
  不再污染编辑器下方的附件列表或创建表单状态。
- `app-shell` 移除 `workItemCreatePendingPastes`、提示文案、自动上传 flush 等旧逻辑；
  新建工作项未填标题时节点停留在错误态，填标题后点“重试”上传。
- 样式新增 `.yc-rich-pending-upload*`，对齐旧版 `.rich-attachment` 的视觉结构。
- `publish()` 序列化前移除本地 pending 节点，避免临时对象 URL 写入表单值；
  value 同步时保留上传中节点的原始位置，避免被挪到编辑器末尾。

## 已执行验证

- `frontend`：`@yuance/frontend-ui` 61 个测试通过；`@yuance/frontend-app-shell` 10 个测试通过。
- `web`：`npm run check` 52 个测试通过。
- 聚焦 E2E：`npx playwright test work-item-create-paste-auto-upload.spec.mjs` 通过，
  覆盖“粘贴后立即显示图片 -> 未填标题错误态 -> 填标题重试 -> 上传后替换正式附件”闭环。
- `git diff --check` 无空白错误；未跟踪的 `.artifacts/`、`.tmp-docx-harness/`、`test-results/` 未纳入提交。

## 可接受的残留项

- 连续粘贴多个文件时，`app-shell` 的上传单飞互斥仍会令后续文件等待或失败；
  当前验收场景为单文件粘贴。后续如需完全对齐旧版多文件并发上传，可再做队列或去互斥。

## 结论

- 结论：通过（本地）。待用户确认后部署正式环境，并补线上验收。
