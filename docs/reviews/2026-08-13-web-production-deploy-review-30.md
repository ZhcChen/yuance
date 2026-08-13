---
title: Web/API 正式环境部署复核（富文本粘贴按文件内容去重）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（富文本粘贴按文件内容去重）

## 结论

通过。富文本粘贴同一张图片时，无论剪贴板以 `items`/`files` 双份暴露还是携带
不同文件名/时间戳，都只保留一个上传节点、只上传一次；正式环境公网健康检查、
迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `f494254a19445a76ddc0bf11892691381a3ffdf5`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-f494254.bundle`（SHA256
  `9555a3cc489f94b6233ae416ac03eeaeaacf7e2d5a3782bad1a43415867b72ef`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步（`68cd9a6..f494254`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `68cd9a6` 的内容：
  - 帖子详情无工作项附件时隐藏“历史资料 / 已有附件”空区块；
  - 富文本粘贴快速指纹不再依赖 `lastModified`，避免同一图片在 `items` 与
    `files` 中因时间戳不同被当成两个文件；
  - 同一粘贴批次内按文件内容 FNV-1a 去重，覆盖不同文件名/时间戳的重复包装；
  - 粘贴插入位置使用局部 Range，异步去重后仍插入原位置；
  - E2E 模拟真实剪贴板 `items` + `files` 暴露同一图片、不同 `lastModified`
    与不同文件名，断言只出现一个节点、只上传一次。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:eb264837d62280ba171fea9882ed812e5d410e1c4b503218e190e6a97fb3865a`，
  构建时间 2026-08-13T10:02:11+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `1f196c382708c18054d1bc8edf7bb005331c389d37ee2474c44cb44f59e15ff5`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=73 attached=73 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813100501.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813020502`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-DRoEKW5G.js`
  - `/web/app/assets/index-yBtL_TmG.css`

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，在帖子详情、编辑弹窗或新建工作项的
   富文本中复制并粘贴一张图片，确认只出现一个上传节点、只上传一次。
2. 在 macOS/Windows 上分别验证系统剪贴板粘贴图片，确认不再出现两张相同图片。
3. 打开无工作项附件的帖子详情，确认评论区下方不再显示“历史资料”空区块。
4. Desktop 通过共享前端自动同步，无需单独发布。
