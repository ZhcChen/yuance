# 下拉与弹出层统一进入顶层，避免被容器裁剪

## 标题信息

- 主题：下拉菜单 / 工具栏弹出层被裁剪
- 日期：2026-11-24
- 状态：accepted

## 摘要

共享 `Select`、富文本工具栏下拉（段落格式、字号、文字颜色）与“更多”菜单原先在组件内绝对定位，只要祖先容器设置了 `overflow: hidden / auto`（卡片、面板、弹窗正文等），菜单就会被截断；靠近视口底部时也不会向上展开。现统一使用 `frontend/packages/ui/src/popover-placement.js`：弹出层带 `popover="manual"`，打开时 `showPopover()` 进入顶层，按锚点固定定位，空间不足时向上展开、限制在视口内。

## 关键结论

- 顶层（top layer）中的元素不受任何祖先 `overflow`、`transform`、`z-index` 影响，也位于模态 `<dialog>` 之上；DOM 位置不变，`contains` 判断、React 事件冒泡、后代选择器都保持原样。
- 弹出层若自身是滚动容器，覆盖式滚动条会被挂到弹出层内并随内容滚动。改为“popover 外壳（不滚动）+ 内层滚动区”，`overlayPortalHost` 识别 `[popover]` 宿主。
- `[popover]` 的浏览器默认样式带边框、`inset: 0`、`margin: auto`、系统前景色，组件样式需显式设置 `border`、`color: inherit`，并为 `:popover-open` 设置 `position: fixed; inset: auto; margin: 0`。
- 带收起动画的弹出层应在动画结束后再 `hidePopover()`，否则淡出过程中会回到原位置被裁剪。

## 可复用建议

- 新增下拉、浮层、提示类组件时直接使用 `usePopoverPlacement`，不要依赖 `position: absolute` + `z-index`。
- `web/e2e/dropdown-visibility.spec.mjs` 逐页展开所有共享 Select 与工具栏、顶栏弹出层，用 `elementFromPoint` 验证可见性；新增页面或弹窗时把入口加入巡检列表。

## 验证 / 证据

- 修复前巡检 38 项中 11 项失败（需求 / 任务 / Bug 筛选、资料库筛选、讨论区指派后状态、批量操作、指派 / 流转弹窗，以及笔记本尺寸下讨论区工具栏与弹窗内颜色面板）；修复后 42 项全部通过，全量 e2e 重复两次全部通过。
