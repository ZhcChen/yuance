<div align="center">
  <img src="api/static/brand/yuance-logo.svg" width="96" height="96" alt="元策 Logo">
  <h1>元策</h1>
  <p><strong>面向企业研发团队的轻量项目管理系统</strong></p>
  <p>围绕项目、需求、任务、Bug 与成员协作，提供清晰、高效的一体化研发管理体验。</p>
  <p>
    <img src="https://img.shields.io/badge/%E4%BC%81%E4%B8%9A%E7%BA%A7-%E7%A0%94%E5%8F%91%E5%8D%8F%E4%BD%9C-1f5fbf?style=flat-square" alt="企业级研发协作">
    <img src="https://img.shields.io/badge/%E9%A1%B9%E7%9B%AE%E7%AE%A1%E7%90%86-%E9%9C%80%E6%B1%82%C2%B7%E4%BB%BB%E5%8A%A1%C2%B7Bug-2d8a68?style=flat-square" alt="项目管理：需求、任务和 Bug">
    <img src="https://img.shields.io/badge/%E9%AB%98%E6%80%A7%E8%83%BD-Rust%20%2B%20Axum-c2410c?style=flat-square" alt="高性能 Rust 与 Axum">
    <img src="https://img.shields.io/badge/Rust-1.94-000000?style=flat-square&amp;logo=rust" alt="Rust 1.94">
  </p>
</div>

元策（yuance）第一版采用 Rust 单体服务交付，在保持部署简单的同时，为企业研发团队提供聚焦核心协作流程的项目管理能力。

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
