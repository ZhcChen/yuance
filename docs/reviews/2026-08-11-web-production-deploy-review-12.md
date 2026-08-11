---
title: Web/API 正式环境部署复核（关闭弹窗误渲染回归修复）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（关闭弹窗误渲染回归修复）

## 结论

通过。上一轮给 `.yc-modal` 直接设置 `display: flex` 导致关闭状态的
`<dialog>` 也被渲染出来，页面底部出现多个弹窗残留；本轮已改为仅对
`[open]` 的 dialog 启用 flex，并部署上线。

## 问题与根因

- 上一轮 CSS 为 `.yc-modal` 设置了 `display: flex; flex-direction: column`。
- 该作者样式覆盖了浏览器 UA 对关闭 dialog 的 `display: none`，因此所有
  常驻在 React 组件树中的关闭弹窗都参与布局并显示在页面底部。
- 复现证据：页面中关闭的 `.yc-modal` 计算样式为 `display: flex`、
  `position: absolute`，多个弹窗 box 堆叠在视口底部。

## 修复

- `frontend/packages/ui/src/styles.css`：
  - `.yc-modal` 不再直接设置 `display`。
  - 新增 `.yc-modal[open] { display: flex; flex-direction: column; }`，
    仅打开状态使用 flex 布局。
- `web/e2e/modal-scroll.spec.mjs`：
  - 新增断言：打开“新建 Bug”后，所有未打开的 `.yc-modal` 计算样式必须为
    `display: none`。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `33cbd89`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `33cbd89` 后执行
  `./scripts/deploy-production.sh`。
- 提交：`33cbd89` 仅打开的 dialog 启用 flex，避免关闭弹窗被渲染出来。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:0df78cd1bc4492f55db3664af617a9cd386ff86b942eb36332df8c22a9341145`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811180751.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811100751`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 正式前端样式 `/web/app/assets/index-CiS8Xtg2.css`：
  - `.yc-modal` 不再包含 `display: flex`。
  - 包含 `.yc-modal[open] { display:flex; flex-direction:column }`。

## 验收步骤

1. 硬刷新线上 Web 页面（CSS 资产已更新为 `index-CiS8Xtg2.css`）。
2. 打开任意弹窗，页面底部不应再出现其他关闭弹窗残留。
3. 弹窗内容超高时仍由 `.yc-modal-body` 内部滚动，footer 保持可见。
