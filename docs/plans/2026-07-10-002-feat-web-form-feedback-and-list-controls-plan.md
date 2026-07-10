---
date: 2026-07-10
topic: web-form-feedback-and-list-controls
origin: docs/brainstorms/2026-07-10-web-form-feedback-and-list-controls-requirements.md
---

# Web 表单反馈与列表控件体验整改实施计划

## Implementation Units

### 1. 全局 Web 表单反馈

- 在共享 Web 布局中提供 Toast 消息区域。
- 在 `api/static/app.js` 中增加普通 POST 表单提交器：保留已有专用上传、Bug 创建、确认及 htmx 流程；解析 JSON 错误；处理登录失效；成功时跟随服务端重定向。
- 提交期间同步按钮忙碌态并防止重复提交，失败后恢复可操作状态。
- 在 `api/static/app.css` 中实现成功、错误和信息消息的进入、退出及移动端样式。

### 2. 工作项流转语义修复

- 调整工作项详情的流转状态选项，仅使用状态机允许的下一状态。
- 复用动作化状态标签，并在弹窗中单独展示当前状态。
- 增加后端模板渲染测试，覆盖当前状态不出现在流转选项中。

### 3. 通用下拉控件视觉

- 对普通 `select` 统一取消平台默认箭头，增加稳定的图标、背景、边框、悬停、聚焦、禁用和校验状态。
- 兼容弹窗、筛选栏、系统管理表单和暗色主题；不影响已有项目切换器及用户搜索组合框。

### 4. 工作项列表与筛选区重构

- 调整 `api/templates/web/work_items/list.html` 的筛选分组和列表容器语义。
- 在 `api/static/app.css` 中重构筛选网格、条件区、操作区和工作项行的背景层次与响应式布局。
- 保持需求、任务、Bug 三类共享页面结构一致。

## Verification

- `node --check api/static/app.js`
- `cargo fmt --all`
- `cargo test -p yuance-api`
- `git diff --check`
- 使用项目浏览器冒烟环境验证表单错误、工作项流转和筛选操作。
- 分别在桌面与移动端截图检查下拉、筛选、列表和 Toast，不允许重叠、溢出或异常纯白区块。

## Scope Boundaries

- 不实现完整自定义 listbox。
- 不调整后端 API 错误响应结构或状态迁移规则。
- 不改造专用文件上传与图片预览交互。
