# yuance-api

`api` 是元策当前唯一业务模块，负责 `/web` 页面、`/api` JSON 接口、静态资源、模板、SQLite 数据访问和命令行入口。

## 默认端口

```text
127.0.0.1:33033
```

可通过 `YUANCE_HTTP_ADDR` 覆盖。

## 常用命令

```bash
cargo run -p yuance-api -- serve
cargo run -p yuance-api -- migrate status
cargo run -p yuance-api -- migrate up
cargo run -p yuance-api -- seed core
cargo run -p yuance-api -- seed local-admin
cargo run -p yuance-api -- files audit-objects
cargo run -p yuance-api -- files cleanup-pending --older-than-hours 24
```

`seed local-admin` 只允许 development / test / local 环境使用，用于创建开发测试超级管理员：

```text
username: yuance_admin
password: Yuance@2026Dev!
```

生产环境首次管理员必须通过 `/web` 自助初始化。

## API 契约

当前 `/api/v1` JSON 接口的认证、CSRF、分页、当前项目上下文、附件直传和系统管理约定见：

```text
docs/runbooks/api-v1-contract.md
```

文件对象盘点和附件 pending 清理维护见：

```text
docs/runbooks/file-maintenance.md
```

真实阿里云 OSS 接入后的手工验证见：

```text
docs/runbooks/aliyun-oss-manual-validation.md
```
