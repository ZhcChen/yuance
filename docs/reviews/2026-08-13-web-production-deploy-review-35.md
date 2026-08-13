---
title: Web/API 正式环境部署复核（工作项列表状态标签按状态区分颜色）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（工作项列表状态标签按状态区分颜色）

## 结论

通过。工作项列表状态标签已按状态使用不同颜色；本次发布同时包含此前一组弹窗、
富文本与讨论区 UI 调整。公网健康检查、迁移、seed、文件对象审计均正常，容器
running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `e2dbd304a6b00f98f5f1727e68dfad8a3daf5e58`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-e2dbd30.bundle`（SHA256
  `204d4f6aad99444c7d719df6c2bfe6029c9e5b3b878a24e4b3f70670a8af7e5b`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步
  （`22e90f48..e2dbd304`），随后执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `22e90f4` 的内容：
  - 富文本工具栏格式菜单支持悬停自动展开，并修复弹窗 transform 容器内的
    下拉定位偏移；
  - 工具栏下拉按钮移除箭头图标、宽度随内容自适应，下拉菜单改为无边框 + 周边
    阴影并微调下移，后续按验收移除三角指向标；
  - 新建 / 编辑工作项弹窗固定为可视区域 90% 宽高，宽弹窗富文本填满剩余高度，
    消除底部空白；
  - 富文本文字颜色图标重做，颜色面板支持自定义色值；
  - 讨论区移除“写作记录”标题与发布区左侧头像；
  - 工作项列表状态标签按状态使用不同颜色（open / in_progress /
    pending_confirmation / done / verified / resolved / closed / cancelled）；
  - 本地开发入口 `/web` 与 `/web/app` 自动跳转 SPA 基路径（开发配置）。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:ede3de8aa8997e63b765ea1b5ea44bf30610dcb93b0fc5f25adf00d9b0c3542e`，
  构建时间 2026-08-13T13:25:26+08:00。
- 发布版本：`20260813132437`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `b4366d0e552f1e8c18ba4f42fa005d5644f6845c54ba54ebd276c5e5623433fc`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=84 attached=84 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813132529.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813052529`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260813132437"}`。
- `/web`：303 跳转登录页。
- SPA 静态资源：
  - `/web/app/assets/index-BjeExy8_.js`
  - `/web/app/assets/index-D4EPBqQS.css`
- 线上 JS 已确认包含状态 tone 标记（`pending_confirmation`、`sand`、`violet`、
  `neutral`、`danger` 等），确认新列表状态标签产物已上线。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，进入需求 / 任务 / Bug 列表，确认状态
   标签按状态使用不同颜色：open=sand、in_progress=info、
   pending_confirmation=warning、done/verified=success、resolved=violet、
   closed=neutral、cancelled=danger。
2. 新建 / 编辑工作项弹窗应为可视区域 90% 宽高，宽弹窗富文本填满剩余高度且
   底部无空白。
3. 富文本文字颜色面板应支持色板选择与自定义颜色。
4. 讨论区不应再显示“写作记录”标题与发布区左侧头像。
5. Desktop 通过共享前端自动同步，无需单独发布。
