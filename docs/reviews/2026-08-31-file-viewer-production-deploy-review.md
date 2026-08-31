---
title: 文档预览栈切换为 Flyfish File Viewer 正式部署复核
type: review
status: completed
date: 2026-08-31
---

# 文档预览栈切换为 Flyfish File Viewer 正式部署复核

## 结论

通过。文档预览栈已切换为 Flyfish File Viewer 并部署正式环境，健康检查、
静态资源路由、数据库迁移与文件审计均通过，容器 running / healthy。

## 本次发布内容

- `906b04e refactor: 文档预览栈整体替换为 Flyfish File Viewer`：
  - API 预览资产改为 `api/static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js`。
  - 前端统一通过 `mountViewer(host, { buffer, filename, type, options })` 渲染预览。
  - 移除旧 PDF.js / SheetJS / legacy-doc / legacy-ppt 栈与实验开关语义。
- `833e34c docs: 更新预览边界交互标记清单移除旧 PDF/实验预览标记`：
  重新生成 parity 清单，删除已移除模板仍残留的
  `data-pdf-*`、`data-preview-experimental`、`data-preview-metric` 标记。

## 部署过程说明

首次部署在 `frontend/parity` 前置检查失败：

- `frontend/test/extract-legacy-experience.test.mjs` 断言旧标记仍被记录；
- 实际模板已删除旧标记，但清单文件未重新生成。

已本地重新生成 `legacy-source-inventory.json` 与
`interaction-marker-classification.json`，`npm --prefix frontend run check`
全量通过后重新发布。

## 发布结果

- 发布版本：`20260831115650`。
- 发布源：`/srv/yuance/release-source`，HEAD = `833e34c2e793715a591e35dded178c4b83d0d25f`。
- bundle：`/tmp/yuance-production-833e34c.bundle`
  - SHA256：`cf640c6cfbe7abae4deaee16f9049de8d65b2eb3ba87d1b6c884f88599c270ec`
- 镜像 tar SHA256：`4d36669cc497f5933478c0cceefbad1a98fb4db06dd1a37f2125d6025c83abf4`
- 镜像 ID：`sha256:49744f7da00aabae3f6501ab51ad3f0ae4d4a47dda2e53dacf3d212998ead811`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=117 attached=117 orphan=0。
- 主密钥：未变更，部署未覆盖
  `/srv/yuance/backend/data/secrets/file_master_key` 与 `.env`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260831120016.tar`
  - `/srv/yuance/backend/backups/20260831040017`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready。
- `/version.json`：`{"version":"20260831115650"}`。
- `GET /static/vendor/file-viewer/flyfish-file-viewer-web-full.iife.js`：HTTP 200，
  `application/javascript`。
- 容器 `yuance-api`：running / healthy，运行镜像为本次发布镜像。

## 验收步骤

1. 刷新正式环境页面，进入资料库预览 PDF / docx / pptx / xlsx。
2. 确认文件由 Flyfish File Viewer 渲染，旧预览工具条与侧栏不再出现。
3. 确认下载/预览不再报错，控制台无 `vendor/{pdfjs,ooxml,sheetjs,...}` 404。
