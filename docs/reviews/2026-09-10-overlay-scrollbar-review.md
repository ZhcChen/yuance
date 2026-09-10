# 全局浮层滚动条复核

## 标题信息

- 主题：全局滚动条改为不占用内容宽度的浮层滚动条
- 关联计划：本轮全局滚动条调整需求
- 审查范围：API 静态页面、React 共享 UI、应用壳层、Web 测试与静态资源
- 负责人：Codex
- 日期：2026-09-10

## 目标对齐

为页面滚动区提供不改变内容布局的浮层滚动条，滚动滑块默认使用 30% 透明度，并覆盖页面、嵌套容器、横向滚动区域、弹窗、下拉菜单和 Shadow DOM 等入口。

## 已执行验证

- 命令：`npm --prefix frontend run check`
- 命令：`npm --prefix web run check`
- 命令：`npm --prefix web run build`
- 命令：`cargo fmt --check`
- 命令：`cargo test -p yuance-api --test routing_smoke`
- 命令：`node --check api/static/overlay-scrollbar.mjs`
- 命令：`make crg.update`、`make crg.review BASE=origin/main`
- 手工检查：使用真实浏览器检查 React 页面、静态动态容器和 Shadow DOM。
- 观察到的关键证据：滑块计算透明度为 `0.3`；主内容和嵌套内容容器的布局宽度等于 `clientWidth`；拖拽、键盘、横向滚动和动态容器均可用；等待多个观察周期后滚动条数量稳定，无持续扫描循环；未发现业务控制台错误。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- `modal-scroll.spec.mjs` 在 `1280x720` 下仍因测试数据默认每页 10 条、`YCE` 位于第二页而无法定位“设为当前项目”按钮；这是既有测试步骤缺少切换每页 20 条的问题，与本次滚动条改动无关。
- CRG 提示新增 API 入口、`OverlayScrollTarget` 和 `SharedApp` 存在静态调用关系测试缺口；现有包级检查、路由冒烟测试和真实浏览器验收已覆盖本次行为，暂不作为发布阻断项。

### 建议后续跟进

- 修正 `modal-scroll.spec.mjs` 的分页前置步骤，消除与本次改动无关的测试噪声。

## 与计划的一致性

- 哪些内容符合计划：统一 CSS 变量、React Hook 与静态页面管理器；隐藏原生滚动条并使用固定定位浮层；补齐动态内容、弹窗、Shadow DOM、ARIA 和回归测试。
- 哪些内容偏离计划：无明显偏离。

## 回归与风险

- 是否发现明显回归：未发现。
- 仍需关注的风险：部分浏览器对 `color-mix()` 或自定义浮层交互的表现可能存在差异；静态页面保留原生滚动条作为初始化失败时的降级路径。

## 结论

- 结论：通过
- 下一步：进入提交与推送
