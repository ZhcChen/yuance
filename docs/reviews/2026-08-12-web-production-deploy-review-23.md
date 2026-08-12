---
title: Web/API 正式环境部署复核（文档预览操作区侧栏化）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（文档预览操作区侧栏化）

## 结论

通过。文档预览页已正式切换为“左侧操作栏 + 右侧渲染区”布局，Word/PDF 等文档
渲染区获得完整页面高度；公网健康检查、迁移、seed、文件对象审计均正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `e21f774`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-e21f774.bundle`，scp 到
  WSL 后切换 origin 引用并 ff-only 同步（`f733604..e21f774`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `f733604` 的内容：移除文档预览顶部两层横向工具条，改为左侧
  操作栏（标题/元信息、文件操作、查看工具）+ 右侧渲染区；PDF 保留右侧快速定位
  栏；错误页复用侧栏布局；补充分栏布局复核文档。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:fe6d756d032b644bbbf4bd79f1ba9f8b500b589490c6d0022fd35cd6c4682ee3`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812122714.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812042714`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- `/static/document-preview.css`：200，已包含 `preview-panel-rail`、
  `preview-rail-label`、`grid-template-columns: 268px`、
  `preview-shell-error`、`preview-panel-body-error` 等新布局标记。
- 本地聚焦验证（发布前）：PDF 操作栏 268×795、渲染区 904×795、右侧定位栏
  248×795；Word 操作栏 268×795、文档渲染区 904×795，交互标记清单校验通过。

## 异常与恢复记录

- 部署脚本 `docker compose run` 维护步骤再次复现 Compose 空转：维护容器已退出并
  被 `--rm` 清理，CLI 进程高 CPU 不返回；主 `yuance-api` 期间保持旧镜像
  healthy，公网服务未中断。
- 恢复路径：确认维护容器不存在后终止空转链，改用一次性 `docker run --env-file
  .env` 容器完成 `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功，
  健康检查、文件审计与镜像 ID 校验通过。
- 再次建议：正式部署脚本的维护步骤改为一次性 `docker run`，避免继续依赖
  Compose `run` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后打开任意 PDF 附件预览，确认左侧为
   文件操作和查看工具，中间为 PDF 渲染区，右侧为快速定位栏。
2. 打开 Word/Excel/PPT/文本等非 PDF 附件预览，确认操作栏在左侧，文档渲染区
   占满剩余高度。
3. 缩小窗口到 960px 以下，确认操作栏回退到顶部、PDF 快速定位栏移动到渲染区
   下方，页面不出现横向溢出。
4. Desktop 不依赖该服务端预览边界页，不受本次布局调整影响。
