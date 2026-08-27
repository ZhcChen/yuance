---
title: Web 正式环境部署复核（评论富文本上传图片不再裂图）
type: review
status: completed
date: 2026-08-27
---

# Web 正式环境部署复核（评论富文本上传图片不再裂图）

## 结论

通过。新评论富文本上传图片后，图片挂在草稿评论下仍可被作者预览，不再因
web 下载接口拒绝草稿评论而裂图；发布后其他成员可正常查看。正式环境公网
健康检查、迁移、seed、文件对象审计均正常，容器 running/healthy 且运行最新
镜像。

## 根因与修复

- 根因：
  - 新评论上传图片时，正文 `<img src>` 指向
    `/web/work-items/{item_key}/comments/{draft_id}/attachments/{id}/download`。
  - web 评论附件下载/预览接口之前只加载正式评论，草稿评论会被判定为不存在，
    返回 404，导致上传后立即裂图。
  - 评论附件缩略图还错误拼了不存在的
    `/api/v1/.../attachments/{id}/download` 地址。
- 修复：
  - `api/src/web/user/mod.rs`：web 评论附件下载/预览支持草稿评论，但草稿
    仅允许作者本人访问；发布后恢复项目成员共享访问。
  - `frontend/packages/app-shell/src/app.jsx`：评论附件缩略图改用
    `/web/work-items/.../comments/.../attachments/{id}/download`。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `623e3abcd7db5e9396f24010ff799c4647a72032`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-623e3ab.bundle`（SHA256
  `05003177ffb44aa0fe2ed5232ffa0dc10df0f5fd9607c404628780aa58e9d77f`），
  同步到正式 WSL 后 ff-only 更新发布源，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `a20cbab` 的内容：评论富文本草稿附件 web 下载/预览开放给
  作者本人；评论附件缩略图路径修正。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:ed4b0f18138ebe474e363471dce120b2136d633e039c9c0bb33994b3a2610615`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 32/total 32；`migrate up`、`seed core`
  幂等执行成功。
- 文件对象审计：total=106 attached=106 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260827123943.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260827043944`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。

## 本地验证

- `cargo test -p yuance-api --test project_management_flow comment`：9 个相关
  测试通过，含新增的“草稿附件作者可下载、其他成员 403、发布后其他成员可
  下载”回归测试。
- `npm --prefix frontend run check`：全部通过。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开任意工作项详情。
2. 在“新增评论”富文本点击“添加附件”选择图片，确认上传后富文本图片立即
   正常显示，附件列表缩略图也正常。
3. 点击“发表”，确认发布后评论正文中的图片仍正常显示。
4. 用另一位项目成员登录查看同一评论，确认图片可正常访问。
