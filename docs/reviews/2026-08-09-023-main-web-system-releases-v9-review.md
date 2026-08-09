# main Web 版本管理 V9 复核

## 结论

版本管理页已按 `main@6c0e56d` 恢复 page hero、保留策略主栏与发布约束侧栏、独立版本/资产面板和底部分页。宽屏保持策略双栏，1280px 及以下降为单列；表格在自身边界内保留完整发布信息。

当前实现比旧基线新增的内部通道供应链校验保持不变；创建、编辑、校验、发布、撤回、资产上传/下载/删除和最终刷新失败语义均无回归。

`page.system.releases` visual contract 已更新为 `matched`。V9 剩余 System API docs。

## 验证证据

- Browser E2E 3 条通过，覆盖四视口几何、原子快照、状态迁移锁、最终刷新失败和资产生命周期。
- App Shell 静态检查、ESLint 和 6 条单元测试通过。
- Desktop renderer 构建通过，共享版本管理结构可正常打包。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "system release"`
- `npm --prefix desktop run check:renderer`
