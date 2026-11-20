# 测试并行化暴露的问题：SQLite 全局分配锁、共享 e2e 数据、弹窗遗留 close 事件、后台刷新覆盖表单

## 标题信息

- 主题：测试提速与正确性
- 日期：2026-11-20
- 关联计划：`specs/012-test-efficiency/`
- 状态：accepted

## 摘要

把测试改为并行时，耗时没有按线程数下降、甚至变慢，或者结果随执行顺序变化，通常不是测试本身的问题，而是进程级或数据级的共享资源。本次定位到四类根因，均用对照实验验证。

## 背景

- `cargo test -p yuance-api` 运行约 115 秒；合并为单一集成测试二进制后仍需 23～26 秒，且单线程（14.5 秒）比 18 线程更快。
- Playwright e2e 全部 spec 共用一个服务和数据库，29 个用例长期失败，其中一部分只在并行时失败。
- 改为每个用例独立服务后，仍有个别用例偶发失败。

## 关键结论

1. **SQLite 内存统计导致的锁争用**：`sample` 采样显示热点为 `__psynch_mutexwait`，调用链为 `sqlite3Malloc → pthread_mutex_lock`。bundled SQLite 默认 `SQLITE_DEFAULT_MEMSTATUS=1`，每次分配都获取全局互斥锁；每个测试新建内存库并执行全部迁移（大量 SQL 解析与小分配），多线程全部阻塞在这把锁上，`sys` 时间达到 `user` 的 5 倍以上。通过 `LIBSQLITE3_FLAGS="-DSQLITE_DEFAULT_MEMSTATUS=0"` 关闭后，集成测试从 26 秒降到约 5 秒，`sys` 从 169 秒降到 2.5 秒。最初怀疑的 argon2 大内存分配经实验排除。
2. **e2e 共享数据导致的顺序依赖**：用例 A 新建的项目会把 YCE 挤出项目列表第一页；用例 B 设置的当前项目会被用例 C 隐式依赖。每个用例复制模板库并启动独立服务（冷启动约 50ms），所有依赖都显式化为模板库初始数据或用例自身准备。
3. **弹窗遗留 close 事件**：`dialog.close()` 之后 `close` 事件在下一个任务才派发；若此时弹窗已因用户操作重新 `showModal()`，遗留事件会触发 `onClose` 把新弹窗关掉。Playwright 恰好在弹窗解除页面 inert 的瞬间点击，因此稳定复现（20 次失败 3 次）。处理 `close` 事件时以 `event.currentTarget.open` 判断弹窗是否仍处于打开状态。
4. **后台刷新覆盖未保存的表单**：角色权限页在每次路由刷新（包括实时通知触发的后台刷新）时把勾选重置为服务端状态。用户勾选后若恰好来一次刷新，再保存就会提交被重置的列表。实时刷新与本地编辑并存的页面，需要区分“进入页面 / 操作成功后的权威刷新”和“后台刷新”，后者不得覆盖用户未保存的修改。

## 可复用建议

- 并行测试变慢时先看 `user` / `sys` 比例；`sys` 远高于 `user` 时用 `sample <pid>`（macOS）或 `perf` 找锁热点，不要凭直觉改并发度。
- 合并测试二进制前检查进程级全局状态：环境变量、当前目录、全局 static。会修改环境变量的测试保留为独立二进制。
- e2e 不要让用例依赖其他用例留下的数据；准备性步骤（当前项目、存储配置）走接口而不是界面，避免依赖分页等易变界面状态。
- 断言“旧响应不会覆盖新结果”时，必须等旧响应真正送达后再断言，否则测试可能在旧响应到达前就通过（空验证）。
- 截持请求的路由若带查询串（如 `?client_decrypt=1`），glob 需以 `*` 结尾；`**` 结尾的宽泛路由会截获本不该匹配的请求。
- 测试长期失败时先区分“产品改版后断言过时”和“产品真实缺陷”，对后者先写失败用例再修复，并用撤销修复的对照实验确认根因。

## 验证 / 证据

- 命令：`/usr/bin/time -p <integration 测试二进制> --test-threads=N`（对比 1 / 4 / 8 / 默认线程数）；`sample <pid> 3`。
- 命令：`npx playwright test -g "links and unlinks the primary post" --repeat-each=20`（修复前 3/20 失败，修复后 0/30）。
- 文件：`.cargo/config.toml`、`web/e2e/support/fixtures.mjs`、`frontend/packages/ui/src/primitives.jsx`。

## 适用范围

- 所有使用 sqlx + bundled SQLite 且并行运行的 Rust 测试。
- 所有基于原生 `<dialog>` 并带关闭动画的弹窗组件。
- Playwright e2e 用例编写与维护。

## 后续事项

- 正式镜像（`api/Dockerfile`）未读取 `.cargo/config.toml`，SQLite 内存统计仍为默认开启；是否在正式构建同样关闭由部署变更单独决定。
