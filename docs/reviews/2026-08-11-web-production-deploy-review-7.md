---
title: Web/API 正式环境部署复核（新建粘贴图片提示中性化）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（新建粘贴图片提示中性化）

## 结论

通过。新建工作项先粘贴图片后填写标题的流程已改为中性状态提示：不再出现
“请先填写标题”的警示标题，图片粘贴后显示“已暂存 X 个图片”，填写标题后仍保留
“点击创建时将自动上传”的状态，点击创建即上传并写入主帖。

## 问题与修复

- 现象：上一版粘贴暂存提示被渲染成 `Feedback tone="warning" title="请先填写标题"`，
  用户看到“请先填写标题 / 已暂存 image.png”后误以为系统要求先填标题才能粘贴。
- 修复：
  - 将提示改为普通状态文案，不再使用“请先填写标题”标题。
  - 粘贴时提示“已暂存 X 个图片，填写标题后点击“创建”即可上传。”
  - 填写标题后提示更新为“已暂存 X 个图片，点击“创建”时将自动上传。”，不再消失，
    避免用户忘记已暂存的图片。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，HEAD = `dac6e59`。
- 发布方式：正式 WSL 发布源 ff-only 同步至 `dac6e59` 后执行
  `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 manifest ID
  `sha256:d0009db53395ea4c1984b3b1b3450229ccf7dc432bcc4eddf41394c5b68dda69`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811133330.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811053331`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 新前端资产 `assets/index-B95u4lnc.js` 包含：
  - “已暂存 X 个图片，填写标题后点击“创建”即可上传。”
  - “已暂存 X 个图片，点击“创建”时将自动上传。”
  - 不再包含“请先填写标题”的新建粘贴提示标题。
- `npm run check:frontend`、web build、desktop renderer build 全部通过。

## 验收步骤

1. 新建 Bug，不填标题，系统复制图片后粘贴到“说明内容”。
2. 应看到中性状态“已暂存 1 个图片，填写标题后点击“创建”即可上传。”，
   正文不出现 `image.png` 文案。
3. 填写标题后状态变为“已暂存 1 个图片，点击“创建”时将自动上传。”。
4. 点击创建，等待上传完成并跳转详情。
5. 详情主帖应显示已粘贴的图片。
