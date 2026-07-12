---
date: 2026-07-10
topic: ui-system-and-work-item-composer
status: completed
origin: docs/brainstorms/2026-07-10-ui-system-and-work-item-composer-requirements.md
---

# 全站 UI 系统与工作项创建器升级实施计划

## Visual Direction

- **视觉主张：** 冷灰工作台底色与克制蓝色主操作，使用一致边界和间距建立层级，语义色只用于状态、类型和优先级。
- **内容结构：** 顶部负责全局导航和项目上下文，页面只承载当前类型的数据、筛选与操作，弹窗聚焦单一创建任务。
- **交互节奏：** 控件反馈 140–180ms，弹窗和下拉 180–240ms，项目 Tab 活动滑块连续位移；尊重 reduced motion。

## Task List

- [x] **T1. 建立控件 token 与基础规范**
  - 在 `api/static/app.css` 定义统一控件高度、紧凑高度、字号、行高、圆角和动效 token。
  - 统一按钮、输入框、日期、文本域、图标按钮、筛选操作区和弹窗操作区。
  - 覆盖 hover、focus-visible、disabled、busy、error 及暗色模式。

- [x] **T2. 实现共享选择器组件**
  - 在 `api/static/app.js` 渐进增强所有单选 `select`，同步原生值、change、表单 reset 和 disabled 状态。
  - 实现下拉定位、打开/关闭过渡、当前项、空状态、键盘方向键/Home/End/Enter/Escape。
  - 对声明 `data-select-searchable` 的处理人、指派人和父需求选择器提供搜索输入。
  - 移除实验性 `appearance: base-select` 样式。

- [x] **T3. 统一导航、标签、Tabs 与弹窗**
  - 顶部角标改为右上角定位，搜索按钮常驻主色。
  - 移除工作项列表重复类型 Tabs。
  - 工作项类型、优先级和状态标签增加语义 class/data 属性并统一视觉。
  - 项目 Tabs 增加共享活动滑块及 resize 同步。
  - 强化弹窗遮罩/面板进出动画、圆形关闭按钮和媒体查看器圆形工具按钮。

- [x] **T4. 增加最近搜索记录**
  - 在共享布局增加最近搜索面板。
  - 保存去重后的最近 5 条搜索词；聚焦展开、点击回填并提交、支持清空和 Escape 关闭。
  - localStorage 不可用时静默退化为普通搜索框。

- [x] **T5. 统一工作项图文创建器**
  - 需求、任务和 Bug 创建均使用现有 API 异步创建流程。
  - 从当前项目 hidden 字段取得项目，不渲染只读项目控件。
  - 图文分组支持多文件选择、文件清单、单文件本地图片/视频预览和移除。
  - 每组创建一条评论，随后顺序上传该组全部附件；失败时保留已完成状态并允许继续。
  - 处理人和父需求使用可搜索选择器。

- [x] **T6. 扩展视频附件预览**
  - 服务端允许 `video/*` 附件并向模板提供可预览媒体类型。
  - 项目、工作项和评论附件统一输出媒体预览声明。
  - 全局查看器在图片和视频间切换，视频使用原生 controls，关闭/切换时停止播放。

- [x] **T7. 全站排版巡检与回归**
  - 检查工作台、项目列表/详情、需求/任务/Bug 列表/详情、个人中心和系统管理页面。
  - 校正筛选、工具栏、表格操作、弹窗表单、附件区在桌面和移动端的对齐及溢出。
  - 更新相关 Rust 模板测试和 `scripts/browser-smoke.sh`。

## Verification

- `node --check api/static/app.js`
- `cargo fmt --all`
- `cargo test -p yuance-api`
- `git diff --check`
- 完整 `make api-browser-smoke`
- 桌面 1440×1000 与移动端 390×844 检查关键页面和控件弹层。
- 业务路径：最近搜索、普通/可搜索选择器、三类工作项多文件创建、图片/视频本地预览、弹窗与 Tabs 动效。

## Scope Boundaries

- 不引入 React/Vue 或第三方 UI 包。
- 不新增数据库迁移。
- 不实现视频转码、播放进度持久化或服务端搜索历史。
