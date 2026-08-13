---
title: Web/API 正式环境部署复核（帖子详情头部与标题样式同步）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（帖子详情头部与标题样式同步）

## 结论

通过。帖子详情返回控件、类型标签、标题/ID 对齐和分割线等本轮 UI 调整已上线。
公网健康检查、迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新
镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `bbdf4d9591989f715ad41a606bfb9375fe644557`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-bbdf4d9.bundle`（SHA256
  `bf5e148b83c0b25417f7f7632e9f86e94a207ce70f9ac89b70bca7ff978b07b3`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `e2dbd304a6` 的内容：
  - 工作项编辑 / 流转弹窗改为固定底部按钮区并规范按钮间距；
  - 编辑工作项表单字段移至富文本上方并单行排列；
  - 帖子详情返回控件经过多轮调整，最终为无边框 + 周边阴影的轻量圆形图标；
  - 帖子详情左右间距加大、移除返回按钮悬浮样式；
  - 帖子类型改为实心彩色标签并置于标题前，标签高度微调；
  - 帖子标题加大，ID 前缀与视觉基线对齐；
  - 标题与主内容分割线颜色加重。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:01bca7ae5602e83c9e884956ea5bd2f8d517ddabe89ab3d5a80c9e55c996b2e5`，
  构建时间 2026-08-13T15:29:09+08:00。
- 发布版本：`20260813152833`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `3c5a666fb4f257911a564960dd287341a04c32ff9e3d2582313e2cb080e21d7a`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=84 attached=84 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813152912.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813072912`

## 部署过程说明

首次使用 `ssh -tt` 执行部署时，`docker compose run` 在维护容器阶段陷入
SIGTTOU 信号转发循环（持续向已删除容器 ID 发送 kill?signal=TTOU 并收到 404），
部署进程被卡住。已终止该进程并确认未执行迁移 / seed；改用无 PTY 的 SSH 会话
重跑同一脚本，后续步骤全部正常完成。

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260813152833"}`。
- SPA 静态资源：
  - `/web/app/assets/index-Dfe0ZTGE.js`
  - `/web/app/assets/index-CYSgRAuA.css`
- 线上 JS 已确认包含 `work-item-edit-meta-fields`、`work-item-detail-center`、
  `ID:` 标记；线上 CSS 已确认包含 `work-kind`、`work-item-edit-meta-fields`、
  `work-item-detail-center` 标记，确认本轮 UI 产物已上线。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任意帖子详情。
2. 确认返回按钮为无边框 + 周边阴影的轻量圆形图标，且无悬浮样式。
3. 确认帖子类型标签（任务 / 需求 / Bug）为实心彩色并位于标题前。
4. 确认标题字号加大、`ID:` 前缀与标题底部视觉对齐，标题与主内容之间分割线
   颜色加重。
5. Desktop 通过共享前端自动同步，无需单独发布。
