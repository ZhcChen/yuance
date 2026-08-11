---
title: Web/API 正式环境部署复核（新建工作项富文本直接粘贴图片）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（新建工作项富文本直接粘贴图片）

## 结论

通过。新建需求 / 任务 / Bug 弹窗中的富文本已接入 `onPasteFile`，首次粘贴图片会
先创建工作项与主帖，再上传附件并回填主帖正文；修复已发布到 WSL 正式环境。

## 用户现象与根因

- 现象：通过“新建 Bug”测试系统复制图片并粘贴，说明富文本仍只出现
  `image.png` 文案。
- 根因：此前 MIME 与预览修复只覆盖评论、主帖编辑和资料正文；新建工作项弹窗的
  `RichTextEditor` 未接入 `onPasteFile`，粘贴文件默认回退为文件名文本。
- 用户测试时线上仍是上一版前端资产 `assets/index-CyjIBScf.js`，本次部署完成后
  已切换为 `assets/index-DK_sUWgw.js`。

## 修复内容

- `frontend/packages/app-shell/src/app.jsx`：
  - 新建工作项说明富文本增加 `onPasteFile={pasteWorkItemCreateFile}`。
  - 首次粘贴先创建 work item 和主帖，再上传附件并回填主帖；粘贴后取消按钮
    改为“转到详情”，避免已创建内容丢失。
  - 提交时若已有 checkpoint 走 `updateWorkItem` 更新字段，并保留主帖图片引用。
- `api/src/domains/projects.rs`、`api/src/web/api/mod.rs`：
  - PATCH `/api/v1/work-items/{key}` 支持 `cycle_id` 及 `null` 清空周期，
    保证粘贴后再次提交不丢周期。
- `frontend/packages/api-client/src/work-items.js`、`docs/openapi/yuance.openapi.json`：
  - 同步工作项更新周期契约。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，HEAD = `17d4ede`。
- 发布方式：正式 WSL 发布源 ff-only 同步至 `17d4ede` 后执行
  `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 manifest ID
  `sha256:47c71d2dc7920bbfa0cba4c3a0cfa8d330ab5733fcebfc256bc0fe6eade66b2d`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811122834.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811042835`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 正式前端入口 HTML：`cache-control: no-store`，资源使用内容哈希文件名。
- 新前端资产 `assets/index-DK_sUWgw.js` 已包含
  `请先填写工作项标题，再粘贴图片` 新建粘贴提示。
- 修复前置检查：`npm run check`、web build、`cargo fmt`、
  `project_management_flow` 86/86 通过。

## 边界与后续

- 浏览器若仍命中旧 JS，普通刷新即可拉取新的 no-store HTML 与内容哈希资产；
  不必清缓存即可切换，因为入口 HTML 不缓存。
- 需要用户在正式环境重新执行“新建 Bug -> 填写标题 -> 系统复制图片 ->
  粘贴到说明富文本 -> 创建”验收，并确认详情主帖仍显示图片。
- 若复测仍失败，优先检查浏览器 Network 中的附件登记 / 主帖 PATCH 请求，
  以及正式前端 JS 资产是否仍为 `index-DK_sUWgw.js`。
