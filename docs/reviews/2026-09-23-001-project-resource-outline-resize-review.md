# 项目资料正文目录布局复核

## 标题信息

- 主题：资料详情目录单行省略、分栏调整及浏览器本地持久化
- 关联计划：`docs/plans/2026-09-23-001-fix-project-resource-outline-layout.md`
- 审查范围：共享 `RichTextContent`、资料详情布局样式、浏览器回归测试
- 负责人：Codex
- 日期：2026-09-23

## 目标对齐

按计划统一目录条目行高和间距，长标题单行省略；桌面目录分隔条支持鼠标拖动与键盘调整，宽度保存在浏览器 `localStorage`。窄屏继续使用原有顶部横向目录布局。

## 已执行验证

- `npm --prefix frontend --workspace @yuance/frontend-ui run check`：通过，88 项测试。
- `npm --prefix frontend --workspace @yuance/frontend-app-shell run check`：通过，10 项测试。
- `npm --prefix desktop run check:renderer`：通过，renderer 构建完成。
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs e2e/resource-detail-toc-resize.spec.mjs --grep 'shared project resources filter read and unlock protected details|project resource outline' --workers=1`：通过，3 项浏览器测试。
- 目视检查 Playwright 截图：目录条目保持单行、省略号可见，分栏边界与正文区域清楚。

## 主要发现

### 必须修正的问题

- 独立时序复核发现：正文初始为空时目录宽度读取会因内容容器尚未挂载而跳过；正文随后填入内容时若不重新运行读取逻辑，分栏会退回默认宽度。已改为在正文首次可用时按存储键恢复，并新增编辑流程 E2E 回归测试。

### 可接受的残留项

- E2E 覆盖正常指针释放与键盘交互；`pointercancel` 和丢失指针捕获共用相同收尾处理，但未单独模拟这两种事件。
- renderer 构建提示 JavaScript chunk 超过 500 KB；构建成功，本次未调整打包拆分。

### 建议后续跟进

- 无。

## 与计划的一致性

- 符合计划：桌面拖拽和键盘调整、宽度边界、本地恢复与窄屏目录布局均完成。
- 偏离计划：无。

## 回归与风险

- 是否发现明显回归：否；资料详情正文导航及 390、768、1280、1440 像素视口布局回归通过。
- 仍需关注的风险：窄屏继续采用现有顶部横向目录，不显示桌面分隔条。

## 结论

- 结论：通过
- 下一步：进入提交与推送
