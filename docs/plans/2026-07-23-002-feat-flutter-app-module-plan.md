---
title: feat: Flutter 多端 app 模块规划
type: plan
status: active
date: 2026-07-23
origin: 用户口头需求：新增 app 模块，使用 Flutter 支持 Windows / macOS / Linux / Android / iOS
---

# feat: Flutter 多端 app 模块规划

## Overview

在当前仓库中新增 `app/` 模块，使用 Flutter 构建元策桌面端与移动端统一代码库，目标覆盖 `Windows / macOS / Linux / Android / iOS`。`api/` 继续作为现有 Web 与业务后端，`app/` 作为独立客户端工程，与后端通过既有 API 和后续补充的 app / system API 协作。

## Problem Frame

当前仓库只有 `api/` Web 应用，没有原生桌面端与移动端承载形态。后续如果需要把需求、任务、Bug、资料库、消息通知、版本升级等能力扩展到桌面和手机，需要一套统一的客户端工程结构、构建发布方案和与现有后端的契约边界。由于仓库已开源、构建走 GitHub Actions，而私有化版本分发要上传到 OSS，因此 app 模块的构建链路还需要与系统管理中的“版本管理”能力对接。

## Scope Boundaries

- 本文档只定义 `app/` 模块的第一阶段技术规划，不在本轮直接实现 Flutter 代码。
- 不在第一阶段同时接入桌面端自动更新、灰度发布、崩溃上报、埋点分析。
- 不在第一阶段支持 Web Flutter 版本；当前客户端范围仅桌面 + 手机。
- 不在第一阶段引入复杂插件市场、模块热更新或多租户离线同步。

## Requirements Trace

- R1：仓库新增 `app/` 模块，技术栈为 Flutter。
- R2：一套代码库支持 `Windows / macOS / Linux / Android / iOS`。
- R3：GitHub Actions 可对多平台构建产物进行打包。
- R4：构建产物未来可接入系统管理中的版本管理，上传到 OSS 做私有分发。
- R5：app 模块与 `api/` 解耦，按明确 API 契约通信。
- R6：规划必须考虑登录态、消息通知、项目/工作项/资料查看和后续版本升级提示能力。

## Context & Research

### Relevant Code and Patterns

- `api/`：当前元策核心业务后端，后续 app 端默认复用其认证、项目、工作项、资料库、消息等接口能力。
- `docs/openapi/yuance.openapi.json`：当前普通业务 OpenAPI 契约，可作为 app 端第一阶段的接口基础。
- `docs/mcp/`：现有 MCP / OpenAPI 文档沉淀方式，后续 app 文档也应延续同类结构化说明。
- `docs/runbooks/production-deployment.md`：现有服务端部署口径；app 构建发布不应侵入当前正式环境部署脚本。

### External References

- Flutter 官方文档说明单代码库可部署到 `iOS / Android / Web / Windows / macOS / Linux`，并分别提供 `flutter build windows`、`flutter build macos`、`flutter build linux`、`flutter build appbundle`、`flutter build ios --release --no-codesign --config-only` 等发布入口。
- GitHub Actions 官方文档建议对多平台构建使用 `strategy.matrix`，并通过 `actions/upload-artifact` 在 job 之间或工作流完成后共享构建产物。

## Key Technical Decisions

- **客户端工程独立为仓库根目录 `app/`。** 不把 Flutter 工程嵌入 `api/` 子目录，避免工具链与 Rust 服务相互污染。
- **第一阶段按“统一 UI + 平台分层适配”设计。** 业务状态、接口访问、富文本渲染、消息列表等放共享层；平台差异集中在存储、推送、文件打开、安装包分发与未来自动更新。
- **接口访问优先复用现有业务 OpenAPI 契约。** 不先做第二套 app-only 业务 API；只有桌面/移动端特有能力（如版本检查、设备登记）才新增专门接口。
- **构建产物与系统版本管理解耦。** GitHub Actions 负责构建和产物归档；是否写入系统版本管理，由后续 system OpenAPI / Token 决定。
- **桌面与移动端的发版入口保持统一版本号语义。** 后续版本管理按“一个业务版本 + 多平台产物”建模，而不是每个平台各自一套版本体系。

## Recommended Module Layout

```text
app/
  lib/
    app/
    core/
    features/
      auth/
      dashboard/
      projects/
      work_items/
      resources/
      notifications/
      settings/
      updates/
    shared/
  test/
  integration_test/
  android/
  ios/
  macos/
  linux/
  windows/
```

## Planned Phases

### Phase 1：工程底座

- 初始化 Flutter 多平台工程与基础目录结构。
- 接入主题、路由、HTTP client、环境配置、日志与错误处理。
- 定义 API client 封装、分页模型、统一错误提示和本地缓存策略。

### Phase 2：业务最小闭环

- 登录 / 退出登录。
- 当前项目上下文切换。
- 工作项列表、详情、评论、消息中心。
- 资料库列表、详情查看。

### Phase 3：平台增强

- 桌面端文件打开 / 下载。
- 移动端分享与系统文件选择。
- 版本检查与安装包下载入口。
- 推送 / 本地通知（按平台分阶段接入）。

## GitHub Actions / Release Integration

- 新增独立 app workflow，不改动当前 `api` 正式环境部署脚本。
- 推荐按平台矩阵拆 job：
  - `ubuntu-latest`：Linux / Android
  - `macos-latest`：macOS / iOS
  - `windows-latest`：Windows
- 每个 job 产出标准化文件名，并通过 `actions/upload-artifact` 汇总。
- 后续增加一个 release 汇总 job，把产物元数据整理为 manifest，再写入系统版本管理。

## Risks & Dependencies

- iOS/macOS 发布依赖 Apple 签名体系；第一阶段只能保证构建链路规划，不保证开箱即用发布。
- Flutter 富文本、附件预览、离线文档预览在移动端与桌面端的体验差异较大，需要单独设计交互适配。
- 当前后端以 Web 形态优先，后续 app 若需要更细粒度 API，可能要补专门的分页 / 聚合 / 版本检查接口。

## Follow-up Implementation Units

- Unit 1：创建 `app/` Flutter 工程与基础目录规范。
- Unit 2：接入 API client、鉴权与本地持久化。
- Unit 3：落地工作台 / 项目 / 工作项 / 消息最小业务流。
- Unit 4：接入版本管理查询与安装包下载能力。
- Unit 5：补 GitHub Actions 多平台构建与产物汇总。
