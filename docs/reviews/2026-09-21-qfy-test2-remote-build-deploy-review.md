---
title: qfy-test2 同机编译发布复核
type: review
status: complete
date: 2026-09-21
---

# qfy-test2 同机编译发布复核

## 范围

本次将正式环境的编译机与部署机统一为 `qfy-test2`。发布机只负责校验
`main`、生成 `git archive HEAD` 并通过 SSH/SCP 传输；源码在
`/srv/yuance/build/<commit>` 编译，运行目录仍为 `/srv/yuance/backend`。

## 变更

- `scripts/deploy-production.sh` 增加显式 `YUANCE_DEPLOY_BUILD_MODE=remote`。
- 远程构建前在隔离目录安装三个前端 lockfile 依赖，并跳过与 API 镜像无关的 Electron 平台二进制下载。
- 构建产物先留在编译目录，运行目录的旧镜像完成备份后才复制到 `releases`。
- 保留构建提交标识、构建产物 SHA256、SQLite 发布前备份、迁移/seed、健康检查和运行镜像 ID 校验。
- `scripts/validate-deploy-templates.sh` 增加同机编译路径、源码归档和运行目录隔离契约。
- 允许保留本机 `.compound-engineering/config.yaml` 的显式配置改动，但不允许其他工作区改动绕过发布门禁。

## 验证

- `sh -n scripts/deploy-production.sh scripts/build-api-image-amd64.sh scripts/validate-deploy-templates.sh`：通过。
- `./scripts/validate-deploy-templates.sh`：通过；本机因没有 Docker Compose 跳过 compose config。
- qfy-test2 依赖检查：x86_64、Node v24.15.0、npm 11.12.1、Docker 29.7.2、Buildx 0.36.1、Compose 5.5.0、BuildKit 可用。
- qfy-test2 前端检查：Web、frontend workspace、desktop renderer 均通过。
- qfy-test2 镜像：`linux/amd64`，构建产物 SHA256 为 `00d38ad62747b2cc0a091fc1cdc8f7b058a7402b9eafa027a62d9ccc149ae4f7`。
- 正式发布：commit `3a4f0b3`，迁移 `35/35`，core seed 通过，SQLite 备份目录为 `qfy-test2:/srv/yuance/backend/backups/20260921023920`，旧镜像回滚制品为 `qfy-test2:/srv/yuance/releases/yuance-api-linux-amd64.before-20260921103917.tar`。
- 健康检查：`http://127.0.0.1:33033` 通过；运行镜像 ID 校验通过。

## 结论

qfy-test2 同机编译和发布链路已验证可用。构建失败发生在镜像加载之前，不会触发正式容器重启；发布成功后临时源码工作区按策略清理，Docker BuildKit 缓存保留供后续暖构建复用。

## 风险记录

本次 npm 安装报告了现有依赖树中的审计和弃用告警，未改变 lockfile，也未阻断发布。后续应单独安排依赖升级，不在发布链路中自动执行 `npm audit fix`。
