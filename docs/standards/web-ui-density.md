---
title: Web UI 组件与密度规范
type: standard
status: active
date: 2026-08-11
---

# Web UI 组件与密度规范

## 架构

- Web 与 Desktop 共用同一套 React 共享前端：
  - `frontend/packages/ui`：基础组件与设计 token（`styles.css`）。
  - `frontend/packages/app-shell`：页面组合、路由与业务表单。
  - `frontend/packages/app-core`：路由、契约与用例。
- 顶部导航栏（`.global-nav*`）按独立设计维护，不受本规范的表单密度约束。

## 设计 token

```css
--yc-control-height: 32px;
--yc-control-height-sm: 32px;
--yc-control-radius: 8px;
--yc-control-font-size: 13px;
```

- 表单控件、按钮、下拉框统一使用紧凑密度：控件高度 32px、字体 13px。
- 颜色、边框、焦点态必须引用 `--yc-*` 变量，保证亮暗主题自动切换。
- 不在业务页面硬编码 `#fff`、`#cbd5e1` 等固定色值。

## 基础组件

`frontend/packages/ui` 提供以下共享组件：

- `Button`：`variant` 支持 `primary / secondary / danger / ghost`；`size="sm"` 用于行内密集操作。
- `TextInput`：统一文本输入，直接用于 `Field` 或 `FilterField`。
- `TextArea`：统一多行文本输入。
- `Select`：原生表单语义 + 自定义下拉视觉，列表筛选下拉统一使用；Modal 表单原生 `select` 由 `Field` 样式统一收敛。
- `Field`：标签、提示、错误与必填语义。
- `FilterBar` / `FilterField`：列表筛选条组合。
- `Modal`、`DataTable`、`Pagination`、`Badge`、`Feedback`、`Skeleton`、`ContentTabs`：页面级共享原语。

## 表单约定

- 创建、编辑、配置、重置等写操作默认放在统一 `Modal` 中；搜索与列表筛选保留页面内表单。
- 表单字段使用 `Field`，文本子控件使用 `TextInput` / `TextArea`；列表筛选下拉使用 `Select`，Modal 表单原生 `select` 保持真实原生语义并共享紧凑样式。
- 字段标签使用 13px、700 权重；提示和错误信息使用 12px。
- 表单控件聚焦态统一使用品牌色边框 + 3px 光晕。
- 弹窗表单按业务字段分组排列，不强制固定两列；复杂配置页可使用主表单 + 侧栏说明。

## 列表筛选约定

- 列表、搜索、系统筛选表单统一使用 `FilterBar`，字段统一使用 `FilterField`，操作按钮放在 `actions` 中。
- 默认栅格为 `repeat(auto-fit, minmax(180px, 1fr))`，页面可按 `className` 覆盖列数，例如工作项筛选的 7 列栅格。
- 筛选按钮与重置按钮使用共享 `Button`，自动获得紧凑密度。
- 分页每页数量等原生 `select` 使用 `.shell-page-size` 或 `.page-size-control`，与表单控件保持 32px / 13px。

## 主题与可访问性

- 所有表单控件必须保留原生语义：真实 `input`、`textarea`、`select` 必须存在，禁用态、必填态和错误态同步到可访问属性。
- 筛选区提供可读的 `aria-label`；字段使用 `label` 与 `htmlFor` 绑定。
- 明暗主题只通过 `html[data-theme="dark"]` 切换变量，不复制一套业务样式。
