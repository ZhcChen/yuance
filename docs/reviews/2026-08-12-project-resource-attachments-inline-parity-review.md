# 项目资料附件内联展示复核

## 结论

资料详情页已按旧版收口：移除独立的“资料附件”卡片，附件只通过资料正文内联展示。删除/重传产生的历史附件记录不再在详情页重复出现，正文内联附件仍可预览和下载。

## 问题背景

- 正式库导入数据中发现“移企付材料（测试环境）”等资料存在大量重复附件展示：正文内联引用 10 个附件，独立附件卡又列出 17 条记录，包含删除后重传的旧记录，同一文件最多出现 3 次。
- 旧版 `main@6c0e56d` 的资料详情只有正文卡，没有独立附件卡；附件通过富文本正文内联管理。

## 改动

- `frontend/packages/app-shell/src/app.jsx`：移除资源详情独立附件卡及对应上传/删除/定位死代码；保留正文内联附件、附件预览和编辑弹窗内的内联附件管理。
- `frontend/parity/main-web-visual-contract.json`：资源详情 regionOrder 去掉 `attachments`。
- `web/e2e/app-shell.spec.mjs`：资源附件测试改为验证“仅正文内联展示”；同步补正创建附件重试时 checkpoint 保存产生的预期 PATCH 序列（`947e6ce` 引入，原断言已过期）；资料解锁失败断言改为只匹配页面内“资料操作失败”提示，避免与全局错误提示重复匹配。

## 验证

- `npm --prefix frontend run check --workspace @yuance/frontend-app-shell`
- `npm --prefix web run check`
- `npm --prefix web run test:e2e -- e2e/app-shell.spec.mjs --grep "shared project resource"`：6 个资源用例全部通过。
- 本地使用正式库导入副本复现：修复后“移企付材料（测试环境）”详情不再出现“资料附件”卡片。

## 边界说明

- 未修改正式数据；正文未引用的孤立附件和已归档附件仍在数据库中，只是按旧版行为不再展示在详情页。
- 数据清理（如需删除孤立附件）需另行按运维流程处理。
