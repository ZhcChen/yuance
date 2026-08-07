---
title: Web 与 Desktop U3 项目资料富文本复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目资料富文本复核

## 结论

项目资料正文已从共享层的格式选择器、textarea 和 `<pre>` 展示迁移为唯一的 `RichTextEditor` 与 `RichTextContent`。Browser 与 Desktop 共用编辑工具栏、HTML 状态、Markdown 转换、空正文校验、服务端消毒结果和详情渲染规则。

本切片完成无附件富文本编辑与安全渲染。正文内附件插入、上传进度、引用校验和移除引用后的删除同步仍未完成，因此 `page.project.resource-detail`、`action.project.resource.create` 与 `action.project.resource.update` 保持 `in_progress`。

## 行为与安全证据

- 新建与编辑始终提交 `body_format=html`；历史 `plain` 正文进入编辑器前先转义并转换为段落，避免把旧纯文本误当 HTML。
- 共享工具栏覆盖加粗、斜体、无序列表、代码块、链接、Markdown 转换和左/中/右对齐；按钮具有稳定的可访问名称和 tooltip。
- Markdown 使用 `marked`，转换结果与编辑器输入使用已修复版本的 DOMPurify allowlist 清洗；粘贴在正文内默认按纯文本插入，附件粘贴留给下一切片。
- HTML 展示首帧不注入正文，组件挂载后再次使用 DOMPurify 清洗服务端内容；纯文本展示由 React 转义并保留换行。
- 服务端 `ammonia` 仍是持久化权威边界。真实 API 测试证明标题、代码块保留，而 `script`、事件属性和 `javascript:` 链接被移除。
- Browser E2E 通过 contentEditable 创建标题和代码块，并在资料解锁后验证共享详情结构。
- 真实 API + Electron 流程创建和更新 HTML 资料，验证服务端消毒、密码保护、密码清除和归档仍保持单次 mutation。
- Desktop renderer 构建、ASAR 资源清单、CSP 和单 React runtime 验证均通过；共享组件未引入 Browser transport 或通用网络能力。
- `npm audit` 在锁定当前依赖后报告 0 个漏洞。

## 验证

```text
cargo fmt --manifest-path api/Cargo.toml -- --check
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
npm --prefix frontend run check
npm --prefix web run check
npm --prefix web run test:e2e
npm --prefix desktop run check:renderer
npm --prefix desktop test
npm --prefix frontend audit
```

结果：API HTML 消毒契约通过，Frontend 与 Web 检查通过，Browser E2E 38/38，Desktop 416 项通过且仅跳过 3 个 Windows runner 专属测试，依赖审计 0 个漏洞。

## 后续边界

- 富文本编辑器尚未拥有正文内附件节点、拖放/粘贴文件、上传状态和失败重试。
- 保存前尚未校验所有正文附件均为 uploaded，移除既有正文引用后也尚未同步删除服务端附件。
- 完成附件引用闭环并通过双宿主验证后，才能提升资料详情页与 create/update 动作为 `shared`。
