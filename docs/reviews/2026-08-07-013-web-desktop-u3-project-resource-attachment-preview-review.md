---
title: Web 与 Desktop U3 项目资料附件预览复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料附件预览复核

## 结论

项目资料附件预览与预览内容流已进入唯一共享 React 交互。Browser 与 Desktop 共用附件列表、预览弹窗、加载与错误状态、前后项导航、预览内下载和关闭行为；Desktop 仅通过固定 operation、IPC 和 opaque capability 承载私有内容。

`action.project.resource-attachment.preview` 与 `action.project.resource-attachment.preview-content` 已达到 `shared`。富文本安全渲染、附件插入与引用生命周期仍未完成，因此 `page.project.resource-detail`、`action.project.resource.create` 与 `action.project.resource.update` 继续保持 `in_progress`。

## 行为与安全证据

- preview metadata 与 preview content 均验证资料 access grant；grant 绑定当前用户、资料和密码 hash，密码轮换后旧 grant 无法继续读取 metadata 或内容。
- 内容端点支持 `GET`、`HEAD` 和单段 `Range`，返回受控 `206`/`416`、预览 CSP 与 `no-store`，并复用项目附件的内容流安全边界。
- Browser 由共享 API client 获取 metadata，使用服务端返回的受保护 content URL，在同一共享预览组件中渲染或降级展示。
- Desktop renderer 只提交项目、资料、附件和 access grant 的语义引用；固定 operation 在主进程获取 metadata，严格校验内容 URL 后把认证内容写入私有 preview spool。
- Desktop 向 renderer 只返回 `app://yuance/.preview/<capability>`、公开附件 DTO、预览类型和去 URL 的前后项 ID/标题；API URL、header、access grant、对象 key 与本地路径均不进入 renderer。
- Desktop 内容加载器使用结构化 URL 校验：普通项目附件禁止 query；资料附件只允许一个 canonical `access` 参数，并拒绝额外参数、重复参数和 fragment。
- 路由切换、关闭预览、binding 不匹配和 capability 过期均释放私有快照；预览内下载继续使用既有固定资料附件下载能力。
- Browser E2E 覆盖资料附件打开预览、降级内容、关闭、下载和删除；真实 API + Electron 集成验证 metadata、认证内容读取、私有 spool、opaque capability、内容 hash 与释放结果。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
cargo test --manifest-path api/Cargo.toml --test device_session_contract_flow
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
npm --prefix web run test:e2e -- --grep "shared project resource"
npm --prefix web run test:e2e
npm --prefix desktop test
```

结果：API 设备业务契约 5/5、Browser 聚焦流程 5/5、Browser 全量 E2E 38/38、Desktop 416 项通过且仅跳过 3 个 Windows runner 专属测试；共享前端、Web、Desktop renderer、OpenAPI/Device session 契约及真实 API + Electron 资料预览流程均通过。

## 后续边界

- 资料正文仍使用 plain/preformatted 展示，尚未完成共享富文本编辑与安全渲染。
- 富文本附件插入、引用合法性校验、移除引用后的附件删除同步仍属于后续 U3 切片。
- 完成上述能力并取得双宿主证据后，再提升资料详情页与 create/update 动作为 `shared`，并执行 U3 cutover/retire gate。
