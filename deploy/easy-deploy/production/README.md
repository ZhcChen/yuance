# 元策正式环境部署模板

本目录保存元策 API 的 Compose、运行环境和回滚网关模板。目录中的
`easy-deploy` 是历史命名，当前正式环境不依赖 easy-deploy 平台。

## 当前拓扑

```text
yuance.quanxinfu.com
  -> qfy-sc-test Nginx :443
  -> FRPS 127.0.0.1:40000
  -> qfy-test2 FRPC
  -> qfy-test2 Docker 127.0.0.1:33033
  -> yuance-api
```

正式运行目录固定为 `qfy-test2:/srv/yuance/backend`，镜像保存在
`qfy-test2:/srv/yuance/releases`。SQLite 数据必须位于目标机 Linux 文件系统。
镜像在发布机完成构建后通过 SSH/SCP 传输；目标机和 `/srv/yuance` 内禁止源码
编译或镜像构建。公网服务器上的旧 Compose 和
`gateway/Caddyfile.yuance.example` 只用于冷回滚；
`gateway/nginx-yuance.example.conf` 用于维护当前 Nginx 入口，不接收后端日常发布。

## 目录

```text
backend/
  app.yaml.example       应用元数据
  compose.yaml.example   单体 API Compose 模板
  .env.example           非敏感环境变量模板
  scripts/               备份、迁移、seed、审计与健康检查

gateway/
  nginx-yuance.example.conf 当前公网 Nginx 入口与维护页模板
  Caddyfile.yuance.example 公网旧环境回滚模板
```

元策只部署一个 `api` 服务，不部署 Redis、PostgreSQL、NATS、Worker 或独立
前端。OSS 凭证通过 `/web/system/storage` 管理，不写入部署模板。

## 发布

在发布机的仓库目录执行，当前优先发布到内网目标 `qfy-test2`：

```bash
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_HOST=qfy-test2 \
./scripts/deploy-production.sh
```

脚本要求干净且与 `origin/main` 一致的 `main` 分支。它会在发布机构建
`linux/amd64` 镜像、备份目标机 SQLite
和旧镜像、同步模板、执行迁移与基础 seed、重建容器并验证健康状态和文件对象。

只构建镜像时执行：

```bash
./scripts/build-api-image-amd64.sh
```

备用目标 `qfy-test` 也必须同时显式指定模式与主机，不会默认回退：

```bash
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_HOST=qfy-test \
./scripts/deploy-production.sh
```

## 运行边界

- WSL `/srv/yuance` 和公网服务器都禁止源码编译或镜像构建。
- `.env`、SQLite、OSS AccessKey、FRP token 和签名私钥不得提交或输出。
- `YUANCE_SECURITY_MASTER_KEY` 与 `YUANCE_SERVER_INSTANCE_ID` 必须长期稳定。
- 正式环境不执行 `seed demo` 或 `seed local-admin`。
- 新旧环境不得同时提供写服务。
- FRP Web 管理正式域名路由，不得手工创建第二个同域名 Nginx 或 Caddy 站点。

完整发布、验证、备份和回滚步骤见
`docs/runbooks/production-deployment.md`。
