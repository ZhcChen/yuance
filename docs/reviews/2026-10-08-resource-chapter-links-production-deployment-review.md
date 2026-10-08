# 资料章节跳转正式环境部署验收

日期：2026-10-08
规格入口：`specs/002-resource-chapter-links/`
功能验证：`docs/reviews/2026-10-08-resource-chapter-links-review.md`

## 发布结果

正式环境发布成功。按 `docs/runbooks/production-deployment.md` 调用唯一入口 `scripts/deploy-production.sh`，显式指定 remote 构建、remote 部署和目标 `qfy-test2`。源码归档来自提交 `c88de3d2b65de552e08494858c04d3f971b1d58f`，构建仅在独立编译目录完成。

- 发布版本：`20261008150911`。
- 镜像：`sha256:3b81d2e903ee372a3aa9fa9fbe1755c1c75c13e62724c39a82b40d9d83a9d446`；运行容器与 latest 一致，状态 `running healthy`。
- 镜像 tar SHA256：`680a63b2b9192943bdc34926e1681010399266acafd3db31bf535bd15fb1e1a1`，构建与发布制品一致。
- 旧镜像备份：`yuance-api-linux-amd64.before-20261008151845.tar`。
- SQLite 发布前备份：`backups/20261008071848`，包含主库、WAL、SHM 三个文件。
- 迁移状态：35/35，`migration state: ok`；基础 seed 成功。

## 发布后实测

- SQLite `PRAGMA integrity_check` 返回 `ok`。
- 显式补跑 `80-files-audit.sh`：`total=151 attached=151 orphan=0 pending_orphan=0 uploaded_orphan=0 deleted_orphan=0`。remote 发布分支未自动调用该审计，本次已补齐。
- `.env` 和文件主密钥文件发布前后 SHA256 一致，未输出密钥内容。
- 公网 `/api/healthz` 返回 200 / `ok`；`/api/readyz` 返回 200 / `ready`、`sqlite-connected`、`production`。
- 公网 `/api/openapi.json` 返回 200，解析后与仓库契约一致，包含 `data-yuance-section-id` 写法。
- 公网 `/web/app` 返回 200；实际 JS `index-rizwdQx5.js`、CSS `index-C7_wwBSb.css` 均返回 200，JS 包含章节标识协议和“章节链接”编辑器入口。

## 验证边界

正式环境仅执行发布、运维审计和公开端点只读验证，未创建测试资料或读取用户凭证。保存后回读、编辑器保存以及正文/左侧目录实际点击跳转的交互证据来自此前本机真实 API 的 Playwright 验收，不能将健康检查等同于生产页面点击验收。

前后端和嵌入的 OpenAPI 已同时上线。仓库 yuance-agent Skill 文档随源码交付；已安装的 Skill 包未另行发布或更新，CLI 无需新增参数。本文为发布后证据，不包含在本次部署源码提交中，无需为此重复部署。
