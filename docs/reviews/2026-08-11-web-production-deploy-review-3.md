---
title: Web/API 正式环境部署复核（粘贴图片 MIME 推断修复）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（粘贴图片 MIME 推断修复）

## 结论

通过。富文本粘贴图片在剪贴板未携带 MIME 类型时按文件扩展名识别图片类型的
修复已发布到 WSL 正式环境，公网健康检查与新前端资产验证通过。

## 问题与修复

- 现象：系统复制图片后粘贴，编辑器只出现 `image.png` 文案，没有图片。
- 根因：部分系统/应用复制图片时剪贴板 File 未携带 MIME 类型；Web 宿主直接
  落为 `application/octet-stream`，Desktop renderer 也提前补默认类型，导致
  主进程无法按扩展名推断，富文本把图片当作普通文件附件渲染。
- 修复（`de104f0`）：
  - Web `createBrowserFilePlatform` 在 `File.type` 为空时按扩展名推断图片 MIME。
  - Desktop renderer 不再补 `application/octet-stream`，交由主进程
    `file-dialog.selectPasted` 按扩展名推断。
  - 两个宿主补齐常见图片扩展名映射（png/jpg/jpeg/gif/webp/avif/bmp/svg/ico）。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，`main` = `05a02e8`。
- 部署 commit 由正式发布源 `main`（`64cdc48`）合并当前 `dev`（`de104f0`）生成。
- 发布方式：离线 bundle 同步正式 WSL 发布源后执行 `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID `sha256:6ae51eea1a81...`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：30/30 无新增，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260811110932.tar`
  与发布前 SQLite 备份 `20260811030933` 保留。

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- `/web`：303 跳转登录。
- 正式前端资产已更新为 `assets/index-DevIbOag.js`，包含新增的
  `image/webp`、`image/avif` 扩展名推断映射。
- Web `browser-files` 与 Desktop `file-dialog` 聚焦测试通过，Web/Desktop
  静态检查通过。
