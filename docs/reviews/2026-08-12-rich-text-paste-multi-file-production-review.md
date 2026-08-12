---
title: Web/API 正式环境部署复核（富文本多文件粘贴排队上传）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（富文本多文件粘贴排队上传）

## 结论

通过。富文本粘贴附件已恢复为编辑器内上传进度节点；多文件粘贴时所有文件节点
立即显示、上传排队逐个执行，正文附件 URL 与后端校验一致。正式环境公网健康
检查、迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 多文件逻辑说明

- 原版 `insertRichFiles` 会一次插入多个文件节点并同时开始上传。
- 当前 app-shell 的附件上传通道有单飞互斥，因此实现为：多个文件粘贴后全部
  立即显示本地节点；后续文件在通道繁忙时返回 `DEFER_RICH_TEXT_PASTE`，编辑器
  自动等待 200ms 重试（最多 120 次），完成排队上传，不要求用户手动重试。
- 新建工作项未填标题时，节点进入错误态并提示先完善标题；填写标题后节点逐个
  排队上传，主帖正文同时保留多张图片。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `0dad532f427b0118755e1a0d1cff0563082c289f`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-0dad532.bundle`（SHA256
  `ea4a54deb20117cf9ba66af3d18c860cd711bc31ac07fe6ce6359da4cad770ba`），
  同步到正式 WSL 后 ff-only 更新发布源，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `ae6014b` 的内容：
  - 恢复讨论区头像基础样式；
  - 富文本粘贴附件恢复为编辑器内上传进度节点，移除“已暂存 / 填写标题后
    自动上传”的外部提示；
  - 富文本多文件粘贴排队上传，并修正正文附件 URL 为
    `/web/work-items/<key>/comments/<id>/attachments/<id>/download`。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:4690db9d2022c227bf3db1fc50dd7ac901d5149bee74835f7a8db0a3a80a147a`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `2e355607d2edc09731c05d8486dd455bc3198195fba8d930a1831509e0ef2e86`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=67 attached=67 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812174037.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812094037`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-B-QNLf4D.js`：200；
  - `/web/app/assets/index-DZYiToMG.css`：200。

## 本地验证

- `frontend`：`@yuance/frontend-ui` 61 个测试通过；
  `@yuance/frontend-app-shell` 10 个测试通过。
- `web`：`npm run check` 52 个测试通过。
- 聚焦 E2E `work-item-create-paste-auto-upload.spec.mjs` 通过，覆盖“一次粘贴
  两张图片 -> 未填标题错误态 -> 填标题重试 -> 两张依次上传 -> 主帖正文同时
  保留两个附件”闭环。
- desktop `check:renderer` 通过。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，新建 Bug/需求/任务。
2. 在富文本中一次粘贴多张图片：图片节点应立即显示，未填标题时提示先完善标题。
3. 填写标题后，多个节点应逐个排队上传，上传中显示进度，成功后正文保留全部图片。
4. 提交后打开帖子详情，确认多张图片均正常渲染；评论附件同理验证。
