# 时间管理跨度与并发展开正式部署复核

## 标题信息

- 主题：时间管理时间跨度改为以今天为中心对半展开，并新增并发排期左键展开列表
- 关联提交：
  - `821397b feat: 时间管理跨度以当前日期为中心前后对半展开`
  - `128d0da feat: 时间管理点击并发排期展开叠加项目列表`
- 负责人：Codex
- 日期：2026-09-03

## 结论

通过。正式环境已发布，健康检查、版本、静态资源、容器镜像、迁移与文件审计
均通过。

## 发布结果

- 发布版本：`20260903142041`
- 发布源：`/srv/yuance/release-source`，HEAD = `128d0da02e37abf8abd7a7b4b1e53132cfd0072d`
- bundle：`/tmp/yuance-production-128d0da.bundle`
  - SHA256：`e2403b918654569ea60864f231904bbf30addd37edfae2672544e7c91ab3d144`
- 镜像 tar SHA256：`8dd5a1e3bd886b449ce4d8738dc168cd6429fa7a2084c26927ec61ccdc32878e`
- 镜像 ID：`sha256:dcb785be143d7a5d587a98e5c53b3fdbcbeb75512a5e81d45468caf153289ce0`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=134 attached=134 orphan=0。
- 主密钥：未变更，未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260903142526.tar`
  - `/srv/yuance/backend/backups/20260903062527`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready，production / sqlite-connected。
- `/version.json`：`{"version":"20260903142041"}`。
- `GET /web/app/assets/index-Brh465SM.js`：HTTP 200，immutable 静态资源。
- `GET /web/app/assets/index-BOpDVRQY.css`：HTTP 200，immutable 静态资源。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。

## 验收步骤

1. 打开时间管理，确认默认 4 个月跨度以今天为中心，过去与未来各约 2 个月；
   手动调大跨度时两侧同步扩展。
2. 对同一成员同一时间节点存在多个并发排期的区域左键单击，确认出现带过渡动画
   的并发项目展开列表。
3. 点击展开列表任意一项、列表外部或按 Esc，确认列表收起。
4. 拖动/缩放/右键编辑/双击删除等原有交互不受影响。
