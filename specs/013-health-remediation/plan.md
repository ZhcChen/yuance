# 方案：项目体检问题整改

关联：`specs/013-health-remediation/spec.md`、`docs/reviews/2026-11-24-project-health-check.md`

按风险与依赖分 6 个批次，每批独立提交、验证、部署。批次 A～C 为纯代码改动，可连续推进；批次 D 涉及服务器，执行当次授权；批次 F 为结构性重构，单独排期。

## 批次 A：权限与用户数据（P0-1、P0-2、P1-1、P1-7、D3、主密钥校验）约 3 天

| 项 | 方案 | 验证 |
| --- | --- | --- |
| 成员角色越权（FR-001） | `add_project_members`：拒绝 `owner`；`ON CONFLICT DO NOTHING` 并返回“已是成员”的条目列表供前端提示；角色调整只走 `update_project_member_role` | Rust 集成测试：维护者降级负责人 / 授予 owner 被拒，负责人角色不变 |
| 只读成员关闭（FR-002） | 关闭接口补 `ensure_api_project_content_write_access`；详情视图 `can_close_work_item` 同步 | Rust 测试：viewer 关闭返回 403，可写成员成功 |
| 后台刷新覆盖（FR-003） | ① 新增 `loadRouteStateRef`，SSE、通知、实时回调统一调用最新函数；② 资料详情 refresh 时若同一资料已解锁则保留详情、附件与访问凭证；③ `setProfileForm` 只在打开编辑弹窗时初始化；④ 资料库区分“已提交筛选”（ref）与输入中的筛选，写入列表前比对 action id | e2e：解锁后经顶栏实时刷新仍为解锁、附件仍在；编辑个人资料时刷新输入保留；筛选后刷新结果仍为筛选结果（沿用 `holdTopbarEvents`，并用撤销修复对照确认用例有效） |
| 首屏重复请求（FR-004） | `reduceNotificationEvent`：同一连接首次 `stream-connected` 不递增 `refreshRevision`，重连（已连接过）才递增；更新对应单测 | 单测 + e2e 统计首屏每个接口只请求一次 |
| 深色模式（FR-005） | `web/index.html` 头部加入与登录页一致的同步主题脚本 | e2e：设置深色后刷新，`data-theme=dark` |
| 全局错误 toast（FR-005） | api-proxy 仅对写操作上报；读操作错误由页面展示；对有意容错的调用不再重复提示 | 单测：读操作失败不触发全局提示，写操作失败触发一次 |
| 主密钥校验（FR-006） | 生产环境 `YUANCE_SECURITY_MASTER_KEY` 缺失或为默认值时启动失败；移除未使用的 `jsonwebtoken`；dompurify 升级到 ≥3.4.17 | 单测覆盖配置校验；`cargo test`、前端检查 |

## 批次 B：可观测性、并发与性能（P1-2、P1-3、P1-4、P1-6）约 5 天

| 项 | 方案 | 验证 |
| --- | --- | --- |
| 错误与日志（FR-007） | 引入 `tower-http`：`TraceLayer`（方法、路径、状态、耗时、user id）、`SetRequestIdLayer` / `PropagateRequestIdLayer`；`AppError::into_response` 对 5xx 记录 `tracing::error!` 完整错误，响应只返回通用文案与 request id；`Config` 类错误改为 500 | Rust 测试：数据库错误响应不含内部原文且带 request id；日志断言 |
| 事务与竞态（FR-008） | 逐函数改造：创建工作项编号、状态流转、转交、归档、成员移除 / 调整等改为 `begin_with("BEGIN IMMEDIATE")`，校验读移入事务；UPDATE 加 `AND status = ? AND deleted_at IS NULL` 并检查影响行数；编辑接口支持 `expected_updated_at` 乐观锁（前端带上详情的 `updated_at`） | 并发集成测试：并发创建编号不冲突、无 500；并发流转只有一个成功、另一个返回 409 |
| 会话写入节流（FR-008） | `touch_session` / `touch_refresh_session` / Token `last_used_at` 加时间阈值条件（60 秒内不重复写）；认证结果放入 request extensions 复用 | 测试：连续请求只写一次 |
| 索引（FR-009） | 新迁移：`project_activities(target_type, target_id, action)`、`audit_logs(created_at DESC, id DESC)` | 迁移测试 + 合成数据 `EXPLAIN QUERY PLAN` 断言使用索引；正式库副本演练迁移 |
| 限流（FR-010） | 进程内令牌桶（按 IP + 用户名、按资料）；用户不存在时用固定假哈希校验；Argon2 放入 `spawn_blocking` 并以信号量限制并发 | 测试：超限返回 429；不存在用户与错误密码耗时同量级 |

## 批次 C：附件流式读取（P0-5）约 2 天

- 下载与预览改为 `Body::from_stream`：opendal reader 按块读取；加密附件复用现有分块解密格式逐块解密（`spawn_blocking`），未加密附件直接流式转发；Range 请求按块对齐读取。
- 单次请求设置最大缓冲，杜绝整文件进入内存。
- 验证：集成测试覆盖小文件、跨块边界、Range 起止落在块中间、旧格式兼容；手动以 200MB 附件对比改造前后进程内存峰值并记录。

## 批次 D：备份、网关与发布链路（P0-3、P0-4、P1-5、P1-8）约 4 天，执行当次授权

| 项 | 方案 |
| --- | --- |
| 每日备份与异地（FR-012） | qfy-test2 增加 systemd timer：调用现有 `with-clean-backup-env.sh 00-backup-sqlite.sh` 在线快照 → 打包 → `age` 公钥加密 → 上传备份 Bucket（独立 AccessKey、版本控制、生命周期 90 天）；本地保留最近 14 份 + 每月 1 份；失败写日志并在下次发布前置检查中提示 |
| 恢复演练（FR-012） | 新增 `scripts/ops/restore-drill.sh`：下载最近异地备份 → 解密 → 恢复到临时目录 → 临时容器执行 `integrity_check`、`migrate status`、解密一份测试附件；结果写入 `docs/reviews/` |
| 网关 503（FR-013） | 网关仅在上游不可达时显示维护页（`proxy_intercept_errors off`，以 `error_page 502 504` 加命名 location 处理连接失败），`/api/` 不改写状态码；变更前备份配置、`nginx -t` 后 reload |
| 安全响应头（FR-013） | 应用层全局：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Content-Security-Policy: frame-ancestors 'none'`（完整 CSP 先 Report-Only 观察）；网关 server 级 HSTS |
| 发布链路（FR-014） | 镜像打 `yuance-api:<sha>` 标签，compose 通过 `.env` 的镜像标签引用，迁移成功后才切换；tar 按 SHA 命名，保留 3 份；远端流程外包 `flock`；健康检查在窗口内重试并经公网域名再验一次；SSE 流接入停机广播，缩短停机等待 |

## 批次 E：交互细节（P1-9 及 P2 交互项）约 2 天

- `Modal` 增加 `dirty` 参数：Esc / 取消时弹出放弃确认；项目、用户、角色、周期、资料、Token 弹窗接入。
- 窄屏侧栏未展开时 `inert`；手机端触控区域不小于 32px；1280 宽度筛选栏列宽与 `title`；手机指标卡两列。
- 验证：e2e 覆盖 Esc 放弃确认、窄屏 Tab 顺序；巡检用例增加触控尺寸断言。

## 批次 F：结构性重构（P2）单独立项

- 前端：引入 `eslint-plugin-react-hooks`；`app.jsx` 纯函数外移 → `ShellContext` → 按路由拆页面组件（系统管理 → 个人 / 消息 / 搜索 / 项目 → 资料 → 工作项），配合 `React.lazy` 分包；评论附件改批量接口；CSRF token 复用；富文本发布节流。
- 后端：`projects.rs`、`web/api/mod.rs` 按领域与路由组拆分；附件五类目标统一为 `AttachmentTarget` 抽象。
- 每一步单独提交，全量 e2e 与视觉回归作为门禁。

## 交付节奏

1. 批次 A 完成 → 部署 → 线上验证 → 复核记录。
2. 批次 B、C 依次同上。
3. 批次 D 执行前征得授权，变更窗口内逐项操作并留档。
4. 批次 E 随后；批次 F 单独排期。

## 验证总则

- 每项先写能复现问题的测试，确认修复前失败、修复后通过。
- 每批次：`make test`、全量 e2e（重复 2 次）、视觉回归、独立代码复核，结论写入 `docs/reviews/`。
