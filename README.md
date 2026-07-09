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

## 正式环境部署

当前正式环境复用参考项目 qfy-sc 的测试服务器别名 `qfy-sc-test`，但元策部署口径是 `production`。服务器只运行 Docker Compose，不允许源码编译或镜像构建。
部署方式对齐 qfy-sc 测试环境：本地构建 `linux/amd64` 镜像 tar，上传到服务器后 `docker load`，再由服务器 Compose 重建容器；不依赖 easy-deploy 平台。

本地构建 x86 镜像 tar：

```bash
make api-image-amd64
```

部署模板和完整服务器命令见：

```text
deploy/easy-deploy/production/
docs/runbooks/production-deployment.md
```

部署模板校验：

```bash
make deploy-validate
```
