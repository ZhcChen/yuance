---
title: Web/API 正式环境部署复核（资料库页面占满宽度并移除返回项目卡片）
type: review
status: completed
date: 2026-08-27
---

# Web/API 正式环境部署复核（资料库页面占满宽度并移除返回项目卡片）

## 结论

通过。资料库页面主内容已占满剩余屏幕宽度，并移除包含“返回项目”按钮的顶部
hero 卡片。公网健康检查、迁移、seed、文件对象审计均正常，容器 running/healthy
且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `e6f7be48d4...`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-e6f7be4.bundle`（SHA256
  `1075f1a9a6bf8f97ddcb9e6a479bd0856603d365724488b876e6c50225237293`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`9eea630..e6f7be4`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `9eea630` 的内容：
  - 移除资料库页顶部“返回项目”hero 卡片容器；
  - 资料库页面与资料库面板改为 `min-width: 0; width: 100%`，主内容占满剩余
    宽度；
  - E2E 增加断言：资料库页不再有“返回项目”链接，页面宽度大于 1200px。

## 发布结果

- 镜像：`yuance-api:latest`，发布版本 `20260827151625`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `e5fd803d4213e312c74e49f76ab1da8e72321e357a19d98a2075ba03305a780f`。
- 容器：`yuance-api` running/healthy，运行镜像与最新镜像一致。
- 迁移：`migrate status` = applied 32/total 32，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=110 attached=110 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260827151717.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260827071717`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260827151625"}`。
- `/web/app/projects/YCE/resources`：200，返回 SPA 入口。
- 线上 CSS `assets/index-DYhEpF3U.css` 已确认包含
  `.project-resource-library-page{min-width:0;width:100%}`，确认全宽样式已上线。
- 线上 JS `assets/index-BLegUvmc.js` 已确认包含 `project-resource-library`
  路由标记。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，进入项目资料库。
2. 资料库主内容应占满主区域剩余宽度，不再出现左侧留白。
3. 页面顶部不应再出现包含“返回项目”按钮的 hero 卡片。
4. Desktop 通过共享前端自动同步，无需单独发布。
