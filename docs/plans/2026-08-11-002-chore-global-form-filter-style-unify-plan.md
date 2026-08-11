---
title: 全局表单与列表筛选样式统一计划
type: plan
status: completed
date: 2026-08-11
---

# 全局表单与列表筛选样式统一计划

## 背景

- 工作项列表筛选已先行收口为紧凑密度（32px 控件高度、13px 字体），但项目资料库、全局搜索、系统权限、系统审计等列表筛选仍混用原生控件和局部样式，视觉不一致。
- 共享前端已具备 `Button`、`Select`、`Field` 等基础组件，但没有统一的文本输入、文本域和筛选条组件，也没有成文的当前 SPA 表单规范。
- Web 与 Desktop 共用 `frontend/packages/app-shell` 与 `frontend/packages/ui`，本次改动应天然同步到两端，不需要单独修改 Desktop 渲染层。
- 顶部导航栏不在本次调整范围。

## 目标

- 建立共享紧凑表单原语：`TextInput`、`TextArea`、`FilterBar`、`FilterField`，并为 `Button` 补齐 `size` 语义。
- 全局表单控件统一为紧凑密度（32px / 13px），去掉工作项筛选的局部覆盖样式。
- 列表、搜索、系统筛选表单统一使用 `FilterBar` / `FilterField`。
- 更新 UI 风格文档，替代已过时的 Askama/htmx 描述。
- Web 与 Desktop renderer 检查、构建、聚焦测试全部通过。

## 执行单元

### U1：审计全局表单与按钮现状

- 已完成：列出 `app.jsx` 中 76 处 `Field`、66 处 `input`、26 处原生 `select`、5 处 `textarea`，以及筛选区、搜索区、系统筛选区的现状。
- 结论：原生表单控件集中在 Modal 表单和列表筛选；工作项筛选已有局部紧凑样式；`shell-filters` 缺少基础布局定义，系统权限/审计筛选实际未形成栅格。

### U2：新增共享表单原语与紧凑样式

- `frontend/packages/ui/src/primitives.jsx`：
  - `Button` 支持 `size="sm"`，输出 `yc-button-sm`，支持 `className`。
  - 新增 `TextInput`、`TextArea`，输出 `yc-text-input`、`yc-textarea`。
  - 新增 `FilterBar`、`FilterField`，输出 `yc-filter-bar`、`yc-filter-actions`、`yc-field`。
- `frontend/packages/ui/src/styles.css`：
  - 默认控件高度改为 `32px`、默认控件字体改为 `13px`。
  - 补齐 `yc-button-sm`、`yc-text-input`、`yc-textarea`、`yc-filter-bar` 样式。
  - `.yc-field` 内 input/select/textarea 显式使用紧凑 token，保持明暗主题一致。
- 补 UI 单元测试。

### U3：统一列表 / 搜索 / 系统筛选表单

- 工作项列表筛选、项目资料库筛选改用 `FilterBar` / `FilterField` / `TextInput` / `Select`。
- 全局搜索、系统权限筛选、系统审计筛选改用 `FilterBar` / `FilterField` / `TextInput`。
- 删除 `application.css` 中工作项筛选的局部紧凑覆盖，保留页面级栅格与响应式规则。

### U4：全局表单控件迁移与细节收口

- 将 `app.jsx` 中 `Field` 文本子控件统一迁移到 `TextInput` / `TextArea`；筛选下拉使用共享 `Select`，Modal 表单原生 `select` 保留真实原生语义并共享紧凑样式。
- 清理 `.yc-button-sm` 行内按钮样式缺口，统一行内操作按钮密度。
- 检查分页每页数量、页面大小控件等非筛选表单的尺寸与主题一致性。

### U5：文档与双端验证

- 重写 `docs/standards/web-ui-density.md` 为当前 SPA 组件与密度规范，记录组件清单、token、表单与筛选约定。
- 运行 `npm run check:frontend`（覆盖 web、frontend、desktop renderer）。
- 聚焦验证 Desktop renderer 构建与 UI 包测试，确认 Web/Desktop 同步无需额外改动。

## Definition of Done

- 共享组件、样式、测试与文档全部落地。
- 所有列表筛选/搜索/系统筛选表单不再依赖局部紧凑覆盖。
- `npm run check:frontend` 通过。
- 顶部导航栏样式未改动。
- Web 与 Desktop 通过共享模块自动获得同步样式。
