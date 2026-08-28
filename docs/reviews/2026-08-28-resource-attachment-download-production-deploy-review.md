---
title: Web/API 正式环境部署复核（资料库附件下载交互与加密下载状态）
type: review
status: completed
date: 2026-08-28
---

# Web/API 正式环境部署复核（资料库附件下载交互与加密下载状态）

## 结论

通过。资料库附件右键菜单已移除“复制链接”，下载继续走前端解密 + 自动保存链路；
下载过程中文件卡片显示“正在下载中 + loading”遮罩，预览弹窗下载按钮同步展示
loading。正式环境健康检查、迁移、文件审计均正常，容器运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，`6ccb721..dee7329` fast-forward，
  发布源 HEAD = `dee7329a129d246bf7a55d71a26824722d045672`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-dee7329.bundle`（SHA256
  `81f71de82b3ee444ec06fe80691c54feebe88b71d1a44915ce92d067cc5f0797`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后在 WSL 无 TTY 执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `6ccb721` 的提交：
  - `44e9b15` docs: 复核资料库附件静态加密正式部署
  - `dee7329` feat: 资料库附件下载移除复制链接并展示解密下载状态

## 发布结果

- 镜像：`yuance-api:latest`，发布版本 `20260828184633`。
- 镜像 ID：`sha256:d61ccf83ef649cb80ec5f1e76e9084d3dee24a65ec253a6f791a5fda79dc35ce`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `d26e3615075d9a45faa7f86fe69bc8c377cb57e234d7d8b274f23b8d8c65d6f2`。
- 容器：`yuance-api` running / healthy，运行镜像与最新镜像一致。
- 迁移：`migrate status` applied=33 total=33，state ok；无新增迁移。
- 文件对象审计：total=117 attached=117 orphan=0；数据库中加密文件对象 1 个、
  明文 130 个（含软删除记录）。
- 文件主密钥：与上次发布一致，`/srv/yuance/backend/data/secrets/file_master_key`
  （0600），SHA256
  `1b44994bd816b0dd5da13c51894f7b5c75eb0c929f6215c15480a842d2f9261f`。
- 回滚保护：
  - 镜像 tar 备份 `/srv/yuance/releases/yuance-api-linux-amd64.before-20260828184907.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260828104907`（3 个文件）

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，database sqlite-connected。
- `/version.json`：`{"version":"20260828184633"}`。

## 验收步骤

1. 登录正式环境，进入任意资料详情页。
2. 右键资料正文内的文件附件：菜单不应再出现“复制链接”，只保留预览/下载。
3. 点击下载：对应文件卡片显示“正在下载中 + loading”，加密附件下载完成后
   前端自动保存解密后的文件。
4. 从附件预览弹窗点击下载：下载按钮切换为 loading 并禁用重复点击。

## 风险与后续

- 本次为纯前端交互改动，API 与数据契约未变，无需额外迁移。
- 新上传加密附件的解密下载链路沿用上一版本，主密钥保持不变。
