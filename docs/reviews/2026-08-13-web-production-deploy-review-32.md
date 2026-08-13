---
title: Web/API 正式环境部署复核（业务表单下拉统一与编辑弹窗对齐）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（业务表单下拉统一与编辑弹窗对齐）

## 结论

通过。业务弹窗原生下拉已统一为共享 `Select`，编辑工作项 / 指派流转弹窗与新增
弹窗宽度对齐；正式环境公网健康检查、迁移、seed、文件对象审计均正常，容器
running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `c3b29fb22403f981f91f3f3b0ad03bb689c04cb0`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-c3b29fb.bundle`（SHA256
  `347bb43a711fef5d013365c47e5de59796ca24d8af4c6fe1d67dc4633240c537`），
  scp 到 WSL 后同步到 `c3b29fb`，随后执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `152eece` 的内容：
  - 发表区“指派后状态”下拉改用共享 `Select`；
  - 编辑工作项 / 指派流转弹窗内的状态、优先级、处理人、父级需求等全部改共享
    `Select`，标题 / 日期 / 说明换共享 `TextInput` / `TextArea`；
  - 编辑工作项弹窗移除内层 `.work-item-detail-panel` 边框与标题，与新增弹窗同为
    wide 1040px；
  - 新建工作项、项目资料、项目、系统角色 / 用户 / 发布 / Token 等业务弹窗原生
    `<select>` 全部改共享 `Select`（顶部项目切换 / 分页保留独立控件）；
  - 下拉加 `label htmlFor` 可达性，字段标签样式统一；
  - E2E 改为 `*-native` / `select[name]` 定位。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:3fba2baf1725a0563fab2a6681326b54a3dea1469a00771a310c1e9822b2d754`，
  构建时间 2026-08-13T11:12:16+08:00。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `3cd92961d352523d0a564a04cfa39f2cf666a878e5cac6ff1fd980c910cf04a9`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=82 attached=82 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813111259.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813031300`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页。
- SPA 静态资源：
  - `/web/app/assets/index-DYxNPO2A.js`
  - `/web/app/assets/index-offEh5nC.css`
- 线上 JS 已确认包含共享 `yc-select` 组件标记。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com`，进入需求 / 任务 / Bug 列表并新建工作项，
   确认弹窗内优先级、处理人、周期、父级需求均为统一共享下拉。
2. 打开帖子详情编辑弹窗与指派流转弹窗，确认下拉、输入框样式与新增弹窗一致，
   编辑弹窗宽度为 wide 1040px。
3. 项目资料、项目、系统角色 / 用户 / 发布 / Token 弹窗确认下拉统一、字段标签
   对齐。
4. Desktop 通过共享前端自动同步，无需单独发布。
