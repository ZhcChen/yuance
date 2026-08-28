---
title: Web/API 正式环境部署复核（资料库新附件 OSS 静态加密）
type: review
status: completed
date: 2026-08-28
---

# Web/API 正式环境部署复核（资料库新附件 OSS 静态加密）

## 结论

通过。资料库新附件 OSS 静态加密已部署到正式环境，迁移 33/33，文件对象审计
attached=116 orphan=0，公网健康检查正常，容器运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，`b674492..6ccb721` fast-forward，
  发布源 HEAD = `6ccb7214f1329ea617aeb5fa894482b53654d91a`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-6ccb721.bundle`（SHA256
  `7764e0b1c0db70d1f571ad2249505517c18b260d550d8766cfe78bf1a61ae92a`），
  scp 到 WSL 后切换 origin 引用并 ff-only 同步，随后在 WSL 无 TTY 执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `b674492` 的提交：
  - `77e1e86` docs: 记录资料库 SVG 附件预览正式部署复核
  - `a706d46` docs: 规划资料库附件 OSS 静态加密与前端解密
  - `6417402` feat: 资料库新附件 OSS 静态加密服务端支持
  - `e0c4d11` feat: 资料库新附件 Web 端加密上传与解密下载
  - `1c76b8c` feat: 资料库新附件 Desktop 端加密上传与解密下载
  - `3dd7885` docs: 记录资料库附件静态加密部署密钥说明
  - `27cca10` fix: 资料库 Desktop 加密上传按 1MB 分块加密
  - `6ccb721` docs: 复核资料库附件静态加密实现

## 发布结果

- 镜像：`yuance-api:latest`，发布版本 `20260828165227`。
- 镜像 ID：`sha256:70127c5b580d3e51e4a58069f62e3dc5520353e862edb96b8dca2b20777d3fa5`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `06e637527fb2483dc4affcc2830ed4142596bdbb1239a0ed7db08d204444ac38`。
- 容器：`yuance-api` running，运行镜像与最新镜像一致。
- 迁移：`migrate status` applied=33 total=33，state ok；新增
  `202608280001 add file object encryption`；`migrate up`、`seed core` 成功。
- 文件对象审计：total=116 attached=116 orphan=0。
- 文件主密钥：未配置 `YUANCE_FILE_MASTER_KEY`，首次启动自动生成
  `/srv/yuance/backend/data/secrets/file_master_key`（0600），SHA256
  `1b44994bd816b0dd5da13c51894f7b5c75eb0c929f6215c15480a842d2f9261f`。
- 回滚保护：
  - 镜像 tar 备份 `/srv/yuance/releases/yuance-api-linux-amd64.before-20260828170350.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260828090350`（3 个文件）

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，database sqlite-connected。
- `/version.json`：`{"version":"20260828165227"}`。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，进入项目资料库。
2. 上传一个新附件，确认上传成功且 OSS 侧保存的是密文（`YUANCE-ENC-v1` 块格式）。
3. 下载该附件，确认浏览器端可正常解密打开。
4. 已上传的旧附件应仍可正常预览和下载，不受本次加密改造影响。

## 风险与后续

- 主密钥已生成且后续不应更换；请单独备份
  `/srv/yuance/backend/data/secrets/file_master_key`，建议保存到安全位置。
- 若以后显式配置 `YUANCE_FILE_MASTER_KEY`，必须先与已生成密钥一致，否则新加密
  附件将无法解密。
- 本部署只影响后续新上传的资料库附件，存量明文附件保持原状。
