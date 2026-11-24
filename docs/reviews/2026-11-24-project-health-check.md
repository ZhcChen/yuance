# 项目整体体检（2026-11-24）

## 标题信息

- 主题：全项目优化与风险盘点（后端、前端、浏览器运行时、运维与安全）
- 审查范围：`main` @ `0d660aa7`；正式环境仅做匿名只读请求
- 方法：四个独立只读审查（附带实测：合成数据执行计划、构建产物分析、真实浏览器 3 种视口巡检 23 个页面与 16 个弹窗、正式环境响应头），关键结论由主流程逐条复核代码
- 日期：2026-11-24

## 已在本轮修复

- 下拉菜单 / 工具栏弹出层被容器裁剪（`4d7a63b7`）。
- 上述修复引入的回归：收起的菜单仍渲染、可被 Tab 聚焦并撑高弹窗正文（`0d660aa7`）。

## P0：确凿影响数据、安全或可用性，建议立即处理

| 编号 | 问题 | 证据 | 影响 | 工作量 |
| --- | --- | --- | --- | --- |
| P0-1 | 维护者可经“添加成员”把项目负责人降级为只读或授予 owner | `api/src/domains/projects.rs:2142` `ON CONFLICT DO UPDATE SET member_role`；`validate_member_role` 接受 owner/viewer（`:9104`）；`update_project_member_role` 明确禁止的操作被绕过（已复核） | 负责人失去管理权限且无法自行恢复，角色与 `owner_user_id` 不一致 | 0.5 天 |
| P0-2 | 后台刷新覆盖用户状态：已解锁的受保护资料被重新锁上、个人资料编辑被冲掉、资料库筛选被替换为未筛选结果 | `frontend/packages/app-shell/src/app.jsx:1956-1975, 2095`（refresh 时重新判定 `locked`）、`:2060`（无条件 `setProfileForm`）、`:3649-3672`（SSE 订阅捕获首次渲染的 `loadRouteState`，读到过期筛选）（已复核） | 任何通知、SSE 重连都会触发；用户输入或解锁状态丢失 | 1 天 |
| P0-3 | 数据库与文件主密钥只有本机备份、仅在发布时备份、备份目录无限增长 | `api/.../00-backup-sqlite.sh:219-226`；`scripts/deploy-production.sh:681`；仓库内无异地同步或定时任务 | 主机或磁盘故障时数据库与 `file_master_key` 同时丢失，加密附件永久不可解密 | 1.5 天 |
| P0-4 | 网关把应用的 503 改写为 200 维护页 | `deploy/easy-deploy/production/gateway/nginx-yuance.example.conf:11-12, 30-34`（线上是否一致待核实） | 数据库故障时公网 `/api/readyz` 返回 200，监控与 runbook 检查误判正常 | 2 小时 |
| P0-5 | 加密附件下载 / 预览整文件读入内存并在 async 线程同步解密 | `api/src/web/user/mod.rs:1569-1643`；`api/src/domains/storage.rs:1064-1073`；单附件上限 1GiB | 单个 1GB 附件约占 3GB 内存并阻塞 worker，少量并发即可 OOM 或整站卡顿 | 1.5–2 天 |

## P1：近期处理

| 编号 | 问题 | 证据 | 工作量 |
| --- | --- | --- | --- |
| P1-1 | 每个页面首屏所有接口请求两次：SSE 首次 `connected` 被当作需要全量刷新 | 浏览器巡检 23 页均成对请求；`web/src/platform/browser/events.js:27`、`frontend/packages/app-core/src/notification-events.js:57-58` | 0.5 天 |
| P1-2 | 内部错误原文返回前端，服务端无错误日志与请求日志 | `api/src/platform/error.rs:80-97` 直接返回 `self.to_string()`；无 TraceLayer / request-id | 1 天 |
| P1-3 | 先读后写的事务多为 DEFERRED，并发时 `database is locked` 与状态竞态；每个请求两次会话写入 | `projects.rs` 30 余处 `pool.begin()`（创建编号 `MAX+1`、状态流转、转交）；`router.rs:770, 783` | 2.5–4 天 |
| P1-4 | 高频查询缺索引（合成数据实测） | 操作记录 `SCAN` 30 万行 16ms → 加索引 <1ms；审计列表 100 万行 151ms → <1ms | 0.5 天 |
| P1-5 | 安全响应头缺失；生产环境主密钥缺省值不拒绝启动 | 实测无 HSTS / CSP / X-Frame-Options / Referrer-Policy；`api/src/platform/config.rs:56-59` | 1 天 |
| P1-6 | 登录与资料解锁无限流，可按响应时间枚举用户名，Argon2 同步阻塞 | `api/src/domains/auth.rs:129-145` | 1 天 |
| P1-7 | 全局错误 toast 对已处理的失败也弹出并与页内提示重复；深色模式刷新后失效 | `frontend/packages/app-shell/src/api-proxy.js:18-27`；`web/src/main.jsx:39-43` | 1 天 |
| P1-8 | 发布链路：构建阶段即改写 `yuance-api:latest`、镜像 tar 回滚目标会丢失、无部署锁、健康检查只请求一次、SSE 不响应停机导致每次固定等待 45s | `scripts/build-api-image-amd64.sh:34-41`；`scripts/deploy-production.sh:511-515, 590-597`；`90-healthcheck.sh:6-16`；`api/src/web/api/mod.rs:1049-1130` | 2 天 |
| P1-9 | 通用弹窗按 Esc 直接丢弃已填内容；窄屏收起的侧栏仍在 Tab 顺序中 | `frontend/packages/ui/src/primitives.jsx`（`Modal` 的 `onCancel`）；`frontend/packages/ui/src/app-sidebar.jsx:41` | 1 天 |

## P2：排期或重构

- `app.jsx` 7100 行 / 190 个 state 集中在一个组件，是 P0-2、P1-7 等问题的根源；建议按路由拆页面组件并引入 `eslint-plugin-react-hooks`，同时按页面懒加载（当前单个 JS 包 780KB，gzip 224KB）。约 15 天，可分步。
- 后端 `projects.rs`、`web/api/mod.rs` 各 1 万余行，附件五类目标八个接口高度重复，建议按领域与路由组拆分并统一附件处理。
- 工作项详情评论附件 N+1 请求；每次写操作额外请求一次 CSRF；富文本每次按键两次完整清洗并触发整树重渲染。
- 手机端触控区域偏小、1280 宽度筛选文字截断、手机端指标卡单列占屏。
- 运行配置：容器以 root 运行且读写挂载备份目录、无资源限制、无磁盘增长监控、日志仅保留约 40MB。
- 文档漂移：runbook 中的冷回滚路径已过期、remote 发布未执行文件审计、旧服务器路径、未使用的配置项。
- 依赖：dompurify 升至 ≥3.4.17（当前用法下可利用性低），移除未使用的 `jsonwebtoken`。

## 需要产品确认

- 只读成员（viewer）当前可以关闭工作项（`api/src/web/api/mod.rs:4393-4423`，源自 `319b62e8`“允许任何人关闭”）。是否包含只读成员？

## 无需处理 / 做得好的部分

- 无 SQL 拼接；附件、CSRF、富文本清洗、受保护资料、通知归属校验较完善。
- 23 个页面无运行时异常、无失败请求、无页面级横向滚动；标题层级、图片 alt、按钮可访问名称正常。
- EventSource、定时器、`createObjectURL` 均有对应清理；文档预览器已按需加载。
- Cookie 均设置 HttpOnly / SameSite / Secure（生产）；TLS 拒绝 1.0 / 1.1。
