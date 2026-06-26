# 元策

元策（yuance）是面向企业研发团队的轻量项目管理系统。第一版以项目、需求、任务、Bug、成员协作为核心，采用 Rust 单体服务交付。

## 当前技术边界

- 多模块仓库，当前只有 `api` 模块。
- Rust + Axum + Askama。
- SQLite 作为主存储。
- 不引入 Redis，缓存使用进程内内存。
- 页面统一走 `/web`，系统管理嵌入 `/web/system/*`。
- JSON API 统一走 `/api`。
- 默认端口：`127.0.0.1:33033`。

## 本地启动

```bash
cp api/.env.example api/.env
make api-migrate-up
make api-run
```

访问：

```text
http://127.0.0.1:33033/web
```

开发 / 测试环境后续可通过 `make api-seed-local-admin` 创建固定超级管理员。生产环境不得执行该 seed。
