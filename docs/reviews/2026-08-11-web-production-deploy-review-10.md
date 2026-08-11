---
title: Web/API 正式环境部署复核（未填标题粘贴图片立即显示与签名 content-length 修复）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（未填标题粘贴图片立即显示与签名 content-length 修复）

## 结论

通过。未填标题时粘贴图片会立即在富文本正文显示本地预览，填写标题后自动上传；
Web 上传签名接受 `content-length` 请求头，“签名请求头不受支持：content-length”
导致的创建失败已修复并上线。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，`main` = `706e22ff`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `706e22ff` 后执行
  `./scripts/deploy-production.sh`。
- 包含修复：
  - `7d6a9d6` 新建工作项未填标题时粘贴图片立即显示并自动上传。
  - `9e3a0f1` Web 上传接受签名中的 `content-length` 请求头。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:2c8839d682f7d2f5bbb02f214f137315402ff90a7b8ccc38c58e242c287ec89c`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811170822.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811090822`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- `/web`：303 跳转登录；`/static/auth.css`：200。
- 新前端资产 `/web/app/assets/index-CT33mgmu.js`：
  - 包含“图片已加入正文，填写标题后将自动上传。”
  - 包含 `content-length` 与“签名请求头不受支持”，确认签名头兼容逻辑已上线。

## 验收步骤

1. 新建 Bug，不填标题，系统复制图片后粘贴到“说明内容”。
2. 正文应直接显示图片（本地预览），提示“图片已加入正文，填写标题后将自动上传。”。
3. 填写标题，应自动上传图片，不再出现“签名请求头不受支持：content-length”。
4. 上传完成后点击“创建”，详情主帖应显示正式图片。
