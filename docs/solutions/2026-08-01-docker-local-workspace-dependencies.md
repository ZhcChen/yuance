---
title: Docker 中安装本地前端 Workspace 依赖
type: solution
status: accepted
date: 2026-08-01
---

# Docker 中安装本地前端 Workspace 依赖

## 摘要

当 Web 通过 `file:../frontend/packages/*` 消费共享源码时，Docker 不能只复制 Web 清单并执行 `npm ci`。共享 package 的源码位置和自身依赖解析根也必须存在，否则本机 symlink 正常、隔离镜像构建失败。

## 背景

W4 本地检查和 Browser E2E 均通过，但 API 多阶段镜像中的 Web stage 首先缺少 `frontend/packages/*`，补复制后又因 `/src/frontend/node_modules` 不存在而无法解析 `app-core` 内部依赖和 UI 的 React peer。这说明 Web 的 `node_modules/@yuance/*` 链接只解决入口定位，不会改变共享源码向上查找依赖的规则。

## 关键结论

- `file:` 依赖在开发机上通常表现为 symlink，不能用本机已安装状态证明隔离构建可用。
- Docker 必须先复制 `frontend/package.json`、lockfile 和各 workspace manifest，在 `/src/frontend` 执行 `npm ci`。
- 随后复制共享源码，再在 `/src/web` 执行 Web 的 `npm ci`、check 和 build。
- 共享源码按 Node 规则从 `/src/frontend/packages/*` 向上解析 `/src/frontend/node_modules`；仅有 `/src/web/node_modules` 不够。
- `.dockerignore` 必须排除本机 `frontend/node_modules` 和 package dist，防止污染构建上下文。

## 可复用建议

- 把生产同款多阶段镜像构建保留为前端架构变更的必要验收，不能只依赖宿主机 build。
- 用静态测试断言 workspace manifest 复制和安装顺序，尽早发现 Dockerfile 被错误精简。
- package 清单和 lockfile 先复制、源码后复制，可保留依赖安装层缓存。

## 验证 / 证据

- `docker buildx build --platform linux/amd64 --target web-builder -f api/Dockerfile --load .`
- `sh ./scripts/build-api-image-amd64.sh`
- `sh ./scripts/smoke-web-app-image.sh`
- `api/Dockerfile`
- `frontend/test/api-dockerfile.test.mjs`

## 适用范围

- Docker、CI 或其他隔离环境中使用 npm `file:` 依赖或 workspace symlink 的前端构建。
- 不适用于已发布到 registry 且依赖完全封装在 package tarball 内的包。
