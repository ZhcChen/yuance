---
title: Web UI 密度与交互规范
type: standard
status: active
date: 2026-06-26
---

# Web UI 密度与交互规范

## 页面原则

- 元策是企业项目管理系统，页面优先服务高频操作和信息扫描。
- 使用 `/web` 统一入口；系统管理作为权限菜单嵌入，不做独立后台。
- 完整页面用 Askama 模板，局部刷新使用 htmx partial。
- 不引入独立前端工程、React、Vue、Tailwind 或 Ant Design。

## 视觉约定

- 保持高密度、低噪声、偏研发协作工具的视觉语言。
- 主内容区优先使用 panel、data-table、metric、status 等现有样式。
- 状态展示使用英文状态值到中文标签的 view model 映射。
- 表单字段保持两列栅格；复杂配置页可使用主表单 + 侧栏说明。

## 交互约定

- 普通表单 POST 必须带隐藏 `_csrf`。
- htmx POST 必须由 `app.js` 注入 `x-yuance-csrf-token`。
- 写操作成功后优先返回 redirect 或完整页面。
- 表单错误第一版可返回 JSON 错误；后续再补局部错误 partial。

## 权限约定

- 菜单隐藏只做体验优化，不作为安全边界。
- 每个系统页面和写操作 handler 必须调用具体权限点。
- 普通用户直接访问系统 URL 应返回 403 或重定向登录。
