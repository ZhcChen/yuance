---
title: Web/API 正式环境部署复核（Web 版本更新弹窗机制）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（Web 版本更新弹窗机制）

## 结论

通过。Web 宿主已恢复版本更新弹窗机制：正式入口 HTML 注入实际 release
version，共享 app-shell 提供“发现新版本”弹窗，本地资源更新后提示用户稍后刷新；
公网健康检查、迁移、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `7661033c140f24e3dc5b2c1ff80450ea4fc6b0d3`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-7661033.bundle`（SHA256
  `1bd6797acad6462fe359c9fc29e18bb5c816ddeeed31672c1d023fbd01495f6f`），
  scp 到 WSL 后同步到 `7661033`，随后执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `c3b29fb` 的内容：
  - 服务端 `/web/app` 入口 HTML 注入当前 release version；
  - app-core 新增 `app-update.js` 与单测；
  - shared app-shell 新增“发现新版本”弹窗；
  - web 宿主注入 `readAppReleaseVersion` / `openAppUpdateManifest` /
    `reloadPage` / `subscribeAppUpdateChecks`；
  - E2E `web/e2e/app-update.spec.mjs`。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:7857b85296699a2527208065c1e23558e02bcb9a7f7a5ad9518ce2628b17b0e3`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `61382f62f8208ce20ae7adb8167f3a513a3a063e33fc9f750714cd8c2de9542e`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=84 attached=84 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813113719.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813033719`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web/app/` 入口 HTML：
  `window.__YUANCE_APP_RELEASE_VERSION__ = "20260813112304";`
- `/version.json`：`{"version":"20260813112304"}`。
- `/web/app/assets/index-DCmTFbq5.js`：包含“发现新版本 / 稍后刷新”弹窗文案。

## 验收步骤

1. 打开 `https://yuance.quanxinfu.com`，刷新页面确认不再出现会话恢复占位提示异常。
2. 在本地更新远端发布版本后，Web 页面应检测到新版本并展示“发现新版本”弹窗，
   可点击“稍后刷新”或直接刷新加载新版本。
3. Desktop 通过共享前端自动同步，无需单独发布。
