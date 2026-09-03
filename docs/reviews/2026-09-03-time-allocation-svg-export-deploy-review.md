# 时间管理 SVG 导出正式部署复核

## 标题信息

- 主题：时间管理排期支持导出当前视图为 SVG
- 关联提交：`98e515f feat: 时间管理排期支持导出 SVG`
- 负责人：Codex
- 日期：2026-09-03

## 结论

通过。正式环境已发布，公网健康、版本、静态资源、容器镜像、迁移与文件审计均
通过；线上 JS 已确认包含“导出 SVG”按钮文案。

## 发布结果

- 发布版本：`20260903152546`
- 发布源：`/srv/yuance/release-source`，HEAD = `98e515f609922f8805e1150370986bb630aacb17`
- bundle：`/tmp/yuance-production-98e515f.bundle`
  - SHA256：`4bc9ac7d3cd0678abe206c8c785fd4f73cb0a284bacf7124ad1535d403906319`
- 镜像 tar SHA256：`a18a03b2129a64b383563c3c7248dbfac73f9b52017f975f63b3665cbb2db5c6`
- 镜像 ID：`sha256:bfdb63181a62b6230c1de799e1c1e101fd176b3a53fb1601c756ae5f7f78914d`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=134 attached=134 orphan=0。
- 主密钥：未变更，未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260903153025.tar`
  - `/srv/yuance/backend/backups/20260903073026`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready，production / sqlite-connected。
- `/version.json`：`{"version":"20260903152546"}`。
- `GET /web/app/assets/index-9BSdJhAc.js`：HTTP 200，immutable 静态资源，命中
  “导出 SVG”。
- `GET /web/app/assets/index-BOgbGhn5.css`：HTTP 200，immutable 静态资源。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。

## 验收步骤

1. 打开时间管理页，在日/周/月任一粒度及人员排期或项目排期视角下调整时间跨度。
2. 点击右上角“导出 SVG”，确认生成的文件可预览、可缩放，且结构与当前视图一致。
3. 导出后再返回页面操作一次，确认导出不会改变排期数据或页面状态。
