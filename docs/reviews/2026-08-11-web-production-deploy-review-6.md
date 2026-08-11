---
title: Web/API 正式环境部署复核（新建工作项先粘贴图片后填写标题）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（新建工作项先粘贴图片后填写标题）

## 结论

通过。新建需求 / 任务 / Bug 弹窗支持先粘贴图片、后填写标题：粘贴时文件先暂存，
点击创建后自动上传到主帖并保留图片；不再回退插入 `image.png` 文案，也不再出现
误导性的“创建失败 请先填写工作项标题”报错。

## 问题与修复

- 现象：上一轮部署后，新建工作项粘贴图片必须先填标题；未填标题时提示被渲染为
  `创建失败 请先填写工作项标题，再粘贴图片。`，且 `RichTextEditor` 仍会回退插入
  `image.png` 文件名。
- 根因：新建弹窗的粘贴上传以“先创建 work item / 主帖”为前提，标题为空时只能
  拒绝；共享富文本组件对 `onPasteFile` 返回 `null` 会回退插入文件名。
- 修复：
  - `RichTextEditor` 新增 `DEFER_RICH_TEXT_PASTE` 返回标记，调用方声明“已处理、
    不要回退文件名”时不再插入 `image.png`。
  - 新建工作项未填标题时，粘贴文件先经 `selectPastedFile` 暂存到
    `workItemCreatePendingPastes`，显示“已暂存 X，填写标题后点击创建即可上传”，
    并把焦点移到标题输入框。
  - 点击创建时先创建 work item / 主帖，再逐个上传暂存文件、回填主帖 HTML；
    成功后统一提交字段并跳转详情。上传中途失败会保留已成功部分的状态供重试。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，HEAD = `fe95a37`。
- 发布方式：正式 WSL 发布源 ff-only 同步至 `fe95a37` 后执行
  `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 manifest ID
  `sha256:ce45c0a1788c6395cbb3fdd2aef3a2b786967b59d866fd4300f23e3edef8fdbe`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811131747.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811051747`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 新前端资产 `assets/index-CTL71PIh.js` 已包含 `已暂存` 与
  `填写标题后点击创建即可上传` 新建粘贴提示。
- `npm run check:frontend`、web build、desktop renderer build 全部通过。

## 验收步骤

1. 新建 Bug，不填标题，系统复制图片后粘贴到“说明内容”。
2. 应出现“已暂存 1 个粘贴文件，填写标题后点击创建即可上传”的提示，且正文不出现
   `image.png` 文案。
3. 填写标题后点击创建，等待上传完成并跳转详情。
4. 详情主帖应显示已粘贴的图片。
