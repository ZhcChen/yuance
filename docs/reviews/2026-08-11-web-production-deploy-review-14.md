---
title: Web/API 正式环境部署复核（工作项列表标题与筛选表单样式）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（工作项列表标题与筛选表单样式）

## 结论

通过。需求、任务、Bug 列表页不再显示重复的顶部“XX列表”标题和刷新按钮；
筛选表单控件、下拉与“搜索 / 重置”按钮统一为紧凑尺寸和 13px 字号。
正式环境已上线。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `440dd47`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `440dd47` 后执行
  `./scripts/deploy-production.sh`。
- 提交：
  - `530b6a6` 移除工作项列表页重复标题与刷新按钮。
  - `440dd47` 压缩工作项列表筛选表单控件尺寸与字体。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:6bf0cf6029fd63d1fd11ff38a84d78f33fab0548a858eb0f361a6c63b7ab758b`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811202750.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811122751`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 正式前端样式 `/web/app/assets/index-B7XEElQf.css`：
  - `.work-item-filter-field input` 为 `height:32px; font-size:13px`。
  - `.work-item-filter-field .yc-select` 为 `height:32px; font-size:13px`。
  - `.work-item-filter-actions .yc-button` 为 `height:32px; font-size:13px`。
- 正式前端脚本 `/web/app/assets/index-DopJc6il.js` 与本地构建一致。

## 验收步骤

1. 登录后打开需求、任务或 Bug 列表页。
2. 页面顶部不应再出现“XX列表”标题和 ↻ 刷新按钮。
3. 筛选输入框、下拉控件与“搜索 / 重置”按钮高度和字号统一，下拉选项文字保持原样。
