---
title: Web/API 正式环境部署复核（CRG 受控接入与工作流收口）
type: review
status: completed
date: 2026-08-11
---

# Web/API 正式环境部署复核（CRG 受控接入与工作流收口）

## 结论

通过。正式 WSL 已从 `440dd47` ff-only 前进到 `1933f4d` 并完成镜像构建、迁移、
seed、健康检查和文件对象审计；公网 health/ready/web/static 均正常。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `1933f4d`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-1933f4d.bundle`，scp 到
  WSL 后 `git fetch` + `git merge --ff-only`，发布源 `origin/main` 与 HEAD 一致后
  执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `440dd47` 的内容：CRG 受控接入（`Makefile`、根 `.gitignore`、
  `AGENTS.md`、提示词、工具文档、`scripts/assert-crg-guard.mjs`）及计划/试点文档；
  无 `api/`、`web/`、`desktop/` 应用代码变更，完整发布管线仍重新执行。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:3ae9912112a7c9dd2e088becf97794da862ae3373f831d00b31e2a878f6c57be`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：migrate applied 30/total 30，`seed core` 成功。
- 文件对象审计：total=63 attached=63 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260811205545.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260811125545`

## 正式环境验证

- `/api/healthz`：200，`status ok`，version 0.1.0。
- `/api/readyz`：200，`status ready`，environment production，SQLite connected。
- `/web`：303 跳转 `/web/login?return_to=%2Fweb`。
- `/static/auth.css`：200，content-type text/css。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后确认现有业务页面与数据正常。
2. 本次无应用代码变更；CRG 接入只影响仓库工作流，不影响运行时行为。
3. 如需验证 CRG 仓库侧状态，可在开发机执行 `make crg.guard` 与 `make crg.status`。
