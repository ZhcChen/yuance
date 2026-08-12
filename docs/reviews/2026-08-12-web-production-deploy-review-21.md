---
title: Web/API 正式环境部署复核（项目资料详情仅正文内联附件）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（项目资料详情仅正文内联附件）

## 结论

通过。项目资料详情已按旧版收口为“正文内联附件”展示，独立“资料附件”卡片不再
出现，重复的历史附件记录不再展示；正式环境健康检查、迁移、seed、文件对象审计均
正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `b5f0134`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-b5f0134.bundle`，scp 到
  WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `bcae16b` 的内容：移除资源详情独立附件卡及对应删除/定位死代码，
  附件只通过正文内联展示；同步视觉基线契约与资源相关 E2E 断言。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:5e90067f76d30afe4416aaa354b5823e8699d72bece4b9743e882882bf89922a`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，`migrate up` 无新迁移，
  `seed core` 执行成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812110259.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812030259`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- 正式前端资产 `assets/index-CCA9_5vy.js` 包含“资料正文”标记，且不再包含
  `resource-attachments-card`、`选择附件上传`。

## 异常与恢复记录

- 部署脚本 `docker compose run` 维护步骤再次复现 Compose 空转：维护容器已退出并
  被 `--rm` 清理，CLI 进程约 207% CPU 不返回；主 `yuance-api` 期间保持旧镜像
  healthy，公网服务未中断。
- 恢复路径：确认维护容器不存在后终止空转链，改用一次性 `docker run --env-file
  .env` 容器完成 `migrate status`（30/30）、`migrate up`、`seed core`，随后
  `docker compose up -d --force-recreate --remove-orphans api` 重建成功。
- 文件审计阶段 `docker compose exec` 同样空转；改用 `docker exec yuance-api
  ./yuance-api files audit-objects` 完成审计并通过。
- 再次建议：正式部署脚本的维护与审计步骤改为一次性 `docker run` / `docker exec`，
  不再依赖 Compose `run` / `exec` 交互路径。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后打开任意项目资料详情。
2. 确认正文下方不再出现独立“资料附件”卡片和“选择附件上传”按钮。
3. 确认正文内联附件正常展示，点击后可预览、下载。
4. 编辑资料时仍可粘贴图片、插入正文引用并移除引用。
5. Desktop 通过共享前端自动同步，无需单独发布。
