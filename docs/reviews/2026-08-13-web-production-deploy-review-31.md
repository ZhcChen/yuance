---
title: Web/API 正式环境部署复核（富文本移除正文附件操作区）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（富文本移除正文附件操作区）

## 结论

通过。富文本编辑器下方原版不存在的“插入正文 / 移除引用”附件操作区已移除，
富文本仍保留正文内附件渲染、粘贴上传与上传进度展示；正式环境公网健康检查、
迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `152eecebe0d993f7cddfdbedf9ea414914403a9a`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-152eece.bundle`（SHA256
  `f0fd791955539a153fc42d44ffd2f0e9ab17258d87d1c30e564eaf0b581585ac`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`f494254..152eece`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `f494254` 的内容：
  - `RichTextEditor` 删除 `attachments`、`onRequestRemoveAttachment` props、
    `attachmentIds` 状态及富文本下方附件操作区；
  - 工作项详情编辑弹窗不再传递主内容附件删除上下文；
  - 项目资料编辑富文本不再展示正文附件操作区；
  - 删除 `.yc-rich-text-attachments` 样式与对应测试断言；
  - 资料编辑 E2E 改为直接在正文内删除附件引用，保留正文附件能力。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:6f8a665f3d38ba85a3c6bbfb755633bc77b639f3b084ec18b965b5d9f218660f`，
  构建时间 2026-08-13T10:42:05+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `63fa356f7a52db0c175433edb4f494ff2cdc743f0041e5fce3748100fc5fd0cb`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=76 attached=76 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813104208.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813024208`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-ZgIQCsyE.js`
  - `/web/app/assets/index-CQNByqUI.css`
- 线上 JS/CSS 已确认不包含 `yc-rich-text-attachments` 与 `移除引用` 标记。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开帖子详情编辑弹窗、新建工作项或
   项目资料编辑弹窗，确认富文本下方不再出现“插入正文 / 移除引用”附件操作区。
2. 在富文本内粘贴图片，确认仍只出现一个上传节点、只上传一次，并最终插入正文。
3. 项目资料编辑仍可在正文中保留、删除附件引用，正文附件展示不受影响。
4. Desktop 通过共享前端自动同步，无需单独发布。
