# Review：新建工作项富文本粘贴图片修复

- 主题：新建需求 / 任务 / Bug 弹窗直接粘贴图片，创建后主帖保留图片
- 关联计划：`docs/plans/2026-07-13-001-feat-rich-text-discussion-plan.md`
- 审查范围：`frontend/packages/app-shell/src/app.jsx`、工作项更新周期契约、正式部署前置验证
- 负责人：Codex
- 日期：2026-08-11

## 目标对齐

用户通过“新建 Bug”测试粘贴图片，线上仍只出现 `image.png` 文案。审查确认共享 SPA
的新建工作项表单未接入 `RichTextEditor.onPasteFile`，因此粘贴文件只回退为文件名。
后续验收进一步反馈：未填标题时仍必须先写标题才能把图片放进富文本，期望粘贴后立即显示图片。

## 已执行验证

- 前端：`npm run check --workspace @yuance/frontend-app-shell --workspace @yuance/frontend-api-client`
- 前端：`npm run check:js`、`npm run lint`、`npm run build`（web 包）
- 后端：`cargo test --manifest-path api/Cargo.toml --test project_management_flow`
- 聚焦 E2E：`npx playwright test e2e/work-item-create-paste-auto-upload.spec.mjs` 通过
- 格式化：`cargo fmt --all -- --check`、`git diff --check`

## 主要发现

### 已修复

- 新建工作项富文本增加 `onPasteFile`：首次粘贴先创建工作项和主帖，再上传附件并回填正文。
- 创建后统一写入主帖，新建工作项说明不再以纯文本展示 HTML。
- 工作项更新接口补齐 `cycle_id`，粘贴后修改周期不会丢字段；支持 `null` 清空周期。
- 已粘贴图片后取消按钮改为“转到详情”，详情主帖同步保留已上传图片。

### 追加修复（未填标题时直接显示图片）

- 图片粘贴时转换为 `data:` URL 本地预览并立即插入正文；临时附件使用负 `tempId` 标记。
- 创建/更新主帖前先把临时节点替换为“图片上传中…”占位正文，避免后端拒绝
  “正文媒体必须使用已上传的评论附件”。
- 填写标题后自动上传，成功后把正文中的临时节点替换为正式附件 HTML。
- 非图片文件仍暂存，填写标题后追加到正文末尾。
- E2E 断言首次主帖不含 `data:` 或负附件 ID，最终正文包含正式附件。
- Web 签名上传接受 `content-length` 请求头（浏览器实际发送时自动管理并过滤），
  同时兼容 `x-amz-content-sha256` 等对象存储签名头。

### 可接受的残留项

- 粘贴上传期间弹窗字段暂时禁用，避免正文引用与上传状态错配。
- 未填标题阶段图片为本地预览，正式上传仍需标题；标题填写后自动上传，无需再次操作。

## 与计划的一致性

- 符合富文本讨论区共享编辑能力的统一方向；新建工作项场景此前遗漏，本次补齐。
- 未填标题时先本地显示、填写标题后自动上传，不需要用户手动等待上传完成。

## 回归与风险

- 未发现明显回归；完整 `app-shell.spec.mjs` 中 11 项失败均为既有 toast 断言/时序问题，
  与本轮改动路径无关。
- 正式环境需验证对象存储签名直传与图片预览仍正常。

## 结论

- 结论：通过（本地）；待同步正式 WSL 后做线上验收。
- 下一步：提交并推送 `dev`，验证后同步正式 WSL 并执行正式部署
