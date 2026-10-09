---
title: 元策正式环境部署运行手册
type: runbook
status: active
date: 2026-08-02
---

# 元策正式环境部署运行手册

元策正式环境运行在内网部署目标 `qfy-test2`，由目标机上的 Docker Engine 承载。
发布机通过 SSH/SCP 将当前 `main` 提交归档同步到 `qfy-test2` 的独立编译工作区，
由 `qfy-test2` 完成前端检查、BuildKit 镜像构建和发布；正式服务器的
`/srv/yuance/backend` 运行目录禁止源码编译和镜像构建。
公网服务器 `qfy-sc-test` 只保留 Nginx、FRPS 和已停止的旧环境作为冷回滚。

## 构建发布唯一口径

- 正式环境的源码校验、依赖安装、前端检查、镜像构建、镜像传输、数据库迁移和服务重启，统一由本机发布脚本配合 `qfy-test2` 完成。
- GitHub Actions、GitHub workflow、GitHub hosted runner 和 GitHub Release 不参与正式环境构建、发布或部署。
- 仓库禁止新增、恢复或修改 `.github/` 下的 workflow、构建配置和发布配置；不得以 GitHub Actions 替代 `qfy-test2` 的构建链路。
- 正式部署入口唯一为 `scripts/deploy-production.sh`，且必须显式使用 `YUANCE_DEPLOY_MODE=remote`、`YUANCE_DEPLOY_BUILD_MODE=remote` 和 `YUANCE_DEPLOY_HOST=qfy-test2`。
- 任何其他构建或发布方式只能用于本地验证，不能作为正式环境发布依据。

## 当前拓扑

```text
yuance.quanxinfu.com
-> qfy-sc-test Nginx :443
-> FRPS 127.0.0.1:40000
-> qfy-test2 FRPC
-> qfy-test2 Docker 127.0.0.1:33033
-> yuance-api
```

运行口径：

```text
SSH 部署目标：qfy-test2（内网优先）
备用目标：qfy-test（仅允许显式指定）
运行目录：/srv/yuance/backend
镜像目录：/srv/yuance/releases
编译目录：/srv/yuance/build/<commit>
迁移包目录：/srv/yuance/incoming
Compose 服务：api
容器：yuance-api
镜像：yuance-api:latest
SQLite：/srv/yuance/backend/data/yuance.sqlite3
FRP Web：http://127.0.0.1:8067
域名：yuance.quanxinfu.com
```

SQLite 数据必须位于 WSL Linux 文件系统，不得迁到 `/mnt/c`。`.env` 必须
保持 `600`，并保持 `YUANCE_SECURITY_MASTER_KEY` 不变，否则已有 OSS Secret
无法解密。

## 运行边界

- 只部署 `api` 一个 Rust 单体服务。
- SQLite 是唯一数据库。
- 不部署 Redis；缓存使用进程内内存。
- 不部署 PostgreSQL、NATS、Worker、独立前端或独立后台。
- `/web`、`/web/app`、`/api`、静态资源、迁移和 seed 都由 `yuance-api` 二进制提供。
- OSS 不写入部署环境变量，部署后由超级管理员在 `/web/system/storage` 动态配置。
- 必须保持 `YUANCE_SECURITY_MASTER_KEY` 稳定，否则已保存的 OSS Secret 无法解密。
- 必须显式配置并保持 `YUANCE_SERVER_INSTANCE_ID` 稳定；它绑定 Desktop device credential，变更后现有设备必须重新授权。
- 资料库新附件采用静态加密：文件级 DEK 由服务端主密钥信封封装，OSS 只保存密文。
  主密钥优先使用 `YUANCE_FILE_MASTER_KEY`；未设置时首次启动自动生成到
  `/data/secrets/file_master_key`（0600）。生成后必须保持稳定并单独备份，
  不要随意更换，否则已加密附件无法解密。已上传的明文附件不受影响。
- 文档预览已改为站内离线处理；PDF、TXT、LOG、MD、JSON、XML、YAML、YML、CSV、XLS、XLSX、ODS、DOCX、PPTX 走稳定纯前端预览。DOC、PPT 属于 legacy 实验性纯前端预览，默认关闭。

## 自动启动

Windows 计划任务 `WSL-Ubuntu-KeepAlive` 启动 `Ubuntu-24.04`；WSL systemd
随后启动 Docker、FRPC 和 FRP Web。`yuance-api` 使用 Compose
`restart: unless-stopped`，Docker 恢复后自动启动。

检查命令：

```bash
systemctl is-enabled docker frpc frp-web
systemctl is-active docker frpc frp-web
docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' yuance-api
```

## 构建镜像

正式发布时，构建和部署都在 `qfy-test2` 完成。发布机只做 `main` 提交校验、
源码归档和传输，不要求本机安装 Docker：

```bash
cd <仓库目录>
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_BUILD_MODE=remote \
YUANCE_DEPLOY_HOST=qfy-test2 \
./scripts/deploy-production.sh
```

`qfy-test2` 必须预先安装并可用 `npm`、Node.js、Docker Buildx/BuildKit、
Docker Compose、`ssh` 传输所需的系统工具。源码归档传输前，目标预检会解析构建目录和
后端运行目录的物理路径，拒绝符号链接别名进入运行目录；随后执行
`docker buildx inspect --bootstrap`，确认 builder 可初始化后才建立远程源码工作区。
脚本会在
`/srv/yuance/build/<commit>` 中解压提交归档，先按三个 lockfile 执行 `npm ci`，
再执行 `npm run check:frontend`、`docker buildx build --platform linux/amd64`
和 `docker save`。这样归档工作区自包含，不依赖发布机的 `node_modules`；构建产物先写入
该编译目录，完成运行目录当前镜像备份后才复制到 `/srv/yuance/releases`。
桌面端依赖安装时设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，正式 API 镜像只需要桌面端
源码检查和 renderer 构建，不下载与服务端无关的 Electron 平台二进制。

构建目录与 `/srv/yuance/backend`、`/srv/yuance/backend/data` 有明确隔离，
构建失败不会加载镜像、执行迁移或重启服务。发布成功后删除该提交的临时源码和
tar，Docker BuildKit 缓存由 Docker 自己管理，不通过发布脚本误删。

本地构建仍可用于离线验证，但不再是正式 qfy-test2 发布的默认路径：

```bash
YUANCE_LOCAL_DOCKER=0 ./scripts/build-api-image-amd64.sh
YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_BUILD_MODE=local \
YUANCE_DEPLOY_HOST=qfy-test2 YUANCE_SKIP_LOCAL_BUILD=1 \
./scripts/deploy-production.sh
```

服务器运行目录内禁止执行 `cargo build` 或 `docker build`；只有专用的
`/srv/yuance/build` 编译工作区允许构建。

共享构建脚本默认用于受控本机开发，使用 local tag 与 `.local/images/`。上述备用正式制品命令显式选择 `YUANCE_LOCAL_DOCKER=0`，保留 `yuance-api:latest` 和 `dist/` 制品口径；日常开发使用 `docs/runbooks/local-development.md`，不得混用测试 tar 与正式发布 tar。

## 一键发布

当前正式环境优先使用 `qfy-test2` 的内网 remote 模式：

```bash
cd <仓库目录>
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_BUILD_MODE=remote \
YUANCE_DEPLOY_HOST=qfy-test2 \
./scripts/deploy-production.sh
```

脚本要求 `main` 工作区干净并与 `origin/main` 一致，然后执行：

1. 预检目标机 Docker、Docker Compose、`sqlite3` 和 `.env`，再构建并校验 `linux/amd64` 镜像 tar。
2. 备份 `/srv/yuance/releases` 中当前镜像 tar。
3. 同步 Compose、app 元数据和运维脚本，但不覆盖 `.env` 或数据。
4. 加载镜像并以 SQLite `.backup` 生成一致性单文件快照；通过完整性检查后才进入迁移。
5. 在单次维护容器内执行 `migrate status`、`migrate up`、`seed core`。
6. 重建 `yuance-api`，检查 health、ready、文件对象审计和镜像 ID。

`qfy-test` 只能在明确确认目标后显式指定，不作为默认或隐式回退目标：

```bash
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_BUILD_MODE=remote \
YUANCE_DEPLOY_HOST=qfy-test \
./scripts/deploy-production.sh
```

可选参数：

```bash
YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_BUILD_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2 \
YUANCE_KEEP_RELEASE_BACKUPS=2 ./scripts/deploy-production.sh
YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_BUILD_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2 \
YUANCE_PRUNE_DANGLING_IMAGES=1 ./scripts/deploy-production.sh
```

如果发布机存在仅用于本地开发的 `.compound-engineering/config.yaml` 未提交改动，
可显式设置 `YUANCE_ALLOW_DIRTY_LOCAL_CONFIG=1`；该文件不会进入 `git archive`，
其他任何工作区改动仍会阻止正式发布。不要用该开关绕过代码、依赖或部署模板改动。

保留的旧远程流程只能显式调用，不会默认回退到旧服务器：

```bash
YUANCE_DEPLOY_MODE=remote \
YUANCE_DEPLOY_BUILD_MODE=remote \
YUANCE_DEPLOY_HOST=<明确目标主机> \
./scripts/deploy-production.sh
```

部署模式和构建模式均无默认值，必须显式选择；`remote` 模式缺少目标主机会在 Git
fetch、构建和传输前拒绝。`local-wsl` 是历史兼容模式，只能显式选择且只支持本地构建。
发布脚本会在任何发布副作用前校验模式、目标、布尔开关、时长、镜像路径和保留数量。
参数边界：`YUANCE_KEEP_RELEASE_BACKUPS` 为 `0` 到 `100` 的规范整数；
`YUANCE_PRUNE_DANGLING_IMAGES`、`YUANCE_SKIP_LOCAL_BUILD` 和
`YUANCE_ALLOW_DIRTY_LOCAL_CONFIG` 只接受 `0` 或 `1`；三个超时参数使用正整数加 `s`、`m`
或 `h`，每项不超过 24 小时。`YUANCE_API_IMAGE` 必须是有效的 Docker 镜像名及可选标签，
不接受 digest；镜像 tar 必须是仓库内以 `.tar` 结尾的相对路径。自定义远程目录必须是无空格、
不含重复斜杠和 shell 特殊字符的绝对路径，构建目录不能落入后端运行目录。

## 手工检查

```bash
cd /srv/yuance/backend

sqlite3 data/yuance.sqlite3 'PRAGMA integrity_check;'
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api migrate status
./scripts/80-files-audit.sh
./scripts/90-healthcheck.sh
```

运行说明：

- 当前部署不再依赖 `LibreOffice`、`soffice`、ONLYOFFICE 或服务端文档转换缓存。
- PDF、TXT、LOG、MD、JSON、XML、YAML、YML、CSV、XLS、XLSX、ODS、DOCX、PPTX、DOC、PPT 统一走 Flyfish File Viewer 站内前端离线预览。
- 文档预览页只负责生成受控内容地址，实际解析与渲染全部由浏览器内的 file-viewer 完成。
- 如果当前仍使用测试内存存储，文档预览页会自动回退到同源读取，不依赖外部文档服务。

正式环境 `.env` 必须保持：

```text
YUANCE_ENV=production
YUANCE_DATABASE_URL=sqlite:///data/yuance.sqlite3
YUANCE_DATA_DIR=/data
YUANCE_API_BIND_IP=127.0.0.1
YUANCE_API_PORT=33033
YUANCE_WEB_DIST_DIR=/app/web/dist
YUANCE_SSE_DRAIN_TIMEOUT=30s
YUANCE_STOP_GRACE_PERIOD=45s
YUANCE_MAX_RELEASE_WINDOW=10m
YUANCE_SERVER_INSTANCE_ID=<稳定且唯一的生产实例标识>
YUANCE_FILE_MASTER_KEY=<可选，留空则自动生成到 /data/secrets/file_master_key>
YUANCE_DEVICE_TRUSTED_PROXY_CIDRS=127.0.0.0/8,172.16.0.0/12
YUANCE_DEVICE_AUTHORIZATION_TTL=10m
YUANCE_DEVICE_ACCESS_TTL=15m
YUANCE_DEVICE_REFRESH_SLIDING_TTL=30d
YUANCE_DEVICE_REFRESH_ABSOLUTE_TTL=90d
YUANCE_DEVICE_IDEMPOTENCY_TTL=24h
YUANCE_DEVICE_POLL_INTERVAL=5s
```

Device session 配置在进程启动时校验：authorization TTL 必须为 5-15 分钟，access TTL 必须为 1-60 分钟，poll interval 必须为 2-15 秒；refresh absolute TTL 不得短于 sliding TTL，幂等恢复 TTL 不得短于 authorization TTL 或长于 refresh sliding TTL。`YUANCE_DEVICE_TRUSTED_PROXY_CIDRS` 只填写直接连接 API 的反向代理网段；留空表示不信任任何代理，此时忽略 `X-Forwarded-For`。

公网检查：

```bash
curl -fsS https://yuance.quanxinfu.com/api/healthz
curl -fsS https://yuance.quanxinfu.com/api/readyz
curl -I https://yuance.quanxinfu.com/web
curl -I https://yuance.quanxinfu.com/static/auth.css
```

## Nginx 与 FRP

Yuance 路由由 FRP Web 管理：

```text
route id：6b1c1c6f-59b4-486d-9e00-a1dd5546ae4d
名称：yuance
域名：yuance.quanxinfu.com
本地端口：33033
远端端口：40000
```

`qfy-test2` 受管 FRPC 片段位于 `/etc/frp/conf.d/frp-web/*.toml`。主配置必须同时
加载顶层人工片段与该受管子目录：

```toml
includes = ["/etc/frp/conf.d/*.toml", "/etc/frp/conf.d/frp-web/*.toml"]
```

公网入口 Nginx 配置位于 `/etc/nginx/conf.d/qfy-443-frp-web.conf`，
Yuance 对应 `server_name yuance.quanxinfu.com` 的 server block。
仓库中的 `deploy/easy-deploy/production/gateway/nginx-yuance.example.conf`
包含本地维护页配置，替换该 server block 后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

维护页由 Nginx 本地生成，捕获 502、503、504 并返回“系统正在更新中”，
不依赖 `yuance-api`、FRP 或 SSE。页面默认带 `Cache-Control: no-store`、
`Retry-After: 5`，并每 5 秒自动重试。不要把该 server block 与旧 Yuance
block 同时保留。

FRPS 的代理端口只监听 `127.0.0.1`，禁止向公网开放 `40000-40999`。

## 数据备份

发布前执行：

```bash
cd /srv/yuance/backend
./scripts/00-backup-sqlite.sh
```

备份脚本使用 SQLite `.backup` 在活动数据库上生成同一时点的单文件快照，不要求为备份停止 API，
也不会将活动数据库的主库、`-wal`、`-shm` 分别复制后误称为一致快照。目标机需预装 `sqlite3`；
快照必须通过 `PRAGMA integrity_check` 才会生成 manifest 并报告成功。备份目录为 `0700`，
数据库快照、manifest 和密钥为 `0600`。

每个备份目录包含 `yuance.sqlite3` 和 `manifest.txt`。当文件主密钥来自自动生成的数据文件时，
还包含 `secrets/file_master_key`；当 `YUANCE_FILE_MASTER_KEY` 由环境配置提供时，manifest
只记录 `file_master_key_source=environment` 及外部配置依赖，不包含密钥值。环境变量密钥必须
从独立受控配置恢复。备份根目录本身不会被脚本改写权限；每份随机备份目录固定为 `0700`，
快照、manifest 和密钥文件固定为 `0600`。拒绝把 `/`、`/tmp`、`/var/tmp` 及其下级目录或应用数据目录作为备份根目录。
备份路径中任一现存目录组件若为符号链接也会被拒绝，避免路径别名绕过数据目录隔离。

没有 `manifest.txt` 的历史备份属于旧格式，不能按新格式推断文件主密钥来源。恢复前必须从
受控的旧数据副本或密钥配置确认数据库快照与同一主密钥；无法确认匹配关系时，不应启动服务或
覆盖现有数据。恢复后应实际读取一份已加密附件验证密钥匹配。

## 文件维护

对象关系盘点：

```bash
cd /srv/yuance/backend
./scripts/80-files-audit.sh
YUANCE_INCLUDE_DELETED_FILES=1 ./scripts/80-files-audit.sh
```

pending 清理先 dry-run：

```bash
docker compose --env-file .env -f compose.yaml exec -T api \
  ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
```

确认后去掉 `--dry-run`。当前命令只做数据库软删除，不删除 OSS 物理对象。

资料库新附件加密主密钥文件 `/data/secrets/file_master_key` 属于数据目录持久化内容。
正式回滚时必须根据备份 manifest，将数据库快照与对应密钥作为一个恢复单元。恢复数据库前
停止 API；替换 `data/yuance.sqlite3` 后删除旧 `data/yuance.sqlite3-wal` 和
`data/yuance.sqlite3-shm`，若来源为 `data-file` 则同时恢复该备份中的主密钥，并确认 `.env` 中
`YUANCE_FILE_MASTER_KEY` 为空且调用 Compose 的 shell 没有提供非空值覆盖。
若来源为 `environment`，必须从受控配置恢复相同 `YUANCE_FILE_MASTER_KEY`，不得将密钥
写入普通备份。先确认 `PRAGMA integrity_check` 为 `ok`，再加载匹配版本的镜像并启动 API；
随后检查迁移状态、文件对象关系、健康状态和测试附件解密。

## 回滚到公网旧环境

观察期内不得删除公网服务器的旧容器、旧数据、镜像、迁移包或 Nginx/Caddy 备份。
回滚遵循单写原则：

1. 在 `qfy-test2` 停止当前 `yuance-api`。
2. 在 FRP Web 停用 Yuance 路由，或把受管 FRPC 片段移出加载范围。
3. 恢复服务器旧 `yuance.caddy`，执行 Caddy validate/reload。
4. 在 `qfy-sc-test` 启动旧 `yuance-api`，不执行 migrate 或 seed。
5. 验证 health、ready、登录、项目数据和 OSS 文件读取。

关键命令：

```bash
# qfy-test2
cd /srv/yuance/backend
docker compose --env-file .env -f compose.yaml stop api

# qfy-sc-test
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml up -d api
```

如只回滚 qfy-test2 应用版本，加载 `/srv/yuance/releases` 中上一版 tar 后重建
容器。若还需回滚数据库，必须按对应备份的 manifest 停服务并恢复单文件快照、自动主密钥
或受控环境密钥，不能将其他时间点的 WAL/SHM 与快照混用。

## 禁止事项

- 禁止提交、打印或记录真实 `.env`、OSS AccessKey、FRP token。
- 严禁使用 GitHub Actions 或新增 GitHub 构建配置执行正式环境构建、发布和部署。
- 禁止在正式环境执行 `seed demo` 或 `seed local-admin`。
- 禁止修改已经发布的 SQL migration。
- 禁止新旧两端同时提供写服务。
- 禁止把 `qfy-sc-test` 作为部署脚本的隐式默认目标。
- 禁止手工创建第二个同域名 Nginx 或 Caddy 站点。
