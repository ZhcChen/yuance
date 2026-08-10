---
title: Web 与 Desktop U8 服务端边界页复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U8 服务端边界页复核

## 结论

登录、首次初始化、设备授权、Desktop 下载、共享 app 入口、独立 API docs 和文档预览均属于不承载共享业务状态的服务端边界。它们已登记为受控 `boundary.server-rendered` 宿主差异，并补齐 Browser/Desktop 对应流程证据；manifest 不再存在空证据 `baseline`，本切片通过。

## 边界约束

- 登录、初始化和设备授权继续使用 Askama、Cookie/CSRF 与本地 HTMX；Desktop 使用 device authorization，不嵌入浏览器登录页。
- Desktop 下载页只展示已发布且已上传的资产，下载仍由服务端换取短时签名 URL；Desktop 内部文件保存使用受限原生 capability。
- 文档预览继续由 Rust 校验权限、签名、MIME、Range 和 sandbox，前端模块只消费已授权内容源。
- `/web/app`、`/web/app/` 和资产 route 只承载共享 React bundle；正式业务页面仍只有一个组件树和样式源。
- 所有边界页复用 `/static/auth.css` 中与共享 React 相同的基础 token。下载和预览专用布局已从模板内联 CSS 提取为版本化静态资产，不恢复旧业务 CSS。
- 未引入远程 BrowserWindow、生产 Cookie 注入、macOS Keychain 或 Electron `safeStorage`。

## Manifest 收口

- 新增受控宿主差异枚举 `boundary.server-rendered`，绑定 Browser 与 Desktop 测试证据。
- 6 个边界页面和 7 个边界动作由 `baseline` 更新为 `shared`，并登记 Browser、Desktop 和本 review。
- manifest 完成态测试现在强制所有页面和动作只能为 `shared` 或 `retired`，且三类证据均非空。

## 验证

- `node --test frontend/test/experience-manifest.test.mjs frontend/test/extract-legacy-experience.test.mjs`：11 passed
- `cargo test -p yuance-api --test routing_smoke`：31 passed
- `cargo test -p yuance-api --test auth_security_flow -- --test-threads=1`：45 passed
- `cargo test -p yuance-api --test device_authorization_flow -- --test-threads=1`：8 passed
- `cargo test -p yuance-api --test system_management_flow desktop_downloads_page_exposes_only_published_uploaded_assets -- --test-threads=1`：1 passed
- `cargo test -p yuance-api --test project_management_flow web_work_item_ -- --test-threads=1`：9 passed
- `node --test desktop/test/device-auth-electron-integration.test.mjs desktop/test/renderer-composition.test.mjs desktop/test/business-attachment-coordinator.test.mjs`：23 passed
- Playwright 运行态检查：登录、下载页在 390、768、1280、1440 宽度返回 `200`，截图无重叠或横向溢出；下载页无内联 style；正式共享入口和系统 API docs 均渲染 React root。

## 证据位置

- 运行态截图：`.artifacts/boundary-review/`，仅作本地验证，不纳入版本控制。
- 静态来源与 contract：`frontend/parity/experience-manifest.json`、`frontend/parity/experience-manifest.schema.json`。
