---
title: Web/API 正式环境部署复核（帖子详情无附件时隐藏历史资料区）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（帖子详情无附件时隐藏历史资料区）

## 结论

通过。帖子详情在无工作项附件时不再显示评论区下方的“历史资料 / 已有附件”
空区块，行为对齐旧版 `has_attachments` 条件渲染；正式环境公网健康检查、
迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `68cd9a60bd647261dbd8bb9289b44d4f2c81b32b`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-68cd9a6.bundle`（SHA256
  `67141ccd67468e8dd383e7d3e07794450fc295f596337f297590e426ba858482`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`f2b7a57..68cd9a6`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `f2b7a57` 的内容：
  - `WorkItemAttachments` 面板仅在已有附件、上传中、加载/操作状态存在时渲染；
  - 无附件时隐藏“历史资料 / 已有附件”空面板，对齐旧版附件条件区块；
  - 补充 E2E：详情页 mock 附件为空时断言附件面板不出现。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:fb12cc1914c78d50ecd3a9e93a8d076c66d8b83746da736fb9c80593c597700e`，
  构建时间 2026-08-13T09:42:48+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `645a6de82b2531d2971562e690989294d65d54e2f088fb981aa51db15159af34`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=71 attached=71 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813094337.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813014337`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-BWx_xin6.js`
  - `/web/app/assets/index-yBtL_TmG.css`

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开一个无工作项附件的帖子详情页。
2. 确认评论区下方不再显示“历史资料 / 已有附件”区块。
3. 打开一个有工作项附件的帖子详情页，确认“历史资料 / 已有附件”仍正常显示
   并可预览、下载、上传。
