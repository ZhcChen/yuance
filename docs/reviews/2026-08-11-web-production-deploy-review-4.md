---
title: Web/API 正式环境部署复核（粘贴图片 octet-stream MIME 与预览类型统一）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（粘贴图片 octet-stream MIME 与预览类型统一）

## 结论

通过。富文本粘贴图片在剪贴板 `File.type` 为 `application/octet-stream` 或文件头
缺失 MIME 时，仍能按扩展名与文件头识别图片类型；服务端预览内容响应也会在对象
存储 Content-Type 缺失或为通用类型时，按附件登记类型/扩展名返回正确图片 MIME。
修复已发布到 WSL 正式环境，公网健康检查与新前端资产验证通过。

## 问题与修复

- 现象：上一轮“空 MIME 推断”上线后，Web 模块系统复制图片粘贴仍只出现
  `image.png` 文案，没有图片。
- 根因：
  - 上一轮只在 `File.type` 为空时按扩展名推断；剪贴板 File 为
    `application/octet-stream` 时仍被当作普通文件登记和渲染。
  - 即使登记类型被推断为图片，若对象存储实际 Content-Type 仍是
    `application/octet-stream`，预览内容响应带 `X-Content-Type-Options: nosniff`，
    `<img>` 无法加载，浏览器只展示 `alt` 中的文件名文案。
- 修复（`5e99789`，正式主线合并 `6ea7fee`）：
  - Web `createBrowserFilePlatform` 对空类型和 `application/octet-stream`
    统一按扩展名推断，并增加 PNG/JPEG/GIF/BMP/WebP/AVIF/ICO 文件头兜底识别；
    上传签名缺少 Content-Type 时使用推断后的 MIME。
  - Desktop renderer 与主进程 `file-dialog.selectPasted` 同步处理
    `application/octet-stream`，按扩展名推断。
  - API `attachment_preview::kind` 对登记类型为通用 MIME 的图片扩展名启用
    inline 预览；`attachment_preview_content_response` 在对象存储类型缺失或为
    octet-stream 时按登记类型/扩展名归一化响应 Content-Type。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，`main` = `6ea7fee78`。
- 部署 commit 由正式发布源 `main`（`aa5df81`）fast-forward 至 `6ea7fee78`。
- 发布方式：离线 bundle 同步正式 WSL 发布源后执行 `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID `sha256:551f5eb86065c85625cf0a7a858f8b1197ea892294031ffcdc608feeeb6e6054`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260811115126.tar`
  与发布前 SQLite 备份 `20260811035126` 保留。

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 正式前端资产已更新为 `assets/index-CyjIBScf.js`，包含
  `application/octet-stream` 兜底推断与文件头识别逻辑。
- Web `browser-files`、Desktop `file-dialog`/renderer composition 聚焦测试通过；
  Web/Desktop 静态检查通过；Rust `attachment_preview` 及 lib 单测通过。

## 边界与后续

- 正式环境需要用户重新执行“系统复制图片 -> 粘贴到 Web 富文本”验收。
- 历史上已经以普通文件节点保存的旧图片正文，仍保持原 HTML；需要重新插入附件
  后才按图片渲染，不做自动改写存量正文。
