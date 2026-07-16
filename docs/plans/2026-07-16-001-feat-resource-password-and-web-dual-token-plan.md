---
title: feat: 资料密码可编辑与网页登录双 token
type: feat
status: completed
date: 2026-07-16
origin: 用户会话中的资料访问密码与网页登录态调整需求
---

# feat: 资料密码可编辑与网页登录双 token

## Overview

本轮同时解决两类问题：

1. 项目资料库的访问密码不再因富文本首次上传而锁死，资料编辑页支持保持/修改/清除访问密码。
2. 网页系统登录态从单一 session 改为双 token：短期 access token + 长期 refresh token；OpenAPI / MCP 的 PAT 保持独立，不参与本次改造。

## Problem Frame

- 当前资料库在首次粘贴/拖拽附件时会预创建资料并立即禁用访问密码输入框，导致用户误以为“密码无法输入/无法修改”。
- 当前网页登录态只有单一 session，默认固定 TTL，不能实现“30 天无操作才掉线”的目标。

## Scope Boundaries

- 仅改造网页系统登录态与基于 Cookie 的 `/web`、`/api/v1/auth/*` 会话流程。
- PAT / OpenAPI token 保持现有逻辑：不加 refresh、不自动过期轮换。
- 资料访问密码仍然是“访问门禁”，不做正文加密存储。

## Key Decisions

- 保留资料富文本“首次上传前预创建资料”的交互，但取消前端锁死密码字段。
- 资料更新接口新增显式密码动作语义：
  - `keep`
  - `set`
  - `clear`
- 继续使用服务端存 hash 的 opaque token，不引入 JWT。
- access token 继续使用现有 `sessions` 表与 `yuance_session` Cookie，默认短 TTL。
- refresh token 新增独立持久化表与 `yuance_refresh` Cookie，默认 30 天 TTL。
- 自动续签通过中间件完成：
  - access 有效：继续访问，并滑动续期 refresh 过期时间
  - access 失效且 refresh 有效：中间件轮换 refresh 并补发新的 access/refresh Cookie

## Implementation Units

- [x] Unit 1: 资料访问密码表单、API 与领域更新语义
- [x] Unit 2: refresh token 持久化与 auth 域能力
- [x] Unit 3: Web/API 会话续签中间件与登录/登出改造
- [x] Unit 4: 测试、文档与回归验证

## Verification Focus

- 新建资料先上传附件后，访问密码仍可继续输入并在保存时生效。
- 已存在资料可修改密码、清除密码，详情解锁行为符合预期。
- 登录成功同时下发 access/refresh Cookie。
- access 过期但 refresh 有效时，请求可自动续签。
- refresh 30 天内有活动会续期；用户锁定/禁用/改密后旧登录态失效。
