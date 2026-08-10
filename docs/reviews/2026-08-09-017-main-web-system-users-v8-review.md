# main Web 系统用户 V8 复核

## 结论

系统用户页已按 `main@6c0e56d` 恢复 page hero、用户列表 panel、项目摘要标签、状态和 pager。创建、角色、状态、密码及项目关系 Modal 继续使用原共享 mutation 和权限合同。

`page.system.users` visual contract 已更新为 `matched`。

## 验证证据

- 四视口检查 page hero 断点、表格容器和业务画布无横向溢出。
- 用户分页、创建/角色/状态/密码和项目分配、角色调整、单个/批量移除及阻断语义通过。
- `npm --prefix frontend/packages/app-shell run check:js`
- `npm --prefix frontend/packages/app-shell run lint`
- `npm --prefix web run test:e2e -- --grep "system users"`
- `npm --prefix web run test:e2e -- --grep "user project"`
