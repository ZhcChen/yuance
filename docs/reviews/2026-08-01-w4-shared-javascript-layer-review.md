---
title: W4 共享 JavaScript 层收口复核
type: review
status: accepted
date: 2026-08-01
---

# W4 共享 JavaScript 层收口复核

## 目标对齐

复核 `docs/plans/2026-07-31-001-refactor-w4-shared-javascript-layer-plan.md` 的 R1-R9、Unit 1-7 和 Browser 生产交付验收，确认共享层不包含 Browser/Electron 宿主副作用，且工作项协作行为在回接后保持一致。

## 已执行验证

- `npm run check:frontend`：Web 32 项单元测试、四个共享 package 检查及根边界测试通过。
- `npm --prefix web run build`：生产 bundle 构建通过，共 56 modules。
- `npm --prefix web run test:e2e`：19/19 Browser E2E 通过。
- `npm --prefix web ls react react-dom --all`：React 19.2.8 单例 dedupe。
- `sh ./scripts/build-api-image-amd64.sh` 与 `sh ./scripts/smoke-web-app-image.sh`：linux/amd64 镜像、入口、资源、manifest、缓存和深链 smoke 通过。
- bundle 扫描未发现 Electron、`node:fs`、`ipcRenderer` 或 `window.yuanceDesktop`。

## 主要发现

### 必须修正的问题

- 首次生产镜像构建发现 Docker stage 未安装 `frontend` workspace，导致 Web 的本地 `file:` package 在隔离环境无法解析。已修复 Docker 安装顺序并增加 `frontend/test/api-dockerfile.test.mjs`。

### 可接受的残留项

- 共享 UI 的 callback 行为主要由 Browser E2E 覆盖，SSR contract 测试聚焦渲染、状态和可访问语义。
- Browser OSS 信任基于严格 virtual-host bucket/endpoint 解析和一次性 capability；Desktop 仍需独立的认证 API `StorageTransferGrant` RFC。

### 建议后续跟进

- 下一切片只规划 D1 device-session/credential RFC。
- 资料库、项目详情、文档预览、富文本高级体验和旧 Askama 下线继续作为独立 W3 切片。

## 结论

- 结论：通过。
- 下一步：进入沉淀，并以 W4 结果作为 D1 RFC 输入；不得据此宣称 Desktop renderer 已具备安全启动条件。
