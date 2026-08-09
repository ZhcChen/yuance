# main Web 系统 OpenAPI V9 复核

## 结论

系统 OpenAPI 页已按 `main@6c0e56d` 恢复 page hero、文档与接入主栏、接入提示侧栏、开放范围摘要和独立 Token 面板。宽屏保持接入双栏，1280px 及以下降为单列，Token 表继续在自身边界内横向滚动。

Token 明文仍只在创建成功后展示一次；配额、最小 scope、编辑和确认删除生命周期不变。文档入口继续使用内部共享路由，不引入远程脚本。

`page.system.openapi` visual contract 已更新为 `matched`。V9 剩余 releases 和 System API docs。

## 验证证据

- Browser E2E 通过，覆盖四视口几何、一次性明文、scope 编辑和确认删除。
- App Shell 静态检查、ESLint 和 6 条单元测试通过。
- Desktop renderer 构建通过，共享组件树和样式源可正常打包。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "system OpenAPI"`
- `npm --prefix desktop run check:renderer`
