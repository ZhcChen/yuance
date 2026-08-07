---
title: "Web 与 Desktop U0 体验清单复核"
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
unit: U0
result: passed
---

# Web 与 Desktop U0 体验清单复核

## 结论

U0 的正式 Web 来源清单、页面与动作 contract、宿主差异、动态 API effect 和交互标记分类已经闭合，可以进入 U1。该结论只表示迁移基线完整，不表示任何页面已经完成 React 迁移，也不表示 Browser 与 Desktop 已经达到体验一致。

所有页面和动作仍处于 `baseline`。进入 `shared` 前必须补齐同一 fixture 下的 Browser test、Desktop test 和 review 证据；本复核不替代后续差异测试。

## 覆盖证据

| 来源或 contract | 数量 | 结果 |
|---|---:|---|
| 正式 `/web` route/method | 113 | 113 个唯一 contract owner，双向差集为 0 |
| Askama 模板 | 35 | 35 个存在 page/action owner，双向差集为 0 |
| 页面 contract | 30 | 覆盖 boundary、shell、personal、project、work-item、message/search、system |
| 动作 contract | 83 | 写操作、内部 partial、下载与预览入口均独立登记 |
| 宿主差异 | 6 | 仅认证、路由、文件选择、文件保存、原生通知、窗口生命周期 |
| 唯一交互标记 | 343 | 全部归入受控类别，无未分类 marker |
| 动态 API family | 11 | 均关联 page/action owner |
| 具体多阶段 API effect | 23 | 覆盖 register、sign、transfer、complete、delete、fallback |

交互标记分类结果：`action` 98、`control` 46、`state` 50、`transport` 17、`presentation` 132。分类快照由 `frontend/scripts/classify-legacy-markers.mjs` 生成，来源变化会触发测试失败。

## 迁移责任

| 单元 | Page/Action contract 数 | 主要责任 |
|---|---:|---|
| U1 | 8 | 边界页 token、全局基础交互 |
| U2 | 11 | 身份、路由、当前项目、个人与搜索 |
| U3 | 26 | 项目、成员、周期、资源和项目文件 |
| U4 | 10 | 三类工作项列表、保存视图和批量操作 |
| U5 | 17 | 工作项详情、流转、评论和附件 |
| U6 | 3 | 消息、目标跳转和实时状态 |
| U7 | 33 | 系统管理页面与高风险动作 |
| U8 | 5 | 正式共享入口、下载和旧入口收口 |

## 关键约束复核

- Desktop 仍使用显式 operation registry；清单没有引入通用 fetch、远程页面或 Cookie 注入方案。
- macOS 凭证仍禁止 Keychain 和 Electron `safeStorage`。
- 系统管理动作均保留超级管理员权限、确认、脱敏、审计和失败恢复语义。
- Token 明文只允许创建时展示；密码和存储密钥不进入回显 contract。
- 文件与富文本附件明确登记多阶段上传、取消/重试、签名下载、预览和内容读取。
- `/web/app*`、API docs、下载资产、logout 和 legacy partial 已明确分类，不存在自由文本豁免。

## 验证

```text
npm run lint --prefix frontend
npm test --prefix frontend
git diff --check
```

结果：Frontend lint 通过，35 项测试通过。测试验证来源快照、宿主差异枚举、ID/引用闭合、route/method 唯一 owner、route 双向覆盖、模板双向覆盖和 marker 全量分类。

## 后续入口

下一执行单元为 U1。U1 必须从正式 Web design token、全局壳和基础交互原语开始；不得因为 U0 清单完成而跳过特征测试或直接删除旧模板、`app.js` handler 和 `app.css` selector。
