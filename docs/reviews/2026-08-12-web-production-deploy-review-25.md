---
title: Web/API 正式环境部署复核（工作项详情页讨论区同步）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（工作项详情页讨论区同步）

## 结论

通过。工作项详情页顶部标题/刷新移除、讨论区 UI 与“发表并指派 / 回复并指派”
逻辑已发布到正式环境；公网健康检查、迁移、seed、文件对象审计均正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `28b69ef`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-28b69ef.bundle`，scp 到 WSL 后切换 origin 引用并
  ff-only 同步（`77229ed..28b69ef`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `77229ed` 的内容：
  - 移除详情页全局“工作项详情”标题与刷新按钮；
  - 讨论区恢复“协作记录 / 讨论”头部、彩色头像、评论卡片、发表于/编辑于时间；
  - 评论附件恢复图片/视频缩略图卡片；
  - 主评论/回复恢复“指派后状态”与“发表并指派 / 回复并指派”；
  - 详情 API 增加 `reporter_username`，供讨论并指派使用；
  - 附件区标题同步为“历史资料 / 已有附件”。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:b319eba27ac1e6b9feee15d2df70bb5808f3b0515dd74d85f925dbbb89f335d3`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=66 attached=66 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812160743.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812080743`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任一工作项详情页。
2. 确认顶部不再显示“工作项详情”标题和刷新按钮。
3. 确认讨论区为“协作记录 / 讨论”头部、头像、评论卡片、发表于/编辑于时间，
   图片/视频附件有缩略图卡片。
4. 主评论/回复表单选择“指派后状态”，点击“发表并指派 / 回复并指派”，确认评论
   发布后自动完成状态/负责人流转。
