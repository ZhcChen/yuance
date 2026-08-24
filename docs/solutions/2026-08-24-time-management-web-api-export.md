# 前端新增 API 方法时需同步 web 宿主显式导出

## 问题

给 `@yuance/frontend-api-client` 的 `createApiClient` 增加新方法后，Desktop 通过 `...apiClient` 自动获得该方法，但 web 宿主 `web/src/lib/api.js` 使用显式 `webApi` 对象逐项导出，新方法不会自动出现在 Browser 页面中。运行时报错为 `api.getTimeManagementOverview is not a function`。

## 排查路径

1. 先在 `frontend/packages/api-client/src/http-client.js` 确认 `createApiClient` 已合并新 client；
2. 再检查宿主入口：`desktop/src/renderer/main.jsx` 直接展开 `apiClient`，而 `web/src/lib/api.js` 需要显式 `export const` + 加入 `webApi` 对象；
3. 浏览器端验证页面加载时会暴露缺失方法，单元检查不会覆盖宿主导出拼装。

## 可复用规则

- 新增 API client 模块后，同步更新 `frontend/packages/api-client/src/http-client.js` 与 `src/index.js`；
- web 宿主新增方法时，必须同时添加具名导出和 `webApi` 对象成员；
- 涉及宿主边界的功能，验证至少包含一次真实 Browser 页面加载，而不只跑包级单测。
