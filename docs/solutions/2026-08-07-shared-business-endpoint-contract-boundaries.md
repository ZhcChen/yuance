---
title: 共享业务端点必须贯通鉴权、错误和响应边界
type: solution
status: accepted
date: 2026-08-07
---

# 共享业务端点必须贯通鉴权、错误和响应边界

## 摘要

Web 与 Desktop 共用业务 API 时，新增端点不能只复制 Browser 路径。必须同时对齐 D2 principal、业务错误语义、服务端列表规模和两个宿主的 DTO parser，否则局部测试通过后仍会在真实 Desktop 或边界数据上失效。

## 背景

项目资料读取与解锁迁移中暴露了三类断点：旧 `require_api_user` 明确拒绝 device access token；Browser transport 把所有 `403 forbidden` 当作 CSRF 失败重试；服务端返回无分页完整列表，但两个客户端在 500 条后拒绝响应。

## 关键结论

- Desktop 可用的业务端点必须进入既有 `require_d2_api_principal` 鉴权链，再由权限、API token scope 和项目成员关系共同裁决。
- CSRF 重试必须识别明确的 CSRF 错误语义，不能只按 HTTP 403 或通用 `forbidden` code 判断；密码错误和权限拒绝不得自动重放。
- 列表数量限制必须是服务端、OpenAPI、Browser DTO 和 Desktop DTO 的同一契约。服务端无分页时，客户端不能私自设置更小上限或静默截断。
- 异步业务动作必须把响应绑定到 route、实体身份和 action generation；只比较局部 request ID 不足以防止跨页面状态污染。
- 源码边界扫描应基于 lexer/parser token，而不是用正则删除整个模板字符串；`${...}` 属于可执行代码。

## 可复用建议

- 每新增一个 Desktop operation，至少验证 Browser session、device principal、权限不足和响应 DTO 裁剪四条路径。
- transport 重试条件应绑定可证明幂等或可识别的协议错误，不要从宽解释业务状态码。
- 无分页列表要么完整接收并依赖传输字节上限，要么先引入端到端分页 contract，再同步收紧所有 parser。
- 竞态测试应延迟失败响应并在响应前切换 route，不能只测试成功路径或同页重复提交。

## 验证 / 证据

- `api/src/web/api/mod.rs`
- `web/src/platform/browser/api-transport.js`
- `frontend/packages/api-client/src/resources.js`
- `desktop/src/network/operation-registry.mjs`
- `frontend/packages/app-shell/src/app.jsx`
- `frontend/scripts/assert-package-boundaries.mjs`
- `api/tests/device_business_parity_flow.rs`
- `web/e2e/app-shell.spec.mjs`

## 适用范围

- 所有由 Browser cookie session 与 Desktop device token 共同访问的业务 API。
- 所有在共享 React 状态机中执行的列表读取、受保护资源解锁和路由相关异步动作。
