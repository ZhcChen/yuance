---
title: Web/API 正式环境部署复核（编辑工作项弹窗宽度与富文本粘贴图片去重）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（编辑工作项弹窗宽度与富文本粘贴图片去重）

## 结论

通过。编辑工作项弹窗已恢复原版 1040px 工作表单宽度；富文本一次粘贴同一张
图片不再因浏览器返回多个 File 包装对象而重复上传。正式环境公网健康检查、
迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `f2b7a5760918986112600cd73a618c3ca284ef1d`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-f2b7a57.bundle`（SHA256
  `69dc993f3bd182c9aa01490bcd4442855d21694fdacd43285a7cf68122345b03`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`9203721..f2b7a57`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `9203721` 的内容：
  - 编辑工作项弹窗启用 `wide`，并统一 `.yc-modal-wide` 为
    `min(1040px, calc(100% - 40px))`，与旧版工作表单弹窗宽度一致；
  - 富文本 `pastedFiles` 改为按 `type|name|size|lastModified` 指纹去重，
    items 内部、items 与 files 之间重复包装对象只保留一个；
  - 新增重复粘贴包装对象 E2E 回归，确认只上传一次；
  - 补充编辑弹窗宽度与 wide modal CSS 单测。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:e2c114f1cec74f3b7ef4288cd610227c093fbd5c80de2a469aad9118a5d5f056`，
  构建时间 2026-08-13T09:24:12+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `cb6258a6e35b7ea2532670f769ba2edd125ca33012f67a2a3273941655e3a5cf`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=71 attached=71 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813092415.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813012415`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-DE7utTFU.js` 已包含 `编辑工作项`、`yc-modal-wide`
    与 `lastModified` 去重标记；
  - `/web/app/assets/index-yBtL_TmG.css` 已包含
    `.yc-modal-wide{width:min(1040px,calc(100% - 40px))...}` 与
    `yc-rich-pending-upload` 粘贴上传样式。

## 本地验证

- `@yuance/frontend-ui` 62 个测试通过；`@yuance/frontend-app-shell` 10 个测试
  通过；`web` 52 个测试通过；desktop `check:renderer` 通过。
- 聚焦 E2E `work-item-create-paste-auto-upload.spec.mjs` 通过，覆盖“一次粘贴
  两张不同图片 + 同一张图片的重复包装对象 -> 只上传两个文件”回归。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任一工作项详情页并点击“编辑内容”，
   确认弹窗宽度约 1040px，富文本编辑区域明显变宽。
2. 在编辑弹窗富文本中复制并粘贴一张图片，确认只出现一个上传节点、只上传一次。
3. 打开帖子详情，确认图片只渲染一次。
4. 新建工作项或评论富文本中同样粘贴单张图片，确认不再出现两张一模一样的图片。
5. Desktop 通过共享前端自动同步，无需单独发布。
