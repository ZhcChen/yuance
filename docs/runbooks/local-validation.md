# 本地 Web 与 Desktop 验收

本地验收使用独立的 `.local/validation/` 状态目录，不覆盖默认的 `data/yuance.sqlite3`，也不直接连接正式 API。API、Web 和 Desktop 统一连接本地验收 API。

## 端口与目录

| 组件 | 地址或路径 |
|---|---|
| 验收数据库 | `.local/validation/data/yuance.sqlite3` |
| 本地 API | `http://127.0.0.1:33133` |
| 本地 Web | `http://127.0.0.1:33134/web` |
| Desktop renderer | `http://127.0.0.1:33135` |

`.local/` 已加入 `.gitignore`。运行期密钥保存在权限为 `600` 的 `.local/validation/runtime.env`，不使用 macOS Keychain 或 Electron `safeStorage`。

## 准备与导入

初始化隔离目录：

```bash
./scripts/local-validation.sh prepare
```

取得正式环境的一致性 SQLite 快照后导入：

```bash
./scripts/local-validation.sh import-db /path/to/production-yuance.sqlite3
```

导入命令要求验收 API 已停止，会校验源文件、通过 SQLite online backup 生成独立副本，并在替换已有验收库前保留本地备份。不要复制正式环境正在写入的裸数据库文件；应先在正式主机生成一致性快照。

## 启动

分别在三个终端执行：

```bash
./scripts/local-validation.sh api
./scripts/local-validation.sh web
./scripts/local-validation.sh desktop
```

`api` 会先对验收副本执行当前分支 migration，再启动服务。Web 和 Desktop 只连接 `http://127.0.0.1:33133`。

检查当前配置和 API 状态：

```bash
./scripts/local-validation.sh status
```

也可以使用对应的 `make validation-*` 或 `npm run validation:*` 命令。

## 数据边界

- 验收副本允许被本地 migration 和功能操作修改，不能回传覆盖正式数据库。
- 正式 SQLite 中的 OSS Secret 依赖正式 `YUANCE_SECURITY_MASTER_KEY`。本地默认生成独立密钥，因此不会解密或使用正式 OSS 凭证。
- 用户密码哈希、项目和工作项数据可随数据库副本用于登录与 UI 验收。
- PostgreSQL 和 Redis 当前不在元策 API 运行链路中；迁移到这些服务需要单独的持久层改造计划。
