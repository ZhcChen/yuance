---
title: 资料库 SVG 流程图附件支持复核
type: review
date: 2026-09-17
---

# 复核结论

本次服务端改动已完成资料附件 SVG 的安全校验接入，并补上历史资料正文中转义 SVG 源码块的安全展示。合法的静态流程图可以进入上传完成状态或在正文展示为图片，危险 SVG 在上传确认或正文转换前被拒绝；资料附件已有的图片预览和下载 API 不需要新增路由。

## 证据

- `api/src/domains/files.rs` 使用有界 XML 解析、元素/属性白名单、静态 CSS 检查，并拒绝 DOCTYPE、脚本、事件属性、外部资源、危险协议和不支持元素。
- `api/src/web/api/mod.rs` 在资料附件明文及加密上传完成路径调用校验；加密附件先解密原文再校验，且超出 16 MiB 的 SVG 不会被读取进入解析阶段。
- `api/src/domains/project_resources.rs` 只转换明确的 `<details><pre><code>` SVG 源码块，并将通过校验的内容转为安全 data 图片；普通代码块和危险源码保持文本展示。
- `docs/openapi/yuance.openapi.json` 已说明 SVG 校验和资料附件浏览器预览语义。
- `cargo fmt --check`、`cargo check`、`cargo test svg_tests` 通过；OpenAPI JSON 解析通过；`git diff --check` 通过。

## 覆盖样例

- 合法 `svg`、`defs`、`marker`、`path`、`rect`、`line`、`text`、中文实体文本和受限 CSS。
- `<script>`、`onload`、`onclick`。
- 外部 `href`、`foreignObject`、CSS 外链 `url()`。
- 历史转义源码块的合法转换和危险源码不转换。

## 遗留项

本机 `/Users/chen/.codex/skills/yuance-agent/scripts/yuance-agent` 是已编译的 Mach-O 二进制，skill 目录没有 CLI 源码，无法在本仓库内直接增加 `resources attachments upload` 和 `preview` 子命令。skill 文档已同步实际服务端能力和当前 CLI 边界，后续需要从 skill 构建源重新发布二进制，不能把签名 URL 或完成登记冒充为本地字节上传。

## 发布边界

未执行正式环境部署。本次应在 skill CLI 源码可获得并完成能力同步后，或明确接受 skill 遗留项后，再按 `docs/runbooks/production-deployment.md` 使用 qfy-test2 发布。
