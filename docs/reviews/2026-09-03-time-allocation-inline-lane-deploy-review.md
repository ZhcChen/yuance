# 时间管理重叠排期成员行内分行正式部署复核

## 标题信息

- 主题：移除并发排期点击展开列表，改为同一成员行内按重叠自动分行展示
- 关联提交：`6b7dea2 feat: 时间管理重叠排期改为成员行内自动分行展示`
- 负责人：Codex
- 日期：2026-09-03

## 结论

通过。正式环境已发布，公网健康、版本、静态资源、容器镜像、迁移与文件审计均
通过；线上 JS/CSS 已确认包含本次新文案与 `.time-gantt-lanes` 样式，且不含已
废弃的并发弹窗产物。

## 发布结果

- 发布版本：`20260903150242`
- 发布源：`/srv/yuance/release-source`，HEAD = `6b7dea236aad38f931d26e69c30e880dfc9e662a`
- bundle：`/tmp/yuance-production-6b7dea2.bundle`
  - SHA256：`5d03bf86a510817535bc747c0d17a56624db2a0f0076d927a0d232b04cb72b29`
- 镜像 tar SHA256：`b7189284e8eb7244a117118f1019e50b1eb0405f6ea5e0066f5e30508c3e78e1`
- 镜像 ID：`sha256:666f5a9c6ab2cd04564730957f2d694dd76cc7af6f35d1d15f7a81b25b06c923`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=134 attached=134 orphan=0。
- 主密钥：未变更，未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260903150327.tar`
  - `/srv/yuance/backend/backups/20260903070327`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready，production / sqlite-connected。
- `/version.json`：`{"version":"20260903150242"}`。
- `GET /web/app/assets/index-hZvurn60.js`：HTTP 200，immutable 静态资源。
- `GET /web/app/assets/index-BOgbGhn5.css`：HTTP 200，immutable 静态资源。
- 线上 JS 命中新提示文案 3 处，线上 CSS 命中 `.time-gantt-lanes` 3 处，未命中
  `time-gantt-stack` / “并发区域可展开”。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。

## 验收步骤

1. 打开人员排期视角，找到同一成员存在并发重叠时间段的排期，确认不再弹出叠加
   列表，而是在该成员姓名下方自动分成多行 lane 清晰展示。
2. 对不存在重叠的排期，确认仍可尽量复用同一行，避免整行无谓增高。
3. 确认拖拽新建、拖动色块、左右缩放、右键编辑、双击删除与悬浮详情不受影响。
4. 切换日/周/月粒度并调整时间跨度，确认 lane 布局在横向滚动与拉伸宽度下正常。
