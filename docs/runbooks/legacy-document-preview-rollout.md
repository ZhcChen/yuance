# legacy doc/ppt 实验预览灰度手册

## 目标

控制旧格式 `doc` / `ppt` 纯前端预览的发布风险。该能力默认关闭，只在开发环境、测试环境或明确灰度窗口内开启。

## 开关

默认关闭：

```text
YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED=false
```

灰度开启：

```text
YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED=true
```

修改后重启 `yuance-api`。关闭开关后，`doc/ppt` 的正文附件、附件列表、项目文件管理器和右键菜单都应不再展示预览入口；直接访问 `/preview` 仍应显示站内降级页和下载入口。

## 开启前检查

- 已确认不会引入 `LibreOffice`、`soffice`、ONLYOFFICE 或服务端 Office 转换。
- 已准备并记录以下样本：
  - 纯文本 `doc`
  - 带图片 `doc`
  - 简单两页 `ppt`
  - 含图形与复杂背景的 `ppt`
- 已确认 `PDF/TXT/MD/JSON/CSV/XLS/XLSX/ODS/DOCX/PPTX` 稳定预览链路不受影响。
- 已接受 `doc/ppt` 复杂版式、嵌入对象、宏、动画和图表可能渲染不完整。
- 已接受 `ppt` 当前前端运行时可能出现可见水印；若水印不符合发布要求，不得开启正式灰度。

## 验证步骤

1. 保持开关关闭，访问 `doc/ppt` 附件详情：
   - 不显示“预览文档”或“实验性预览”入口。
   - 直接访问 `/preview` 显示未开启提示。
   - “下载原文件”可用。
2. 开启开关并重启服务。
3. 分别从以下入口点击 `doc/ppt`：
   - 工作项已有附件
   - 评论附件
   - 资料正文附件
   - 项目文件管理器
   - 富文本附件右键菜单
4. 确认入口文案为“实验性预览”，预览页显示实验性提示。
5. 确认 renderer 失败时停留在站内错误态，并保留下载入口。
6. 回归 `xls/docx/pptx`，确认仍走稳定链路，不显示 legacy 实验语义。

## 回退触发条件

出现任一情况立即关闭 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED` 并重启：

- 预览页白屏、卡死或持续加载。
- 大量 `doc/ppt` 样本渲染错误，影响用户判断内容。
- `ppt` 水印或授权边界不可接受。
- legacy 静态资源加载失败率明显升高。
- 稳定预览格式受影响。

## 复核证据

- `docs/runbooks/document-preview-frontend-validation.md` 中 legacy 场景全部通过。
- 聚焦测试通过：

```bash
cargo test -p yuance-api legacy_document_preview_entries_require_feature_flag
cargo test -p yuance-api web_work_item_legacy_doc_preview_page_degrades_when_flag_disabled
cargo test -p yuance-api web_work_item_legacy_doc_preview_page_uses_frontend_preview_contract_when_flag_enabled
cargo test -p yuance-api web_work_item_legacy_ppt_preview_page_requires_feature_flag
cargo test -p yuance-api web_work_item_detail_hides_legacy_doc_preview_button_by_default
cargo test -p yuance-api web_work_item_detail_shows_legacy_doc_preview_button_when_flag_enabled
cargo test -p yuance-api web_work_item_detail_toggles_legacy_ppt_preview_button_by_flag
cargo test -p yuance-api web_work_item_docx_preview_page_uses_frontend_preview_contract
cargo test -p yuance-api web_work_item_detail_keeps_docx_preview_button_available
cargo test -p yuance-api web_work_item_stable_spreadsheet_and_pptx_preview_stay_available
cargo test -p yuance-api static_legacy_document_preview_module_is_served
cargo test -p yuance-api static_legacy_doc_bundle_is_served_for_document_preview
cargo test -p yuance-api static_legacy_ppt_manifest_and_font_assets_are_served
```

## 运行观察

- 观察窗口：开启后至少 1 个工作日。
- 健康信号：稳定格式预览正常，legacy 预览失败可见且可下载，无白屏或卡死反馈。
- 失败信号：前端错误、renderer 资源加载失败、用户反馈版式明显误导、水印不可接受。
- 回退方式：设置 `YUANCE_EXPERIMENTAL_LEGACY_PREVIEW_ENABLED=false`，重启 `yuance-api`，复核 `doc/ppt` 入口消失且下载可用。
