---
title: Web/API 正式环境部署复核（富文本粘贴图片与弹窗样式）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（富文本粘贴图片与弹窗样式）

## 结论

通过。Web/API 单体已按正式部署规范发布到 WSL 正式环境，公网健康检查、
富文本粘贴图片能力与共享弹窗样式资产均已验证上线。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，`main` = `64cdc48`。
- 部署 commit 由正式发布源 `main`（`cd92dc5`）合并当前 `dev`（`fd2dd60`）生成，
  包含富文本直接粘贴图片并上传为附件（`947e6ce`）与共享表单弹窗宽高/滚动条样式
  同步（`fd2dd60`）。
- 发布方式：离线 bundle 同步正式 WSL 发布源后执行 `./scripts/deploy-production.sh`，
  WSL 原生 Docker 构建 `linux/amd64` 镜像并发布。
- 未推送 GitHub `origin/main`，正式发布源与 GitHub 主线的同步继续留待主线回填阶段
  决策，与上一轮部署策略保持一致。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID `sha256:f83a8b223c1c...`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：`/srv/yuance/releases/yuance-api-linux-amd64.before-20260811104918.tar`
  与发布前 SQLite 备份 `20260811024918` 保留。

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok。
- `https://yuance.quanxinfu.com/api/readyz`：200，environment production。
- `GET /web`：303 跳转登录。
- `GET /static/auth.css`：200。
- 正式前端资产 `assets/index-CkPzsvUU.js`：
  - 包含 `selectPastedFile`、`uploadWorkItemAttachment`、`粘贴附件上传失败`，
    确认富文本粘贴图片上传链路已上线。
  - 包含 `yc-modal-wide`，确认共享弹窗宽高变体已上线。
- 正式前端样式 `assets/index-zEfH5XQF.css`：
  - 包含 `.yc-modal-wide` 与 `.yc-rich-text-input` 的宽高/滚动条样式。

## 边界与后续

- 正式 WSL 访问能力重新验证可用（`qfy-test`，WSL2 原生 Docker）。
- 受限 `system_release:read/write` token 仍未配置；与本次 Web 部署无关，
  继续 G-DIST-DEV R2 前仍需创建专用 system token。
