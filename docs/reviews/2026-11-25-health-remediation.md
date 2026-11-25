# 项目体检整改复核（批次 A–E）

## 标题信息

- 主题：体检问题整改 A–E 的实现、验证、部署与线上核验
- 关联计划：`specs/013-health-remediation/spec.md`、`specs/013-health-remediation/plan.md`、`specs/013-health-remediation/tasks.md`
- 审查范围：`0d660aa7..HEAD`（提交列表见文末）；正式环境 qfy-test2、网关 qfy-sc-test、备份 Bucket `yuance-backup`
- 日期：2026-11-25

## 目标对齐

按方案逐批修复体检确认的问题：A 权限与用户数据、B 可观测性/并发/性能、C 附件流式读取、D 备份/网关/发布链路、E 交互细节。每项先写能复现问题的测试，确认撤销修复后失败、修复后通过（“撤销对照”）。

## 已执行验证

### 自动化

| 项 | 测试 | 撤销对照 |
| --- | --- | --- |
| 成员添加越权、只读成员关闭（FR-001/002） | `permission_boundaries_flow` | 已做（批次 A） |
| 后台刷新覆盖用户状态（FR-003） | `web/e2e/background-refresh.spec.mjs`：解锁保持、凭证失效回退锁定、刷新进行中解锁不被覆盖、个人资料输入保留、已提交筛选保持、排期加载失败提示 | 凭证回退、竞态保护、排期提示均已做 |
| 首屏重复请求（FR-004） | `首屏加载每个接口只请求一次`（修正计数起点后 12 次重复通过） | 批次 A 已做 |
| 分配项目幂等 | `system_user_project_assign_skips_existing_memberships`、e2e 部分失败后清理勾选 | 已做 |
| 5xx 脱敏与 request id（FR-007） | `observability_flow` | 批次 B 已做 |
| 写事务与竞态（FR-008） | `concurrency_flow`：12 个并发创建无 `database is locked`、编号唯一；并发状态流转的 previous_status 首尾衔接；`expected_updated_at` 过期返回 409 | 改回 DEFERRED、去掉前置条件与乐观锁后 3 项均失败 |
| 会话/Token 写入节流 | `auth_security_flow`（节流、60 秒内撤销仍清 Cookie） | 已做 |
| 索引（FR-009） | `query_plan_flow` | 批次 B 已做 |
| 限流与时间差（FR-010） | `rate_limit_flow`：同用户名 10 次失败后 429（密码正确也拒绝）、他人不受影响、资料解锁 10 次失败后 429、不存在用户耗时与密码错误同量级 | 去掉限流与假哈希后 3 项均失败 |
| 附件流式（FR-011） | `attachment_stream_flow`：6.5 MiB 加密文件跨两个读取分组完整下载、每帧 ≤4 MiB 且多帧、Range 起止落在块中间与跨组、篡改密文中断响应流 | 退回整文件读取后下载与篡改 2 项失败（Range 用例在旧实现也正确） |
| 安全响应头（FR-013） | `responses_carry_security_headers_without_overriding_specific_policies` | — |
| SSE 停机（FR-014） | `api/tests/sse_shutdown.rs`（独立进程） | 去掉停机分支后失败 |
| 发布链路（FR-014） | `make deploy-safety-test` 新增：锁先于加载、迁移前 latest 恢复旧镜像、迁移后才切换、迁移容器使用发布标签、远端构建不写 latest、默认保留 3 份、公网复核 | 结构测试 |
| 弹窗放弃保护（FR-015） | `web/e2e/modal-discard.spec.mjs` | `dirty` 置假后失败 |
| 窄屏侧栏不可聚焦 | `web/e2e/narrow-sidebar-focus.spec.mjs` | 去掉 visibility 规则后失败 |
| 触控尺寸、筛选栏截断 | `touch-targets.spec.mjs`、`filter-truncation.spec.mjs`（1024/1180/1280/1440） | 筛选栏旧列宽下 1280 失败 |

门禁：`make test` 全部通过；全量 e2e 重复 2 次 370 项通过（8 项按设计跳过）；视觉回归 9 项通过。移动端与平板像素基线因“指标卡两列、触控尺寸”这一预期改动更新了 6 张，逐张查看确认只包含这些变化。

### 服务器与线上

- 部署（批次 A + T010/T011 + 索引迁移，提交 `2306eadd`）：迁移 `202611250001` 已应用，容器 healthy，公网 `readyz`/`healthz` 200，401 响应携带 `x-request-id`，近 5 分钟无 ERROR 日志。
- 异地备份：新建 `yuance-backup`（cn-shanghai，私有、阻止公共访问、版本控制、`daily/` 90 天、历史版本 30 天）；RAM 用户 `yuance-backup-writer` 仅可读写 `daily/`，实测删除与写其他前缀均被拒绝。`yuance-backup.timer` 已启用，手动触发成功上传，本地备份目录按保留策略从 494M 降到 76M。
- 恢复演练（`scripts/ops/restore-drill.sh`，2026-11-25 14:40）：sha256 ok、解密 ok、`integrity_check=ok`、users 11 / projects 16 / work_items 118 / file_objects 251、文件主密钥与安全主密钥存在、`migrate status` 正常、`files audit-objects` total=217 orphan=0（证明安全主密钥可解密存储配置并访问业务 Bucket）。
- 部署（批次 B–E，提交 `fcbe2f83`，首次使用新发布流程）：新镜像以 `yuance-api:fcbe2f831610` 加载，迁移成功后才切换 latest；运行镜像、latest 与提交标签 ID 一致，容器 healthy。停机窗口内公网每秒探测：36 次返回 503（网关维护页如实返回 503，不再改写为 200），其余均 200。
  - 发布脚本在健康检查通过后报 `sh: 208: Syntax error: Unterminated quoted string`（exit=2），未执行收尾步骤。根因：远端脚本经 `sh -s` 从标准输入按块读取，迁移用的 `docker compose run` 未隔离标准输入，吞掉了尚未读入的脚本；此前脚本较短、剩余部分已在缓冲区内而未暴露。已在服务器上用 400 行填充复现（不包裹时后续命令丢失，包裹后正常）。修复：远端流程整体包进 `remote_main` 函数并以 `</dev/null` 调用，新增结构测试。收尾步骤（镜像 ID 比对、构建目录清理、公网复核）已手动完成。
- 修复后再次发布（`955f32a3`）端到端成功：迁移后切换 latest、公网 readyz 复核通过、`release-*` 临时标签已删除、保留上一版 `yuance-api:fcbe2f831610` 作为回滚目标、构建目录已清理、镜像 tar 为当前加 3 份备份。
- 线上功能核验：公网响应带 HSTS、`nosniff`、`SAMEORIGIN`、`Referrer-Policy`、`frame-ancestors`、`x-request-id`；不存在用户名登录失败耗时约 0.17s（与密码校验同量级）；审计日志记录真实客户端 IP，伪造的 `X-Real-IP` / `X-Forwarded-For` 被网关覆盖。
- 网关：备份原配置后替换 Yuance server block，`nginx -t` 通过后 reload；公网响应已带 HSTS，`readyz` 与 404 原样透传。

## 独立复核

两轮独立代理复核（只读，不连服务器）：

1. 批次 A 补丁与会话节流（`04a87515`、`6ee91dbf`、`694bbd24`）：无阻断。低风险项已修复：系统 Token 未节流、分配项目未规范化项目 key、全部跳过时未校验角色且写空审计；补“60 秒内会话被撤销仍清 Cookie”测试。
2. 批次 B–E（`2306eadd..63c9fa61`）：无阻断。需上线前核实的两项已核实：网关 snippet 含 `proxy_set_header X-Real-IP $remote_addr;`、不含 `add_header`（公网响应已带 HSTS）。中等问题已修复：
   - 每日备份管道中前段失败会被 `age` 掩盖 → 改为分步落盘、逐步检查、`zstd -t` 自检（`a0f8147e`）。
   - 限流“先检查、后记录”可被并发突发绕过 → 改为校验前原子登记、成功撤销；新增并发突发测试，撤销对照下突发超过上限（`69c3eab0`）。
   - 发布标签永久累积 → 发布成功后删除 `release-*` 标签，按提交的标签保留当前与最近 `KEEP_RELEASE_BACKUPS` 个版本（`a0f8147e`）。
   - 低风险：Argon2 信号量许可改为随阻塞任务释放；附件记录大小与加密头不一致时在发出响应头前失败；恢复演练对 sha256、完整性、迁移状态、对象审计失败严格退出；备份根目录固定、保留份数至少 1。
   - 接受并记录：限流设计上匿名用户可让任意账号锁定 15 分钟（10 次失败）；整文件 SHA 校验在声明 Content-Length 时可能不执行，完整性以分块 AES-GCM 为准（已写入代码注释）。

## 主要发现

### 必须修正的问题

- 无遗留。

### 可接受的残留项

- Chrome 的 CloseWatcher：弹窗出现放弃确认后若无任何交互再次按 Esc，浏览器跳过 `cancel` 事件直接关闭，页面无法拦截；保护针对第一次误按。
- “新建项目”表单关闭后保留草稿（已有行为），放弃确认后再次打开仍显示草稿。
- `expected_updated_at` 为可选参数，前端暂不默认携带：评论与正文发布也会刷新 `updated_at`，默认携带会在协作时误报冲突。服务端状态类操作已改为带前置条件的更新。
- 恢复演练未单独解密一份测试附件；以“文件主密钥存在 + 对象审计通过”间接覆盖。
- 附件流式改造未做 200MB 进程内存峰值的手工对比；以“每帧 ≤4 MiB、多帧输出”的自动化断言证明缓冲与文件大小无关。

### 建议后续跟进

- 写操作复用已同步的 CSRF 令牌（尝试过，`web/test/api.test.mjs` 中 14 个契约用例按“每次写前刷新”编排，已回滚，留待批次 F 与测试改写一并处理）。
- 过程教训：曾两次在检查失败时仍提交（命令用管道或分号串联，退出码被吞），均已及时修复并推送；此后提交前单独执行检查并以退出码为准。
- 认证结果放入 request extensions 复用（T011 后半，未做）。
- 批次 F 其余结构性重构。

## 与计划的一致性

- 符合计划：A–E 各功能要求均有对应测试或演练记录；服务器变更前只读核查并备份原配置。
- 偏离计划：异地 Bucket 选在 cn-shanghai（与业务桶不同地域，抗地域故障）；X-Frame-Options 用 SAMEORIGIN 而非 DENY（站内文本预览使用同源 iframe）；镜像 tar 仍沿用固定文件名加 `.before-<时间>` 备份、默认保留 3 份，按提交 SHA 区分体现在镜像标签上。
