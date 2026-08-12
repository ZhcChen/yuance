---
title: Web/API 正式环境部署复核（富文本工具栏二级菜单与段落字号颜色）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（富文本工具栏二级菜单与段落字号颜色）

## 结论

通过。富文本工具栏已调整为“一级常用 + 二级更多”结构，二级菜单提供段落样式、
文字大小、文字颜色及引用/代码块/Markdown/清除格式；后端正文消毒允许
`span[style]` 中的 `color` 与 `font-size`。正式环境公网健康检查、迁移、seed、
文件对象审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `9203721e02591527beb5a6747434c6d6062c0c94`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-9203721.bundle`（SHA256
  `2d244aacb6725884bb132c5bce67f21bf1a7ca31f769173cfd3e808d3c26d37d`），
  同步到正式 WSL 后 ff-only 更新发布源，随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `0dad532` 的内容：
  - 富文本工具栏改为一级常用 + 二级“更多”菜单；
  - 二级菜单增加段落（正文/标题 1/标题 2/标题 3）、文字大小、文字颜色；
  - 引用、代码块、Markdown 转换、清除格式收进二级菜单；
  - 后端正文消毒放开 `span[style]`，仅允许 `color`、`font-size` 两个 CSS
    属性，前端同步过滤；
  - 富文本多文件粘贴排队上传与正文附件 URL 修复随本包上线。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:f0167ea65a7d664d84c5ca5810cfc5269808e4eb382aaedffef0069f0527b777`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `10612e93e4350360712605bcdb4dcfff91bbbb176323f3939e15366e070b819a`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=67 attached=67 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812181242.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812101243`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页；`/static/auth.css`：200。
- SPA 静态资源：
  - `/web/app/assets/index-CQjMH_fy.js`：200；
  - `/web/app/assets/index-R_pptj43.css`：200。
- 线上 JS/CSS 已包含 `更多格式`、`文字颜色`、`yc-rich-more-menu` 等新工具栏
  标记，确认新前端已生效。

## 本地验证

- `@yuance/frontend-ui` 61 个测试通过；`@yuance/frontend-app-shell` 10 个测试
  通过；`web` 52 个测试通过；desktop `check:renderer` 通过。
- Rust 单测覆盖三类正文消毒（资料正文、工作项描述、评论）的
  `span[style]` 白名单：`color`、`font-size` 保留，其他 CSS 属性被剥除。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，打开工作项详情或新建工作项。
2. 确认工具栏一级只保留常用按钮，右侧为“更多”入口。
3. 点击“更多”，确认段落、文字大小、文字颜色可操作，提交后样式保留。
4. 确认引用、代码块、Markdown 转换、清除格式仍可用。
