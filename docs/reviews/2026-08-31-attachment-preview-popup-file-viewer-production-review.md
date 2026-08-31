---
title: 附件预览弹窗统一接入 Flyfish File Viewer 正式部署复核
type: review
status: completed
date: 2026-08-31
---

# 附件预览弹窗统一接入 Flyfish File Viewer 正式部署复核

## 结论

通过。附件预览弹窗不再走旧的“不支持内嵌渲染”回退，docx/pdf/xlsx 及扩展白名单
内文档统一由 Flyfish File Viewer 在弹窗内离线渲染；正式环境健康检查、静态资源、
迁移与文件审计均通过，容器运行最新镜像。

## 问题表现

- 正式环境在工作项附件、评论附件、资料库附件弹窗中点 docx、pdf、xlsx 等文件，
  都提示“此文档暂不支持内嵌渲染，可下载后查看”。
- 独立 `/preview` 页此前已接入 file-viewer，但前端 `AttachmentPreview` 弹窗仍是
  旧逻辑，非文本文档一律进入不支持提示。

## 修复内容

- `web/src/platform/browser/document-viewer.js`：新增 Web 宿主 file-viewer 运行时，
  延迟加载 IIFE、拉取服务端解密后的预览 content、调用 `mountViewer` 挂载文档。
- `frontend/packages/ui/src/attachment-preview.jsx`：非 text 文档在弹窗内渲染
  `.attachment-preview-document-host`；包含加载中、错误、请求竞态清理与 destroy。
- `frontend/packages/app-shell/src/app.jsx`：通过 `services.documentViewer` 注入
  `AttachmentPreview` 包装组件，工作项附件、评论附件、资料库附件弹窗均启用。
- `api/src/web/attachment_preview.rs`：新增 `Document` 策略，按 file-viewer 扩展
  白名单（含 rtf/zip/apk/xlsm 等 227 类）返回文档预览；图片/视频仍走原路径。
- `frontend/packages/ui/src/rich-text.jsx`：同步扩展文档类型白名单与右键“预览”入口。
- 保留 `pdf/text/spreadsheet/docx/pptx/legacy-doc/legacy-ppt` 原有策略语义，
  仅新增 `Document` 使用真实扩展名作为 file-viewer 类型。

## 验证

- `cargo check -p yuance-api` 通过。
- `cargo test -p yuance-api --lib web::attachment_preview`：2 项通过。
- `cargo test -p yuance-api --lib web::user::tests`：4 项通过。
- `cargo test -p yuance-api --test routing_smoke`：29 项通过。
- `cargo test -p yuance-api --test project_management_flow preview`：5 项通过。
- `npm --prefix frontend run check`、`npm --prefix web run check` 全量通过。
- `web/e2e` 附件预览用例通过：PDF 弹窗出现 file-viewer 文档宿主，不再出现旧提示。

## 发布结果

- 发布版本：`20260831124120`。
- 发布源：`/srv/yuance/release-source`，HEAD = `5f5ec29f99c324980e4486f933e25795be62bb21`。
- bundle：`/tmp/yuance-production-5f5ec29.bundle`
  - SHA256：`c94cabee73bf2f6dbabe5cdcf3cd96e16dafcc4a1b1676b88d3267156551a0aa`
- 镜像 tar SHA256：`f296cb8d9b912195d7a9f2896b748e082eb95d862f3fdd63bcbfe6c1bb01632c`
- 镜像 ID：`sha256:344874a4f59fcd7ea474f40ed344da67ced098ad0e6178ea5867d6f0c7582f75`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=117 attached=117 orphan=0。
- 主密钥：未变更，部署未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260831124847.tar`
  - `/srv/yuance/backend/backups/20260831044848`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready。
- `/version.json`：`{"version":"20260831124120"}`。
- `GET /static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js`：HTTP 200。
- 最新前端 bundle `index-CiEPZQ_R.js` 已包含 `attachment-preview-document-host`
  与 file-viewer 运行时注册。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。

## 验收步骤

1. 刷新正式环境页面并清除旧 JS 缓存。
2. 分别打开工作项附件、评论附件、资料库附件弹窗，确认 docx/pdf/xlsx/rtf/zip/apk
   由 file-viewer 渲染，不再出现“不支持内嵌渲染”。
3. 图片与视频预览仍走原有媒体预览，不受影响。
