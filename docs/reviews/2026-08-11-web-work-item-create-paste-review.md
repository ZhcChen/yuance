# Review：新建工作项富文本粘贴图片修复

- 主题：新建需求 / 任务 / Bug 弹窗直接粘贴图片，创建后主帖保留图片
- 关联计划：`docs/plans/2026-07-13-001-feat-rich-text-discussion-plan.md`
- 审查范围：`frontend/packages/app-shell/src/app.jsx`、工作项更新周期契约、正式部署前置验证
- 负责人：Codex
- 日期：2026-08-11

## 目标对齐

用户通过“新建 Bug”测试粘贴图片，线上仍只出现 `image.png` 文案。审查确认共享 SPA
的新建工作项表单未接入 `RichTextEditor.onPasteFile`，因此粘贴文件只回退为文件名。

## 已执行验证

- 前端：`npm run check --workspace @yuance/frontend-app-shell --workspace @yuance/frontend-api-client`
- 前端：`npm run check` 与 `npm run build`（web 包）
- 后端：`cargo test --manifest-path api/Cargo.toml --test project_management_flow`
- 格式化：`cargo fmt --all -- --check`、`git diff --check`

## 主要发现

### 已修复

- 新建工作项富文本增加 `onPasteFile`：首次粘贴先创建工作项和主帖，再上传附件并回填正文。
- 创建后统一写入主帖，新建工作项说明不再以纯文本展示 HTML。
- 工作项更新接口补齐 `cycle_id`，粘贴后修改周期不会丢字段；支持 `null` 清空周期。
- 已粘贴图片后取消按钮改为“转到详情”，详情主帖同步保留已上传图片。

### 可接受的残留项

- 粘贴上传期间弹窗字段暂时禁用，避免正文引用与上传状态错配。

## 与计划的一致性

- 符合富文本讨论区共享编辑能力的统一方向；新建工作项场景此前遗漏，本次补齐。

## 回归与风险

- 未发现明显回归；`project_management_flow` 86 项用例全部通过。
- 正式环境需验证对象存储签名直传与图片预览仍正常。

## 结论

- 结论：通过
- 下一步：提交并推送 `dev`，验证后同步正式 WSL 并执行正式部署
