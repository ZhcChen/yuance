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
公网服务器 `qfy-sc-test` 只承担 Nginx 与 FRPS 入口；其上已停止的旧环境数据早已过期，冷回滚路径已作废（见“回滚”）。

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
`/srv/yuance/build/<commit>` 中解压提交归档，先按 lockfile 执行 `npm ci`，
再执行 `npm run check:frontend`、`docker buildx build --platform linux/amd64`
和 `docker save`。这样归档工作区自包含，不依赖发布机的 `node_modules`；构建产物先写入
该编译目录，完成运行目录当前镜像备份后才复制到 `/srv/yuance/releases`。

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

同一 Docker Engine 上串行发布：远端流程在加载镜像前获取 `/run/lock/yuance-backup.lock`（`flock`，最多等待 15 分钟），与每日备份共用同一把锁，第二次发布或备份会等待或失败退出。维护容器仍按前缀统一清理，不要在发布期间手工运行同前缀容器。

镜像标签：远端构建产出 `yuance-api:release-<提交前 12 位>`，构建阶段不改写正在运行的 `yuance-api:latest`。加载后另打 `yuance-api:<提交前 12 位>`，迁移容器显式使用该标签；`latest` 在迁移成功后才切换到新镜像，因此迁移失败或容器被意外重启时不会以新代码访问未迁移的数据库。`/srv/yuance/releases` 默认保留最近 3 份镜像 tar（`YUANCE_KEEP_RELEASE_BACKUPS`）。

健康检查：`90-healthcheck.sh` 在窗口内重试（默认 30 次、间隔 2 秒），healthz 与 readyz 都成功才通过；远端发布结束后，发布机再经公网 `https://yuance.quanxinfu.com/api/readyz` 复核（`YUANCE_PUBLIC_HEALTH_URL`，置空可跳过）。API 收到停机信号后会主动结束 SSE 长连接，旧实例不再固定等满停机宽限期。

1. 预检目标机 Docker、Docker Compose、`sqlite3` 和 `.env`，再构建并校验 `linux/amd64` 镜像 tar。
2. 备份 `/srv/yuance/releases` 中当前镜像 tar。
3. 同步 Compose、app 元数据和运维脚本，但不覆盖 `.env` 或数据。
4. 加载镜像并使用 Compose 的 `stop_grace_period` 优雅停止旧 `yuance-api`，禁止其在迁移回填后继续签发未登记的 PUT URL。停机宽限期默认读取目标机 `.env` 中的 `YUANCE_STOP_GRACE_PERIOD`；仅当本机发布命令显式设置该变量时才覆盖目标机配置，并将最终值显式交给 Compose。部署脚本的外层停止超时按实际宽限期加 60 秒余量计算；配置无效、停止失败或最终快照失败时，迁移尚未执行，脚本只尝试恢复原本正在运行的 API。
5. API 完全停止后，以 SQLite `.backup` 生成最终一致性单文件快照；生产部署只接受 `sqlite:///data/yuance.sqlite3`，并校验快照路径对应 Compose 的 `/data/yuance.sqlite3` 挂载。数据库缺失、数据库 URL 不匹配、快照失败或完整性检查失败都会阻止迁移。快照通过完整性检查后才进入迁移；失败时脚本会尝试重新启动旧 API。
6. 在单次维护容器内执行 `migrate status`、`migrate up`、`seed core`。
7. 重建 `yuance-api`，检查 health、ready、文件对象审计和镜像 ID。

迁移失败时部署脚本会保持 API 停止。不得直接重启旧版本写服务，因为它可能继续签发不记录有效期的上传 URL；必须先按 API 停止后的对应备份恢复数据库，再启动匹配版本的应用，或修复后继续部署新版本。

维护容器只有在 `migrate up` 已完成迁移历史校验并即将调用迁移器时，才会在 `/data` bind mount 创建并同步迁移阶段标记。容器无法启动、`migrate status` 失败或 `migrate up` 前置校验失败时不会生成标记，退出清理会尝试恢复原本运行的 API。标记代表迁移阶段即将执行，而非数据库已发生修改；标记后、迁移器首条 SQL 前的中断会保守地保持 API 停止。

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
`YUANCE_PRUNE_DANGLING_IMAGES` 和 `YUANCE_SKIP_LOCAL_BUILD` 只接受 `0` 或 `1`；
三个超时参数使用正整数加 `s`、`m` 或 `h`，每项不超过 24 小时。`YUANCE_API_IMAGE` 必须是有效的 Docker 镜像名及可选标签，
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
YUANCE_FILE_MASTER_KEY=<可选，留空则自动生成到 /data/secrets/file_master_key>
```

`YUANCE_STOP_GRACE_PERIOD` 按 Compose 时长格式填写，范围为 `1s` 至 `24h`，支持 `.env` 的 `KEY=VALUE` 和 `KEY: VALUE` 格式。生产 `YUANCE_DATA_DIR` 只能留空或设为 `/data`；其他值及发布进程传入的非 `/data` 覆盖会在停机前拒绝，发布脚本校验后会清除进程环境覆盖。数据库 URL 与文件主密钥也按 Compose 的两种赋值格式校验，快照 manifest 会正确识别冒号格式主密钥。发布脚本安全读取目标机 `.env`，并清除数据库 URL 的进程环境覆盖以保证迁移和快照使用同一生产数据库；如需临时覆盖停机宽限期，显式设置发布机环境变量，例如 `YUANCE_STOP_GRACE_PERIOD=90s ./scripts/deploy-production.sh`。外层 `timeout` 会在该值上增加 60 秒余量。

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

维护页由 Nginx 本地生成，只捕获上游不可达（502）与超时（504），以 **503** 状态返回“系统正在更新中”，
不依赖 `yuance-api`、FRP 或 SSE。应用自身返回的 503（例如数据库不可用时的 `/api/readyz`）原样透传，
监控与发布检查据此判断真实状态；不要再把 503 改写为 200。页面默认带 `Cache-Control: no-store`、
`Retry-After: 5`，并每 5 秒自动重试。server 级下发 `Strict-Transport-Security: max-age=31536000`；
`nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy`、`frame-ancestors` 由应用层统一补齐。不要把该 server block 与旧 Yuance
block 同时保留。

FRPS 的代理端口只监听 `127.0.0.1`，禁止向公网开放 `40000-40999`。

## 数据备份

### 每日异地备份（自动）

`qfy-test2` 的 systemd timer `yuance-backup.timer` 每天 03:30（随机延迟 15 分钟）执行
`scripts/40-offsite-backup.sh`：

1. 调用 `00-backup-sqlite.sh` 生成在线一致性快照（含自动生成的文件主密钥），并附上 `.env`（含安全主密钥）。
2. 打包压缩后用 age 公钥（`/etc/yuance-backup/age-recipient.txt`）加密，上传到独立 Bucket
   `oss://yuance-backup/daily/`（cn-shanghai，私有、阻止公共访问、版本控制、`daily/` 生命周期 90 天，历史版本 30 天）。
3. 上传凭据为 RAM 用户 `yuance-backup-writer`（策略 `yuance-backup-daily-rw`：仅 `daily/` 前缀的读写，无删除权限），
   配置在 `/etc/yuance-backup/rclone.conf`（root 0600）。
4. 本地 `backups/` 保留最近 14 份快照与每月首份（`YUANCE_BACKUP_KEEP_DAILY`），其余删除。
5. 结果写入 `backups/.offsite-status`，日志在 `/var/log/yuance-backup.log`。

age 私钥只在离线介质保管，服务器只有公钥：服务器被入侵也无法解密历史备份。私钥丢失则异地备份全部不可用，
需与文件主密钥、安全主密钥一同离线保存两份。

检查与手动触发：

```bash
systemctl list-timers yuance-backup.timer
cat /srv/yuance/backend/backups/.offsite-status
sudo systemctl start yuance-backup.service   # 手动执行一次
```

### 恢复演练（每季度）

在持有 age 私钥的机器上执行，私钥经 SSH 标准输入写入目标机 `/dev/shm`，结束即删除：

```bash
scripts/ops/restore-drill.sh --identity <age 私钥文件> [--host qfy-test2] [--archive <归档名>]
```

脚本下载最近一份异地备份，校验 SHA-256、解密解压到临时目录，执行 `PRAGMA integrity_check`，
并用临时容器对恢复出的数据库执行 `migrate status` 与 `files audit-objects`（验证安全主密钥能解密存储配置、
业务 Bucket 可读），最后清理临时目录。输出贴入 `docs/reviews/` 留档。

真实恢复到新主机：按演练步骤解密得到 `yuance.sqlite3`、`secrets/file_master_key`、`env.backup`，
放入新主机的 `data/` 与 `.env`，再按下文“回滚”中的数据库恢复步骤启动匹配版本的镜像。

### 发布前快照

发布前执行：

```bash
cd /srv/yuance/backend
./scripts/00-backup-sqlite.sh
```

备份脚本使用 SQLite `.backup` 在活动数据库上生成同一时点的单文件快照，不要求为备份停止 API，
也不会将活动数据库的主库、`-wal`、`-shm` 分别复制后误称为一致快照。目标机需预装 `sqlite3`；
快照必须通过 `PRAGMA integrity_check` 才会生成 manifest 并报告成功。备份目录为 `0700`，
数据库快照、manifest 和密钥为 `0600`。

正式部署必需快照只从 `$BACKEND_DIR/data/yuance.sqlite3` 读取，也就是 Compose `./data:/data` 的宿主挂载源；不得回退到宿主机 `/data/yuance.sqlite3`。快照会清除继承的数据库、数据目录和备份路径变量，防止目标被 shell 环境重定向；validator 只接受 `/data` 生产目录。若 Compose 环境设置了 `YUANCE_FILE_MASTER_KEY`，快照会使用同一值，并在 manifest 中记录外部配置依赖。每个备份目录包含 `yuance.sqlite3` 和 `manifest.txt`。当文件主密钥来自自动生成的数据文件时，
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

确认后去掉 `--dry-run`。当前命令只做数据库软删除，不删除 OSS 物理对象；若对象签发过上传 URL，还会等到最后一张 URL 到期后 4 小时 5 分钟再失效对象，以免 URL 到期时仍在进行的 PUT 无法完成登记。

资料附件、评论附件和系统发行资产的对象物理清理由同一 outbox 命令处理；项目附件仍只归档。API 删除后至少等待 65 分钟；若最近签发的 PUT URL 有更晚到期时间，则任务不早于该 URL 到期后 4 小时 5 分钟，以覆盖在途 PutObject 请求。迁移前没有到期记录的文件对象会保守回填为迁移时刻后 1 小时，因此这类对象的删除任务还会额外等待最多 5 小时 5 分钟。先 dry-run 确认到期数量，再按批次执行：

```bash
docker compose --env-file .env -f compose.yaml exec -T api \
  ./yuance-api files cleanup-deleted --dry-run --limit 100
docker compose --env-file .env -f compose.yaml exec -T api \
  ./yuance-api files cleanup-deleted --limit 100
docker compose --env-file .env -f compose.yaml exec -T api \
  ./yuance-api files deletion-jobs --limit 100
```

失败任务会保留并延迟重试；命令失败时运行 `files deletion-jobs` 检查任务状态、重试时间和最近错误，再按 `docs/runbooks/file-maintenance.md` 排查原存储配置。不得用当前活动 Bucket 替代任务保存的原始位置。

资料库新附件加密主密钥文件 `/data/secrets/file_master_key` 属于数据目录持久化内容。
正式回滚时必须根据备份 manifest，将数据库快照与对应密钥作为一个恢复单元。恢复数据库前
停止 API；替换 `data/yuance.sqlite3` 后删除旧 `data/yuance.sqlite3-wal` 和
`data/yuance.sqlite3-shm`，若来源为 `data-file` 则同时恢复该备份中的主密钥，并确认 `.env` 中
`YUANCE_FILE_MASTER_KEY` 为空且调用 Compose 的 shell 没有提供非空值覆盖。
若来源为 `environment`，必须从受控配置恢复相同 `YUANCE_FILE_MASTER_KEY`，不得将密钥
写入普通备份。先确认 `PRAGMA integrity_check` 为 `ok`，再加载匹配版本的镜像并启动 API；
随后检查迁移状态、文件对象关系、健康状态和测试附件解密。

## 回滚

**公网旧环境冷回滚已作废**：`qfy-sc-test` 上旧数据库最后写入于 2026-08-02，旧容器已不存在（2026-11-25 核查），
落后多个 schema 版本与数月数据，启动它会造成数据分叉，不得再作为回滚目标。回滚只在 `qfy-test2` 上进行。

只回滚应用版本（未执行破坏性迁移时）：

```bash
cd /srv/yuance/backend
docker image ls yuance-api            # 每次发布都保留 yuance-api:<提交前 12 位> 标签
docker tag yuance-api:<上一版提交前 12 位> yuance-api:latest
docker compose --env-file .env -f compose.yaml up -d --force-recreate api
./scripts/90-healthcheck.sh
```

镜像已被清理时，从 `/srv/yuance/releases` 中最近 3 份 tar 执行 `docker load` 后再打标签。
若还需回滚数据库，必须按对应备份的 manifest 停服务并恢复单文件快照、自动主密钥
或受控环境密钥，不能将其他时间点的 WAL/SHM 与快照混用。

## 禁止事项

- 禁止提交、打印或记录真实 `.env`、OSS AccessKey、FRP token。
- 严禁使用 GitHub Actions 或新增 GitHub 构建配置执行正式环境构建、发布和部署。
- 禁止在正式环境执行 `seed demo` 或 `seed local-admin`。
- 禁止修改已经发布的 SQL migration。
- 禁止新旧两端同时提供写服务。
- 禁止把 `qfy-sc-test` 作为部署脚本的隐式默认目标。
- 禁止手工创建第二个同域名 Nginx 或 Caddy 站点。
