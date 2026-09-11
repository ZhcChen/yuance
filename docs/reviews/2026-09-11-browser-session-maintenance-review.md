---
title: 浏览器登录会话持久化与部署维护页复核
type: review
status: completed
date: 2026-09-11
---

# 浏览器登录会话持久化与部署维护页复核

## 结论

通过。当前浏览器登录会话本来就由 SQLite 的 `sessions` 与
`refresh_sessions` 表持久化，不依赖 Redis 或 PostgreSQL；正式环境通过
`qfy-test2` 的 `./data:/data` 挂载保持 `yuance.sqlite3`、WAL 和 SHM 文件。
本轮补上刷新令牌轮换响应丢失、并发刷新和应用重连后的验证，并清理登出时
仍可能残留的短期轮换恢复材料。

更新期间的 502 不是应用内 WebSocket/SSE 错误页可以解决的问题，而是 API
容器停止后请求尚未到达应用。公网 Nginx 模板现在在代理层拦截 502、503、504，
返回“系统正在更新中”，并通过 `no-store`、`Retry-After: 5` 和自动重试避免
用户看到空白错误页。

## 关键证据

- `api/src/domains/auth.rs` 将刷新轮换结果以 `YUANCE_SECURITY_MASTER_KEY`
  加密后短期保存在 SQLite；同一旧 refresh token 在并发或响应丢失重试时恢复
  同一组新 Cookie。
- `api/src/domains/users.rs` 在改密、管理员重置密码和禁用用户时清理轮换恢复
  材料；登出撤销 refresh session 时也在同一事务内清理该用户的恢复材料。
- `api/migrations/202609110001_add_browser_refresh_rotation_recovery.sql` 只增加
  恢复所需字段，不改变已有会话表的持久化边界。
- `deploy/easy-deploy/production/backend/compose.yaml.example` 将 `./data`
  挂载到容器 `/data`，因此正式环境重启容器不会重建登录会话数据库。
- `deploy/easy-deploy/production/gateway/nginx-yuance.example.conf` 在
  `qfy-sc-test` 的当前 Nginx 入口处理后端不可达期间的维护响应。

## 验证

- `cargo fmt --all -- --check`：通过。
- `cargo test -p yuance-api --test auth_csrf_refresh_flow -- --nocapture`：7 项通过。
- `cargo test -p yuance-api`：82 个单元测试通过；认证、设备会话和相关集成流通过。
  `project_management_flow` 中 89 项有 83 项通过，6 项为既有测试债务：3 项仍把
  `24fd556` 扩展后的 12 个演示项目断言为 3 个，2 项仍按扩展前的默认项目排序或
  状态过滤断言，1 项仍按旧接口调用资料附件删除而缺失 `If-Match`。
- `./scripts/validate-deploy-templates.sh`：通过。
- `git diff --cached --check`：通过。
- `cargo clippy -p yuance-api --all-targets -- -D warnings`：未通过，报告的是
  仓库既有模块的 48 项 Clippy 告警；本轮认证改动没有出现新的告警项。

## 正式环境边界

- 发布前必须确认 `YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3`、
  `YUANCE_DATA_DIR=/data` 和 `./data:/data` 持续存在，不能把数据库放在容器
  可写层。
- `YUANCE_SECURITY_MASTER_KEY` 必须保持稳定；变更会使轮换恢复密文和其他已存
  敏感配置无法解密。
- Nginx 模板需要先在 `qfy-sc-test` 合并到现有 Yuance server block，执行
  `nginx -t` 后 reload；模板提交不等于线上配置已经生效。
- 本轮未部署正式环境，避免把未经用户明确要求的线上操作混入代码提交。
