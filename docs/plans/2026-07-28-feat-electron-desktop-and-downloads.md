---
title: feat: Electron 桌面端与版本下载分发
status: active
date: 2026-07-28
origin: 用户口头需求：以 Electron 初始化 0.1.0 桌面端，接入跨平台原生通知、GitHub Actions 构建、system OpenAPI 发布及 Web 下载页
---

# feat: Electron 桌面端与版本下载分发

## Overview

新增 `desktop/` Electron 工程，以 Chromium 直接加载现有元策 Web UI，避免重新实现业务页面和文档预览。首个版本为 `0.1.0`，支持 macOS、Windows、Linux 的 `x64` 与 `arm64` 安装包，macOS 使用 ad-hoc 签名。

同时扩展系统版本管理的版本资产模型，使操作系统和 CPU 架构均为明确字段；新增无顶部导航栏的公开下载页、桌面端下载入口、GitHub Actions 构建发布流程，以及通过 system OpenAPI 发布 OSS 版本资产的脚本。

## Requirements Trace

- R1：初始化 `desktop/` Electron 工程，桌面 UI 直接复用现有 Web UI。
- R2：桌面应用版本为 `0.1.0`，并接入 macOS、Windows、Linux 原生系统通知。
- R3：macOS 产物使用 ad-hoc 签名。
- R4：GitHub Actions 构建 macOS、Windows、Linux 的 `x64` / `arm64` 共六类安装包，并创建 GitHub Release。
- R5：发布脚本按版本获取构建产物，通过 system OpenAPI 创建、上传并发布系统版本。
- R6：系统版本资产可明确记录 `platform + architecture`，而非从文件名推断。
- R7：Web 顶部项目切换组件左侧新增桌面端下载入口，在新标签页打开无顶部导航栏的下载页。
- R8：下载页提供 Windows、macOS、Linux 的 `x64` / `arm64` 安装包入口，并只暴露服务端签发的短时下载地址。

## Key Decisions

- **Electron 只作为受限桌面壳。** `BrowserWindow` 加载配置的 Web 地址，保留 Askama 模板、原生 JavaScript、PDF.js、SheetJS 和 OOXML 浏览器渲染链路。
- **原生能力只通过受限 preload 暴露。** 使用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；仅允许受信 Web 源调用原生通知，并限制外链、新窗口、导航和通知点击目标。
- **版本资产单独建模架构。** 新增 `x64`、`arm64`、`universal` 枚举值，历史资产迁移为 `universal`；桌面发布严格要求六个 `platform + architecture` 组合。
- **下载页读取最新已发布桌面版本。** 页面不显示全局导航；每个下载操作先访问本服务，再由服务端重定向到短时 OSS 签名 URL。
- **GitHub Release 是构建资产来源。** 标签采用 `desktop-v<semver>`；发布脚本默认从对应 GitHub Release 下载，也允许通过环境变量指定本地资产目录。
- **首期不实现桌面端自动更新。** 当前交付覆盖安装包构建、分发、原生通知和 Web 复用；自动更新协议在发行链路稳定后单独规划。

## Implementation Units

### Unit 1：系统版本资产架构与下载页（已完成）

- 新增迁移，为 `system_release_assets` 添加 `architecture`。
- 更新领域模型、系统管理 API、system OpenAPI、系统版本管理页面和上传脚本调用。
- 提供已发布版本查询和公开下载跳转；仅允许已上传资产下载。
- 新增 `/web/downloads` 下载页和 `/web/downloads/{release_id}/assets/{asset_id}` 下载跳转。
- 在 `layouts/web.html` 的项目切换器左侧加入 `target="_blank"` 下载入口。
- 覆盖系统 API 架构字段、公开下载页和下载跳转的 Rust 集成测试。

### Unit 2：Electron 0.1.0 桌面工程

- 创建 `desktop/` 的 npm 工程、主进程、preload、开发启动与打包配置。
- 默认加载正式 Web 地址，并允许本地通过环境变量覆盖。
- 将 Web 实时通知流桥接到 Electron 原生通知；通知点击恢复窗口并导航到受限的站内页面。
- 提交 macOS、Windows、Linux 图标，macOS 配置 `identity: "-"` 进行 ad-hoc 签名。
- 为纯配置与发行资产解析逻辑添加 Node 测试。

### Unit 3：GitHub Actions 与 system OpenAPI 发布脚本

- 新增 `.github/workflows/release-desktop.yml`，以 `desktop-v*.*.*` 标签触发六项构建矩阵。
- 发布 `dmg`、`exe`、`AppImage` 六个标准命名资产到 GitHub Release。
- 新增 `scripts/publish-desktop-release.mjs`：验证版本、定位资产、创建草稿、申请 OSS 上传地址、上传、确认、发布。
- 新增 `docs/runbooks/desktop-release-publication.md`，定义：
  - `YUANCE_API_BASE_URL`
  - `YUANCE_SYSTEM_API_TOKEN`
  - `YUANCE_DESKTOP_VERSION`
  - `YUANCE_GITHUB_REPOSITORY`
  - `YUANCE_GITHUB_TOKEN` / `GH_TOKEN`
  - `YUANCE_DESKTOP_RELEASE_TAG`
  - `YUANCE_DESKTOP_ASSET_DIR`
  - `YUANCE_RELEASE_TITLE`
  - `YUANCE_RELEASE_NOTES` / `YUANCE_RELEASE_NOTES_FILE`

### Unit 4：验证、审查与交付

- 运行 `cargo fmt --all`、版本管理相关 Rust 测试、Node 测试和 `git diff --check`。
- 在本地浏览器验证下载页的桌面与移动尺寸、缺失资产状态与下载链接。
- 验证 Electron 开发壳可加载 Web 页面，且原生通知桥接的权限边界正确。
- 完成独立审查，按审查结果修正后分阶段提交、同步并推送。

## Risks

- 未签名 Windows 与 Linux 安装包可能被系统提示来源未知；本次只要求 macOS ad-hoc 签名，后续需引入平台证书与公证流程。
- GitHub Actions 的 `windows-11-arm`、`ubuntu-24.04-arm` runner 可用性依赖 GitHub 账户计划；工作流保留独立矩阵项并应在首个标签发布时验证。
- ad-hoc 签名不等于 Apple notarization，macOS 首次启动仍可能需要用户确认。
- 公开下载页意味着任何可访问页面的人都可取得当前已发布安装包；若后续需要授权下载，应单独增加下载权限和登录门槛。

## Verification

- `cargo fmt --all -- --check`
- `cargo test -p yuance-api system_release`
- `npm --prefix desktop test`
- `npm --prefix desktop run check`
- `node --check scripts/publish-desktop-release.mjs`
- `git diff --check`
