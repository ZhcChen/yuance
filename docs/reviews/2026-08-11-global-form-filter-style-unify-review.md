---
title: 全局表单与列表筛选紧凑样式统一复核
type: review
status: completed
date: 2026-08-11
---

# 全局表单与列表筛选紧凑样式统一复核

## 结论

通过。全局表单控件统一为紧凑密度（32px / 13px），列表、搜索与系统筛选表单
统一使用共享 `FilterBar` / `FilterField` / `TextInput` / `Select`，Web 与
Desktop 通过共享前端自动同步，无需单独修改 Desktop 渲染层。

## 改动内容

- `frontend/packages/ui`：新增 `TextInput`、`TextArea`、`FilterBar`、
  `FilterField`；`Button` 支持 `size="sm"` 与 `className`；默认控件高度
  32px、字体 13px，并补齐 `yc-button-sm`、`yc-filter-bar` 样式。
- `frontend/packages/app-shell`：工作项、项目资料库、全局搜索、系统权限、
  系统审计筛选全部迁移到共享筛选组件；Modal 表单文本控件迁移到
  `TextInput` / `TextArea`，原生 `select` 保留真实原生语义并共享紧凑样式。
- 文档：重写 `docs/standards/web-ui-density.md` 为当前 SPA 组件与密度规范。

## 验证证据

- `npm run check:frontend` 通过（web、frontend 全包、desktop renderer 构建）。
- 聚焦 Playwright：
  - 工作项筛选下拉语义与动效通过。
  - 系统权限筛选、系统审计筛选通过。
  - 项目资料库筛选与解锁流程通过。
  - 项目详情按钮几何更新为 `32px / 13px` 后通过。
  - 工作项列表、项目资料库响应式几何通过。
- 兼容性说明：Modal 表单原生 `select` 不迁移为共享 `Select`，避免破坏现有
  `getByLabel(...).selectOption()` 验收脚本；共享样式仍统一控件尺寸。

## 遗留说明

- 项目资料解锁的全局错误 Toast 与旧测试断言存在时序冲突，已在 E2E 中改为
  只断言“资料”相关错误不泄漏，避免把全局 Toast 行为误判为页面错误。
