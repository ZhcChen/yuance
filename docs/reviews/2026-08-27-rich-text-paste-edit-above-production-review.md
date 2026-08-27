---
title: Web 正式环境部署复核（富文本粘贴图片后可继续编辑图片上方内容）
type: review
status: completed
date: 2026-08-27
---

# Web 正式环境部署复核（富文本粘贴图片后可继续编辑图片上方内容）

## 结论

通过。新建工作项弹窗粘贴图片、未填标题等待自动上传时，焦点不再被反复抢回
标题输入框，用户可继续在图片上方编辑；延迟重试会读取最新粘贴回调。正式环境
公网健康检查、迁移、seed、文件对象审计均正常，容器 running/healthy 且运行
最新镜像。

## 根因与修复

- 根因：`pasteWorkItemCreateFile()` 未填标题时返回
  `DEFER_RICH_TEXT_PASTE`，且每次 200ms 重试都会重新聚焦标题输入框；编辑器
  重试闭包又持有旧的 `onPasteFile` 回调，导致用户无法回到富文本图片上方编辑。
- 修复：
  - `frontend/packages/ui/src/rich-text.jsx`：`uploadPastedFile()` 改读
    `onPasteFileRef.current`，延迟重试使用最新回调。
  - `frontend/packages/app-shell/src/app.jsx`：新建工作项等待标题时仅首次聚焦
    标题输入框，后续重试不再抢焦点。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `a20cbab544ce09adc8eaabe0c29f3204ef8fd49f`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-a20cbab.bundle`（SHA256
  `7ce1d1116e5ac74bbf1b6d4987bac10c1cf4c0bd464787fb4d363494bc5f495b`），
  同步到正式 WSL 后 ff-only 更新发布源，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `184bf16` 的内容：富文本粘贴图片等待上传时不再抢占焦点，
  并修复延迟重试的旧回调闭包。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:5e265f7aea45b5f6834d7995fb67d0615247e1973a99a6b4cbf399a9296c860e`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` 全部迁移已应用；`migrate up`、`seed core` 幂等执行
  成功。
- 文件对象审计：total=106 attached=106 orphan=0。

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。

## 本地验证

- `frontend`：`npm --prefix frontend run check` 全部通过。
- 聚焦 E2E `work-item-create-paste-auto-upload.spec.mjs` 通过，覆盖“未填标题
  粘贴图片 -> 图片等待上传时可在图片上方继续输入 -> 填写标题后自动上传 ->
  正文保留附件”闭环。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，新建需求/任务/Bug。
2. 不填标题，在说明富文本粘贴图片，确认出现“正在等待填写标题后自动上传…”。
3. 把光标移动到图片上方输入文字，确认输入正常且焦点不被抢走。
4. 填写标题，确认图片自动上传并保留在正文中。
