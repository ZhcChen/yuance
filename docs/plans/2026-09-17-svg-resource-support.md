---
artifact_contract: ce-unified-plan/v1
product_contract_source: legacy-requirements
execution: code
title: 资料库 SVG 流程图附件支持
date: 2026-09-17
---

## Goal Capsule

**Objective:** 用户可以在资料库中上传、预览和下载包含中文文字及常见流程图元素的 SVG 文件，且恶意 SVG 不会在浏览器中执行；现有资料正文、Markdown、HTML、代码块和普通图片行为保持不变。

**Means:** 以资料附件作为主渲染入口，在附件上传完成阶段进行内容校验，并对历史资料中明确包裹在 `<details><pre><code>` 内的 SVG 源码执行同一套安全校验后转为受控图片展示；不开放任意正文内联 SVG（KTD1）。

**Authority:** 用户给出的 SVG 支持需求和验收标准优先，其次是本仓库 `AGENTS.md`、现有 API/前端实现和正式环境运行手册。实现细节以本计划为准。

**Stop conditions:** 附件安全校验、预览/下载、skill 能力同步和聚焦验证全部完成；若发现现有存储适配器无法在上传完成阶段读取对象，必须记录为阻塞并先补齐受控读取能力，不得绕过校验直接发布。

## Product Contract

### Summary

为资料库增加可安全使用的 SVG 流程图能力。用户上传 SVG 后，可以在资料详情中通过现有附件预览入口直接查看图形，也可以继续下载原文件；历史正文中明确标记的 SVG 源码块也能在安全校验通过后直接显示图形，正文引用仍可通过附件图片占位符完成。

### Problem Frame

当前文件类型判断已经把 `image/svg+xml` 视为图片，但服务端 HTML 清洗器删除正文内联 SVG，且上传完成没有校验 SVG 内容。结果是流程图只能以源码文本存在，或者存在潜在的脚本/外部资源执行风险。

### Requirements

- **R1**：资料附件允许登记并上传 `image/svg+xml`，同时保留现有文件大小上限和普通附件行为。
- **R2**：SVG 上传完成时必须读取实际对象内容，校验 XML/SVG 结构和安全规则，不能仅信任请求 MIME；不符合规则的对象不得进入可用状态。
- **R3**：至少拒绝或移除 `<script>`、事件属性、`javascript:` URL、外部脚本/资源、`foreignObject`、表单/嵌入内容和不受控引用。
- **R4**：保留流程图所需的 `svg`、`g`、`rect`、`path`、`line`、`polyline`、`polygon`、`circle`、`text`、`marker`、`defs`、受限 `style` 等元素/属性，并支持中文文本。
- **R5**：资料附件预览接口和详情页可以直接在浏览器内展示安全 SVG，且仍提供下载入口。
- **R6**：正文可以通过现有附件图片占位符引用 SVG；历史 `<details><pre><code>` SVG 源码块可安全转换为图片，不开放任意正文内联 SVG。
- **R7**：普通资料正文、Markdown、HTML、代码块和普通图片渲染不回归；已有附件不因本次变更被破坏。
- **R8**：本机 `yuance-agent` skill 与项目 OpenAPI/实际接口同步，至少支持资料附件的本地文件上传闭环和预览查询，失败时返回可诊断错误。
- **R9**：恶意 SVG 的自动化测试覆盖脚本、事件属性、危险 URL、外部资源、`foreignObject` 和合法流程图样例。

### Acceptance Examples

- 上传包含矩形、箭头、连线和中文文字的 SVG，资料详情页显示完整图形。
- SVG 包含 `<script>` 或 `onclick`/`onload` 时被拒绝或安全删除，响应和日志不泄漏原始危险内容。
- SVG 附件可下载，下载内容仍符合上传完成时的安全策略。
- 正文不再只能显示大段 SVG 源码；图片占位符能打开 SVG 预览。
- 既有普通图片、代码块和 HTML 资料的现有测试继续通过。

### Scope Boundaries

本次包含服务端安全校验、资料附件 SVG 预览确认、必要的前端回归测试、OpenAPI/skill 能力同步和相关文档。不包含全局正文内联 SVG 放开、通用 SVG 编辑器、SVG 转 PNG、其他工作项/评论附件的新产品能力扩展。

## Planning Contract

### Key Technical Decisions

- **KTD1：SVG 以附件预览为主，仅兼容明确标记的历史源码块。** 任意正文内联 SVG 仍不放开；历史源码块先安全校验，再转为受控 `data` 图片。
- **KTD2：安全校验在上传完成边界执行。** 预签名上传后由服务端读取对象并校验，再把状态从 `pending` 转为 `uploaded`/可用，避免只在前端或创建占位时判断。
- **KTD3：复用现有对象存储抽象和资料预览 API。** 不新增独立文件服务；SVG 与普通图片共用鉴权、下载、预览和加密对象链路。
- **KTD4：skill 封装真实 API 闭环。** CLI 负责创建占位、获取上传 URL、传输本地字节、确认上传和查询预览；不能把“拿到签名 URL”误报为上传成功。

### High-Level Technical Design

```text
本地文件
  -> yuance-agent 创建资料附件占位
  -> 获取受控上传 URL
  -> skill 上传字节到签名地址
  -> API uploaded 回调
       -> 读取对象 -> SVG 内容安全校验
       -> 合法: 标记可用 / 非法: 拒绝并清理或保持失败态
  -> 资料详情附件预览 API
       -> 鉴权 -> 安全内容 -> 浏览器 SVG image 预览
```

安全决策链：MIME/大小初筛 -> XML 解析 -> 元素/属性白名单 -> URL/CSS/引用检查 -> 存储状态提交。任何一步失败都不能进入可预览状态。

### Assumptions and Constraints

- 现有资料附件 API、对象存储配置和浏览器预览组件继续作为兼容基础。
- 服务器不执行源码编译或镜像构建；正式发布遵循 `docs/runbooks/production-deployment.md`。
- SVG 校验必须有明确大小/复杂度边界，避免 XML 炸弹、超大文本节点或异常深度导致资源耗尽。
- 是否“拒绝”还是“清洗后保存”按现有文件完整性和下载语义选择；默认优先拒绝危险内容，避免用户下载到与原始文件不一致的内容。

### Sequencing

先完成服务端校验和测试，再接入前端预览回归，最后同步 OpenAPI/skill 并做全链路验证。任何前置单元失败时停止后续发布，不通过放宽清洗器来临时绕过。

## Implementation Units

### U1. SVG 安全校验与上传完成接入

- **Goal:** 在资料附件上传完成阶段验证 SVG 实际内容并阻止危险对象。
- **Requirements:** R1, R2, R3, R4, R9
- **Files:** `api/src/domains/files.rs`、上传完成处理器及其测试、必要的 `Cargo.toml`/锁文件、相关迁移或错误定义（仅在确有需要时）。
- **Approach:** 复用存储读取抽象；对 `image/svg+xml` 使用有界 XML 解析和 SVG 白名单校验；保留合法图形的必要命名空间、viewBox、几何属性、文字和受限 CSS；危险输入返回明确 4xx，并保证状态不会变成可用。
- **Test scenarios:** 合法流程图含中文文本通过；脚本、事件属性、危险协议、外部资源、`foreignObject`、表单/嵌入、不受控引用和超限 XML 被拒绝；非 SVG 图片和普通附件路径不受影响；对象读取失败不会错误确认上传。
- **Verification:** 运行相关 Rust 单测/集成测试、`cargo fmt --check`、`cargo clippy`（按仓库脚本约定）。

### U2. 资料附件 SVG 预览与正文引用回归

- **Goal:** 资料详情中可预览安全 SVG，并保留下载和正文附件图片引用。
- **Requirements:** R5, R6, R7, R9
- **Files:** `api/src/web/attachment_preview.rs`、资料详情/附件预览相关 `web/` 或 `frontend/` 组件、现有资料与附件测试。
- **Approach:** 确认 SVG 走图片预览策略和受鉴权 content URL；对历史明确标记的转义源码块执行同一安全校验并生成受控 data 图片；不改变任意正文 HTML 的内联 SVG 规则；图片占位符复用现有附件 ID/预览入口。
- **Test scenarios:** 资料 SVG 预览显示 `img`/媒体预览并可下载；正文附件图片占位符打开预览；普通 PNG/JPEG、代码块和已有资料 HTML 保持原行为；预览接口对未授权或失败对象返回正确错误而非泄漏内容。
- **Verification:** 运行 `web/test` 相关单测和资料附件 Playwright/E2E 测试；必要时使用现有浏览器 smoke 脚本做一次资料详情验证。

### U3. OpenAPI 与本机 yuance-agent 能力同步

- **Goal:** 代理可以完成资料 SVG 附件上传、确认、预览和下载，不停在手工 OpenAPI 调用阶段。
- **Requirements:** R1, R5, R8
- **Files:** `docs/openapi/yuance.openapi.json`、`/Users/chen/.codex/skills/yuance-agent/SKILL.md`、其 `references/commands.md`、`references/workflows.md` 及 skill 脚本/测试（若存在）。
- **Approach:** 先以真实 OpenAPI 路径和响应为准，补充本地文件字节上传、预览查询和下载/错误处理；命令帮助、工作流说明、能力矩阵保持一致；敏感 URL/令牌不写入输出或文档样例。
- **Test scenarios:** 本地合法 SVG 完整上传并确认后可查询预览；恶意 SVG 使 skill 报告 API 拒绝；网络/签名上传失败可重试或明确失败；预览结果包含 content/download 信息。
- **Verification:** OpenAPI JSON 解析校验、skill 自带校验/测试、使用测试项目 API 做最小闭环（不触碰正式数据）。

### U4. 复核、文档和发布准备

- **Goal:** 汇总安全、兼容性和部署证据，确保可发布。
- **Requirements:** R2, R5, R7, R9
- **Files:** `docs/reviews/` 下本次复核记录、必要的 API/runbook 文档、实现单元产生的代码和测试。
- **Approach:** 对照每个 R-ID 和验收样例复核；检查差异、依赖、错误处理、文件状态与回滚边界；只在聚焦验证通过后提交推送，正式环境发布使用 qfy-test2 runbook。
- **Test scenarios:** 全部聚焦测试通过；构建产物可生成；生产发布前健康检查和文件对象审计路径可执行。
- **Verification:** `git diff --check`、相关 Rust/前端/API/skill 验证、必要的安全审查；结果写入 `docs/reviews/`。

## Verification Contract

- 代码格式与静态检查：仓库现有 Rust/前端脚本、`cargo fmt --check`，以及适用的 `cargo clippy`。
- 服务端行为：执行 SVG 校验相关单元/集成测试，覆盖合法、危险、超限、存储读取失败和非 SVG 回归。
- 前端行为：执行资料附件预览相关 `web/test` 与 `web/e2e` 测试；至少验证 SVG content URL 使用、预览打开、下载入口和失败态。
- 契约与 skill：解析 `docs/openapi/yuance.openapi.json`；执行 skill 校验脚本和新增上传/预览测试；确认命令帮助和 API 路径一致。
- 发布门槛：所有聚焦验证通过、`git diff --check` 无输出、无未解释的工作区改动；生产发布后执行 runbook 中的 health/ready、迁移状态和文件审计。

## Definition of Done

- R1-R9 均有代码或测试证据，且没有通过放宽正文 HTML 清洗器实现需求的范围漂移。
- 合法中文流程图可上传、预览、下载；危险 SVG 不可执行且被拒绝或安全处理。
- 普通资料和现有附件行为通过回归验证。
- OpenAPI、skill 文档、命令实现和实际接口没有能力描述不一致。
- 复核记录写入 `docs/reviews/`；无遗留实验代码、调试输出、临时文件或失败方案代码。
- 相关改动按小功能块提交并推送到 `main`；部署前工作区干净且与远端一致。

## Appendix

已确认的现状证据：`api/src/domains/files.rs` 已按 `image/*` 接受 MIME，`api/src/web/attachment_preview.rs` 已识别 `image/svg+xml` 为图片预览，`api/src/domains/project_resources.rs` 的 HTML 清洗白名单未包含 SVG 元素；资料附件 API 已具备 upload-url、uploaded、download-url、preview 和 preview/content 路由。
