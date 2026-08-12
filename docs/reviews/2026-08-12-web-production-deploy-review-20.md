---
title: Web/API 正式环境部署复核（附件图片/视频弹窗预览同步旧版）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（附件图片/视频弹窗预览同步旧版）

## 结论

通过。共享附件预览已按旧版 image-viewer 的样式与交互逻辑发布到 WSL 正式环境，
公网健康检查、迁移、seed、文件对象审计均正常，正式前端资产包含全屏预览、
缩放/旋转/拖拽/长图适宽工具栏等新标记。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `bcae16b`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-bcae16b.bundle`，
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `ec726bc` 的内容：`AttachmentPreview` 重写为旧版全屏
  image-viewer（缩放、旋转、拖拽、适屏/适宽、加载失败降级），同步共享样式
  与单测，并补充复核文档。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:b3ab52f82904ef14dd040a97eb16bb0bf6efc2277771d1ab9ae3938d7f2fff52`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812094647.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812014648`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- 正式前端资产：
  - `assets/index-DVB_7KZD.js`
  - `assets/index-b3cQe7nF.css`
  - JS 已确认包含 `attachment-preview-toolbar`、`适宽查看`、
    `正在准备媒体`、`关闭媒体预览` 等新查看器标记。
  - CSS 已确认包含 `.attachment-preview-modal`、`.attachment-preview-toolbar`、
    `.attachment-preview-pan[data-draggable]` 等新样式。

## 异常与恢复记录

- 部署脚本 `docker compose run` 维护步骤再次复现 Compose v5.3.1 卡死：维护
  容器已完成迁移/seed 并被 `--rm` 清理，CLI 进程空转不返回。
- 未等待 900 秒超时：确认维护容器不存在后，直接终止卡死的
  `timeout` / `docker compose` 链；主 `yuance-api` 在恢复期间保持旧镜像运行，
  公网服务未中断。
- 手工恢复：使用一次性 `docker run --env-file .env` 容器完成
  `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查、文件审计与镜像 ID 校验通过。
- 建议将正式部署脚本的维护步骤改为一次性 `docker run`，避免继续依赖 Compose
  `run` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后打开任意图片附件，确认全屏深色预览、
   底部圆形工具栏、滚轮缩放、双击切换、拖拽平移与旋转。
2. 打开长图，确认“适宽/适屏”切换可用。
3. 打开视频附件，确认视频原生播放器正常、图片操作按钮隐藏。
4. Desktop 通过共享前端自动同步，无需单独发布。
