# main Web 对象存储 V9 复核

## 结论

对象存储页已按 `main@6c0e56d` 恢复配置主栏与边界说明侧栏、独立桶状态面板、版本行列表和底部分页。宽屏保持双栏，1280px 及以下降为单列，移动端版本行与操作区继续降级。

保存草稿、保存并激活、连接检测、Bucket 初始化、版本回滚及其确认锁保持不变；长期密钥仍不进入页面，API 快照与最终刷新失败语义无回归。

`page.system.storage` visual contract 已更新为 `matched`。V9 剩余 OpenAPI、releases 和 System API docs。

## 验证证据

- Browser E2E 5 条通过，覆盖双 route owner、脱敏分页、四视口几何、完整 mutation 与提交后刷新失败。
- App Shell 静态检查、ESLint 和 6 条单元测试通过。
- Desktop renderer 构建通过；renderer composition、固定 operation registry 与窗口安全策略 39 条合同通过。
- `npm --prefix frontend/packages/app-shell run check`
- `npm --prefix web run test:e2e -- --grep "system storage"`
- `npm --prefix desktop run check:renderer`
- `node --test desktop/test/renderer-composition.test.mjs desktop/test/window-security-policy.test.mjs desktop/test/operation-registry.test.mjs`
