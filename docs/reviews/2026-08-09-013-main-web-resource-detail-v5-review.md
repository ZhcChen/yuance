# main Web 资料详情与 V5 收口复核

## 结论

资料详情已按 `main@6c0e56d` 恢复 resource hero、标签/关联摘要、密码锁定卡、正文卡和附件卡。编辑、密码重置、归档、解锁、附件上传下载删除和只读权限逻辑保持不变。

`page.project.resource-detail` 已更新为 `matched`。周期详情、资料详情和个人分析三页均完成，V5 收口。

## 验证证据

- 公开资料和密码锁定资料均覆盖 `390x844`、`768x1024`、`1280x800`、`1440x900`，检查业务画布无横向溢出、hero 方向、摘要列数和锁定卡宽度。
- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'project resources|resource creation|resource attachments|resource mutation'`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep 'project'`
