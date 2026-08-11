---
title: Web/API 正式环境部署复核（新建工作项填写标题后自动上传粘贴图片）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（新建工作项填写标题后自动上传粘贴图片）

## 结论

通过。新建工作项粘贴图片后的上传时机已改为“填写标题后自动上传”，不再要求用户
点击“创建”后才上传；用户确认标题后即可在正文看到上传完成的图片，再点击“创建”
完成工作项提交。

## 问题与修复

- 现象：上一版提示为“已暂存 X 个图片，填写标题后点击‘创建’即可上传”，用户认为
  与原来“粘贴即上传”的逻辑不一致。
- 约束：工作项附件必须挂在已创建工作项及其主帖下，后端校验要求标题非空，因此
  标题为空时无法在粘贴瞬间直接上传附件。
- 修复：
  - 标题为空时继续暂存粘贴文件，提示改为“已暂存 X 个图片，填写标题后将自动上传。”。
  - 填写标题后通过 `flushWorkItemCreatePendingPastes` 自动创建工作项/主帖并逐个
    上传暂存图片，上传后回填主帖 HTML，不再等待“创建”按钮。
  - 标题输入时提示更新为“已暂存 X 个图片，正在自动上传…”，上传完成或失败后
    提示让位于上传状态/错误反馈。
  - 失败重试保持原有语义：已上传成功部分不重复上传，未完成部分可在再次填写标题
    或点击“创建”时重试。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，HEAD = `8b57bd2`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `8b57bd2` 后执行
  `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:335a2ea7f4fce92c8e0251c4db57df2be78ed2cb1b236e34b0d4d9b217094153`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811144758.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811064758`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 新前端资产 `assets/index-DM9oiGlk.js` 包含：
  - “已暂存 ${count} 个图片，填写标题后将自动上传。”
  - “已暂存 ${count} 个图片，正在自动上传…”
- `npm run check:frontend`、web build、desktop renderer build 全部通过。

## 验收步骤

1. 新建 Bug，不填标题，系统复制图片后粘贴到“说明内容”。
2. 应看到“已暂存 1 个图片，填写标题后将自动上传。”，正文不出现 `image.png` 文案。
3. 填写标题，应自动开始上传，提示变为“已暂存 1 个图片，正在自动上传…”。
4. 上传完成后正文显示图片，点击“创建”完成工作项提交并跳转详情。
5. 详情主帖应显示已粘贴的图片。
