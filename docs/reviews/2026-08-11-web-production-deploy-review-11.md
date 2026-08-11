---
title: Web/API 正式环境部署复核（弹窗 modal-body 滚动与镜像构建 apt IPv4）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（弹窗 modal-body 滚动与镜像构建 apt IPv4）

## 结论

通过。弹窗内容已改为 `.yc-modal-body` 内部滚动，宽弹窗底部“创建”按钮不再被裁掉；
正式镜像构建同时修复 WSL IPv6 不可达导致 `apt-get update` 卡死的问题。

## 问题与根因

- 弹窗无滚动条：`.yc-modal` 原先为普通块级布局，`.yc-modal-body` 没有通过
  flex 布局撑满并收缩，内容超出时 footer 被裁掉且 body 无法滚动。
- 正式构建卡住：WSL 主机 IPv6 不可达，但容器内 apt 解析到 IPv6 后一直等待。

## 修复

- `frontend/packages/ui/src/styles.css`：
  - `.yc-modal` 改为 flex column，`.yc-modal-body` 增加 `flex: 1 1 auto`、
    `min-height: 0`、`overflow: auto`。
- `web/e2e/modal-scroll.spec.mjs`：新增宽弹窗内部滚动、footer 保持可见的回归测试。
- `api/Dockerfile`：最终运行阶段 `apt-get update` 使用
  `-o Acquire::ForceIPv4=true`，避免 WSL IPv6 不可达导致构建卡住。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `eabdbab`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `eabdbab` 后执行
  `./scripts/deploy-production.sh`。
- 包含提交：
  - `dfbedf1` 弹窗内容改为 modal-body 内部滚动并保持底部操作可见。
  - `3118df0` 同步正式发布源历史到 main。
  - `eabdbab` 正式镜像构建 apt 强制 IPv4。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:003a103d683df9c9b8e988b4e1d434814b33897f0f44d7d629e45ea84f986aed`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811180037.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811100037`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- `/web`：303 跳转登录；`/static/auth.css`：200。
- 正式前端样式 `/web/app/assets/index-jn2RkPqy.css`：
  - `.yc-modal` 包含 `display:flex;flex-direction:column`。
  - `.yc-modal-body` 包含 `flex:1 1 auto;min-height:0;overflow:auto`。

## 验收步骤

1. 打开“新建 Bug”等宽弹窗。
2. 弹窗内容超出可视高度时，滚动发生在 `.yc-modal-body` 内，滚动条可见。
3. 滚动到底部时，弹窗 footer（如“创建”按钮）保持可见，不被裁掉。
