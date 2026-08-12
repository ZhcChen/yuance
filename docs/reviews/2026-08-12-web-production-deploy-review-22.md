---
title: Web/API 正式环境部署复核（项目资料详情文件附件显示与预览同步旧版）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（项目资料详情文件附件显示与预览同步旧版）

## 结论

通过。项目资料详情文件附件已恢复旧版文件卡片、扩展名图标与分类配色，富文本附件
上下文菜单和文档预览已同步到正式环境；公网健康检查、迁移、seed、文件对象审计均
正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `f733604`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-f733604.bundle`，scp 到
  WSL 后切换 origin 引用并 ff-only 同步（`b5f0134..f733604`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `b5f0134` 的内容：恢复旧版文件附件卡片、扩展名图标与
  word/sheet/slide/pdf/text/code/archive 分类配色；富文本补齐
  `data-yuance-file-kind` / `data-yuance-file-ext`；资料详情恢复
  `discussion-rich-body` 方言；新增 `RichAttachmentMenu`（预览、下载、复制链接、
  删除）与文档预览站内页；补充共享组件测试与复核文档。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:259c93fcb75574417df8573a35daa52a5cc5e89ad2cdc55efe02904039ea316c`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812115846.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812035846`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- 正式前端资产：
  - `assets/index-B_awAU9o.js`（`/web/app/assets/`）
  - `assets/index-bBNfpiSZ.css`（`/web/app/assets/`）
  - JS 已确认包含 `复制链接`、`下载附件`、`rich-attachment-menu`、
    `data-yuance-file-kind` 等新标记。
  - CSS 已确认包含 `rich-attachment-menu`、`resource-rich-body`、
    `discussion-rich-body` 等新样式。

## 异常与恢复记录

- 部署脚本 `docker compose run` 维护步骤再次复现 Compose 空转：维护容器已退出并
  被 `--rm` 清理，CLI 进程高 CPU 不返回；主 `yuance-api` 期间保持旧镜像
  healthy，公网服务未中断。
- 恢复路径：确认维护容器不存在后终止空转链，改用一次性 `docker run --env-file
  .env` 容器完成 `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查、文件审计与镜像 ID 校验通过。
- 再次建议：正式部署脚本的维护步骤改为一次性 `docker run`，避免继续依赖
  Compose `run` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后打开任意项目资料详情。
2. 确认正文内联文件附件显示旧版文件卡片、扩展名图标与分类配色，点击卡片可
   预览、下载、复制链接、删除。
3. 打开 PDF/TXT/Office 等文档附件，确认进入站内文档预览页并可正常渲染。
4. Desktop 通过共享前端自动同步，无需单独发布。
