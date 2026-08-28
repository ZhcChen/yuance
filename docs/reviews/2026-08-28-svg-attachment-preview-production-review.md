---
title: Web/API 正式环境部署复核（资料库 SVG 附件支持站内图片预览）
type: review
status: completed
date: 2026-08-28
---

# Web/API 正式环境部署复核（资料库 SVG 附件支持站内图片预览）

## 结论

通过。服务端附件预览类型白名单已加入 `image/svg+xml`，资料库 SVG 附件可
按图片预览。公网健康检查、迁移、seed、文件对象审计均正常，容器 running 且
运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `b674492e41...`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-b674492.bundle`（SHA256
  `64e008679be1d80a61de2a1dc2b01673b8fc7d374ba215d9b1170ae6fa99d0bc`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`e6f7be4..b674492`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `e6f7be4` 的内容：
  - `api/src/web/attachment_preview.rs`：`is_previewable_image()` 接受
    `image/svg+xml`，`.svg` 文件名映射为 `image/svg+xml`；
  - 新增 SVG 附件预览集成测试 `api/tests/device_business_parity_flow.rs`。

## 发布结果

- 镜像：`yuance-api:latest`，发布版本 `20260828144632`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `6b36a56ed6e8ddec0cf49441e8c1d6ee9068e2f7f8df67c3b58fd13ba243891e`。
- 容器：`yuance-api` running，运行镜像与最新镜像一致。
- 迁移：`migrate status` = applied 32/total 32，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=116 attached=116 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260828150132.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260828070132`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260828144632"}`。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，进入项目资料库，打开资料
   `P260713139801`。
2. 点击其中的 SVG 附件：应弹出附件预览弹窗并渲染图形。
3. 预览弹窗不应再显示“此文件类型不支持预览”。
4. 图片查看器缩放/旋转等控制应正常。
