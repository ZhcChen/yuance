# main Web 工作项详情 V7 复核

## 结论

工作项详情已按 `main@6c0e56d` 恢复详情 hero、作者正文、主内容、讨论、附件和 `280px` sticky action rail。编辑、指派/流转和操作记录进入共享 Modal，Browser 与 Desktop 继续使用唯一 `SharedApp`、`WorkItemDetail` 和样式源。

`page.work-item-detail.detail` visual contract 已更新为 `matched`，V7 完成。

## 验证证据

- 四视口覆盖 `390x844`、`768x1024`、`1280x800`、`1440x900`；检查业务画布无横向溢出、窄屏单列、桌面双栏、侧栏宽度 `280px` 和 sticky 定位。
- Web 工作项切片 27 条 E2E 中，完整执行结果为 26 条直接通过；唯一旧用例补充“打开编辑 Modal”步骤后单独通过，改动后的失败用例集合复跑全部通过。
- 编辑、流转、关闭、重开、恢复、陈旧响应、评论、回复、富文本、附件预览与删除、只读、删除和错误状态均保留原合同。
- `npm --prefix frontend/packages/ui run check`
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run check`
- `npm --prefix web run test:e2e -- --grep "work item"`
