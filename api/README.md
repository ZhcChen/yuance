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
```

`seed local-admin` 只允许 development / test / local 环境使用，用于创建开发测试超级管理员：

```text
username: yuance_admin
password: Yuance@2026Dev!
```

生产环境首次管理员必须通过 `/web` 自助初始化。
