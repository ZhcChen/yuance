# 附件预览前端解密正式部署复核

## 标题信息

- 主题：附件预览改为浏览器端解密后部署正式环境
- 关联计划：`docs/plans/2026-08-31-preview-client-decrypt.md`
- 审查范围：后端 preview content 分流、Web 弹窗与独立预览页解密、静态解密模块
- 负责人：Codex
- 日期：2026-08-31

## 结论

通过。正式环境已发布前端解密预览能力，健康检查、版本、静态资源、容器镜像、
迁移与文件审计均通过。

## 发布结果

- 发布版本：`20260831143048`
- 发布源：`/srv/yuance/release-source`，HEAD = `1581fb9a3a1e9da8e721ba80fa63eb88f26cd49c`
- bundle：`/tmp/yuance-production-1581fb9.bundle`
  - SHA256：`5e64ac4a716b43e0507df2a7ac6a6ddab3741ee720c4e6acca4c4bb50c2aadad`
- 镜像 tar SHA256：`86d4a253dce8f8a025166daa79b2fc86c30b198e4b9ad796329dbe3b4e2d8f4d`
- 镜像 ID：`sha256:64ea4b25db8eab9637c693827b0b04a6bf961efcff648e90f929a39a7f1cc930`
- 迁移：33/33，无新增迁移，core seed 已应用。
- 文件审计：total=118 attached=118 orphan=0。
- 主密钥：未变更，未覆盖 `.env` 与 `/data/secrets/file_master_key`。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260831143301.tar`
  - `/srv/yuance/backend/backups/20260831063301`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready，production / sqlite-connected。
- `/version.json`：`{"version":"20260831143048"}`。
- `GET /static/document-preview-crypto.mjs`：HTTP 200，
  `application/javascript; charset=utf-8`。
- `/web`：HTTP 303 跳转登录，页面入口正常。
- 容器 `yuance-api`：running / healthy，运行镜像与 `yuance-api:latest` 一致。
- 前端 bundle `index-CDytxKWy.js` 已包含 `client_decrypt` 协议逻辑。

## 验收步骤

1. 刷新正式环境页面并清除旧 JS 缓存。
2. 打开资料库或工作项中加密附件的弹窗预览，确认 pdf/docx/xlsx 等文档可正常
   渲染，图片/视频/文本可正常显示。
3. 打开加密附件的独立 `/preview` 页，确认文档同样由浏览器端解密后渲染。
4. 未加密附件预览行为应与发布前一致。
