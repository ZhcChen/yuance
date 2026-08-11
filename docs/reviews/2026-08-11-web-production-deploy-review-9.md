---
title: Web/API 正式环境部署复核（修复新建工作项自动上传空主帖被拒）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（修复新建工作项自动上传空主帖被拒）

## 结论

通过。新建工作项“粘贴图片 -> 填写标题 -> 自动上传”已真正可用：填写标题后会自动
创建工作项与主帖、上传图片并回填正文，不再因空主帖正文被 API 拒绝而停在
“已暂存”状态。

## 问题与根因

- 现象：上一版 `8b57bd2` 上线后，用户填写标题仍看不到自动上传，提示停留在
  “已暂存 1 个图片，填写标题后将自动上传。”。
- 根因：`ensureWorkItemCreatePrimaryPost` 在说明正文为空时用 `<p><br></p>`
  创建主帖，而 API 的 `prepare_work_item_comment_body` 要求 HTML 正文必须有
  非空文本或媒体引用；空正文返回 `评论内容不能为空`。自动上传在建主帖这一步
  就失败，因此附件上传从未开始。
- 上一份部署复核（review-8）只验证了提示文案与资产存在，未覆盖该失败路径，
  本份为实际修复记录。

## 修复

- `frontend/packages/app-shell/src/app.jsx`：
  - 说明正文为空时，先以 `<p>图片上传中…</p>` 创建主帖占位正文；
  - 附件上传成功后将主帖更新为图片 HTML，占位正文随即被替换。
- `web/e2e/work-item-create-paste-auto-upload.spec.mjs`：
  - 新增回归测试：未填标题粘贴图片 -> 提示已暂存 -> 填写标题 ->
    自动创建附件并完成上传 -> 正文出现图片，且不点击“创建”。

## 部署内容

- 发布源：WSL `/srv/yuance/release-source`，HEAD = `09da6b6`。
- 发布方式：正式 WSL 发布源通过离线 bundle ff-only 同步至 `09da6b6` 后执行
  `./scripts/deploy-production.sh`。
- 未推送 GitHub `origin/main`，继续沿用主线回填阶段统一决策。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:1828fbee6dedfc4a66e01b58ade87ec43aa2cb63c60a491dfb7940ca89706292`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate 全部 applied，`seed core` 成功。
- 文件对象审计：total=61 attached=61 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811151301.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811071301`

## 正式环境验证

- `/api/healthz`：200，status ok。
- `/api/readyz`：200，environment production。
- 新前端资产 `assets/index-C7XSerK8.js` 包含：
  - “图片上传中”
  - “已暂存 ${count} 个图片，填写标题后将自动上传。”
  - “已暂存 ${count} 个图片，正在自动上传…”
- 回归测试 `work item create pastes before title and auto-uploads after title`
  通过；`npm run check:frontend`、web build、desktop renderer build 全部通过。

## 验收步骤

1. 新建 Bug，不填标题，系统复制图片后粘贴到“说明内容”。
2. 应看到“已暂存 1 个图片，填写标题后将自动上传。”，正文不出现 `image.png` 文案。
3. 填写标题，应自动开始上传，提示变为“已暂存 1 个图片，正在自动上传…”。
4. 上传完成后正文显示图片，不再出现“评论内容不能为空”或停留在“已暂存”状态。
5. 点击“创建”完成工作项提交并跳转详情，详情主帖显示图片。
