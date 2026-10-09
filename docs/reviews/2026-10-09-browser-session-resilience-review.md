# 浏览器登录态与多标签页复核

状态：本机修复与验证通过，正式环境根因尚未确认，未部署。

## 现象与证据

用户反馈重新部署后浏览器登录态会丢失，并且两个标签页可能一页正常、另一页回到登录页。

源码确认 Web 会话由 `yuance_session` 和 `yuance_refresh` HttpOnly Cookie 携带；Cookie 是随机不透明 token，服务端在 SQLite `sessions` / `refresh_sessions` 表中校验，不依赖 JWT 签名。正式 Compose 模板将数据库默认指向 `/data/yuance.sqlite3` 并挂载 `./data:/data`；发布脚本保留 `.env` 与数据目录，只重建 API 容器。因此，仓库当前没有证据表明正常重新部署会主动清除登录会话。生产实际数据库路径、挂载源与主密钥在用户所述故障时是否稳定，仍未验证。

确认一处可产生“误跳登录”的前端行为：原 API transport 将任意 `text/html` 响应当成登录页；部署期间网关/维护页等 HTML 响应也会触发重定向。应用启动会并行发送多个 API 请求，不同标签页可能刚好遇到不同响应，造成表面上的登录态不一致。该路径由源码确认，但未拿到正式故障请求作为当时实际命中证据。

此外，服务端登录页是独立模板。页面一旦打开，即使另一个同源标签页随后登录成功，原页面也不会自动恢复；这会让两个标签页长期停留在不同页面状态。

## 修复

- 只有最终响应地址为 `/web/login` 或非 HTML API 响应返回 HTTP 401 才视为登录失效。其他 HTML（包含网关返回的 HTML 401）作为 `unexpected_response` 错误呈现，不误导用户重新登录。
- 登录页加载时向 `/api/v1/auth/me` 检查现有共享 Cookie；另一标签页完成认证后，通过不含凭证的同源 `localStorage` 事件通知登录页重试服务端校验。只在服务端确认用户有效后回到经服务端校验的 `return_to`。
- 不在浏览器存储中保存 Token、用户资料或授权结果；跨标签通知不是认证凭证。

## 验证

- `npm --prefix web run check`：JavaScript 源码检查、TypeScript、ESLint 通过；67/67 单测通过。覆盖 API 502/401 HTML、200 HTML fallback、CSRF 前置请求的错误响应和正常登录重定向。
- `YUANCE_WEB_E2E_ROOT=/tmp/yuance-auth-multitab-e2e-1791526275-68586/db YUANCE_WEB_E2E_PORT=33942 npm --prefix web run test:e2e -- --grep "login page in another tab|login page redirects when its shared browser session" --workers=1 --reporter=list --output=/tmp/yuance-auth-multitab-e2e-1791526275-68586/playwright-output`：2/2 通过。使用隔离测试数据库及同一浏览器上下文验证：已打开登录页在另一标签页登录后回到原目标；已有有效会话打开登录页时也会恢复。
- 本地 E2E 使用单独 `/tmp` 测试根目录与端口33942，没有复用或删除工作区中已有的 `.artifacts/web-e2e`、Playwright 报告和输出目录。

## 剩余排查

若正式环境仍出现真正的 401/会话失效，需在故障时只读比对：两个标签页是否使用完全相同的 hostname；浏览器是否存在重复同名 Cookie；失败请求的 URL、状态、最终响应地址、Content-Type、是否带两种会话 Cookie（只记存在与否，不导出值）；服务端实际 SQLite URL 是否指向持久挂载、前后部署的 active session/refresh 行数是否稳定，以及 `YUANCE_SECURITY_MASTER_KEY` 发布前后是否相同（只做安全比较，不输出明文）。

本轮没有读取生产环境变量/凭证、没有登录或写入生产数据，也没有部署。修复需独立发布后才能在正式环境观察其效果。
