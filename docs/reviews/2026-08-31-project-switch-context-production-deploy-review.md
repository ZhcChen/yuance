# 项目切换上下文修复正式部署复核

## 标题信息

- 主题：项目切换时资料库/资料详情跟随项目，资料详情高亮保持在资料库
- 关联提交：`9bc89d3 fix: 项目切换时资料库与项目内模块保持正确上下文`
- 负责人：Codex
- 日期：2026-08-31

## 结论

通过。正式环境已发布，健康检查、版本、静态资源、容器镜像、迁移与文件审计
均通过。

## 发布结果

- 发布版本：`20260831150009`
- 发布源：`/srv/yuance/release-source`，HEAD = `9bc89d3086cf9bcdb33cbb76e3673be949863910`
- bundle：`/tmp/yuance-production-9bc89d3.bundle`
  - SHA256：`7b6881606518c23df0802ee614416e328583e404481f14ea7b080dded8505ba1`
- 镜像 tar SHA256：`4a8d5ca5983df41b4ce4f1af957a08b0c09bfbee2e4ae64e96ee1dd656951d3e`
- 镜像 ID：`sha256:4f0ddc925325ccde5faa12c4da707e441e63f68374996db2729ae781a13ed979`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=119 attached=119 orphan=0。
- 主密钥：未变更，未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260831150416.tar`
  - `/srv/yuance/backend/backups/20260831070416`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready，production / sqlite-connected。
- `/version.json`：`{"version":"20260831150009"}`。
- `GET /web/app/assets/index-CEM6A8gp.js`：HTTP 200，immutable 静态资源。
- `GET /static/document-preview-crypto.mjs`：HTTP 200。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。

## 验收步骤

1. 进入资料库，切换当前项目，确认资料库立即展示新项目资料。
2. 打开资料详情，确认顶部导航高亮“资料库”而非“项目”。
3. 资料详情中切换项目，确认回到新项目资料库列表。
4. 顺带确认项目详情 tab、周期详情、个人分析切换项目后的上下文符合预期。
