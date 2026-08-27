---
title: Web/API 正式环境部署复核（资料库独立页面并移除时间管理页混入内容）
type: review
status: completed
date: 2026-08-27
---

# Web/API 正式环境部署复核（资料库独立页面并移除时间管理页混入内容）

## 结论

通过。资料库已从时间管理页右侧面板拆分为独立页面，顶部“资料库”入口跳转
`/web/app/projects/{projectKey}/resources`，时间管理页只保留排期。公网健康检查、
迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `9eea6306408aec8c46ec04f48b66493540522120`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-9eea630.bundle`（SHA256
  `893f13ab75648a48c63f531af226ca000ab063092ec42f201d1621082ea7fad5`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`623e3ab..9eea630`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `623e3ab` 的内容：
  - 资料库独立路由 `/web/app/projects/{projectKey}/resources`（兼容
    `/web/projects/{projectKey}/resources`）；
  - 顶部“资料库”入口跳转独立资料库页面；
  - 时间管理页移除右侧资料库面板，只保留排期；
  - 项目详情“时间”tab 只保留排期；
  - 资料详情“返回资料库”、归档后跳转回到独立资料库页；
  - 补充路由解析、单元测试与 E2E 断言。

## 发布结果

- 镜像：`yuance-api:latest`，发布版本 `20260827145104`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `b556b8ec3fdaaed74a65339d9ca608143b54dbf3fefe315fdd7637eb9c641340`。
- 容器：`yuance-api` running/healthy，运行镜像与最新镜像一致。
- 迁移：`migrate status` = applied 32/total 32，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=110 attached=110 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260827145717.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260827065717`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260827145104"}`。
- `/web/app/projects/YCE/resources`：200，返回 SPA 入口。
- 线上 JS `assets/index-BmWRs8BK.js` 已确认包含
  `project-resource-library` 与“项目资料库按当前项目独立展示”标记，确认新路由
  产物已上线。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，点击顶部“资料库”，应进入当前项目的
   独立资料库页面，而不是时间管理。
2. 进入时间管理，页面应只显示排期，不应再出现项目资料库内容。
3. 进入项目详情“时间”tab，应只显示项目时间排期。
4. 在资料库打开资料详情，返回与归档后应回到资料库页面。
5. Desktop 通过共享前端自动同步，无需单独发布。
