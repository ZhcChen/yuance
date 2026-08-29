---
title: Web/API 正式环境热修复复核（加密附件下载乱码）
type: review
status: completed
date: 2026-08-29
---

# Web/API 正式环境热修复复核（加密附件下载乱码）

## 结论

通过。资料库加密附件下载乱码的根因是通用下载用例在构建传输授权时没有透传
`encryption` 元数据，浏览器把 OSS 密文当作普通文件直接打开。已修复并部署
正式环境，服务端、密钥、数据均未变更。

## 问题表现

- 资料 `P260713139801` 中的 Excel 附件（file_object_id=131，
  `门店信息导入模板 (1).xlsx`，`encryption_status=encrypted`）下载后打开乱码。
- 实际下载到的是 OSS 密文，而不是前端解密后的明文 xlsx。

## 根因

- 服务端 `download-url` 已正确返回 `encryption`（算法、DEK、明文/密文大小、
  校验值等）。
- `frontend/packages/app-core/src/work-item-collaboration.js` 的通用
  `downloadAttachment` 调用 `authorizeSignedRequest` 时只传了
  `request / purpose / expiresInSeconds`，漏传 `encryption`。
- 浏览器传输层因此认为附件未加密，走 `openDownload(url)` 直接打开密文 URL，
  导致乱码。

## 修复内容

- `downloadAttachment` 在 `authorizeSignedRequest` 中补传
  `encryption: signed.encryption`。
- 新增回归测试：`encrypted project resource download forwards encryption
  metadata`，验证签名授权时加密元数据被透传。

## 验证

- `npm --prefix frontend/packages/app-core run check`：76 项测试通过。
- `npm --prefix frontend run check`：全量通过。
- 正式镜像内已确认存在 `encryption:<变量>.encryption` 透传代码。

## 发布结果

- 发布版本：`20260829123323`。
- 镜像 ID：`sha256:876b286526cb50aa840e23d15c8fb139ef64de1b695a61e87504984f667b250a`。
- 镜像 tar SHA256：`3baa12a71e52fa06e229cd85992e4085eceaa21b867d2922a8a984b9a4745254`。
- 发布源：`/srv/yuance/release-source`，HEAD = `3126a0a952ebb34f4fe7c8b3a6056ae73ce04f64`。
- bundle SHA256：`d897b8e4fac374041e2e07b4a2c9933dd524e541216688e3d4102e5337019209`。
- 迁移：33/33，无新增迁移。
- 文件审计：total=117 attached=117 orphan=0。
- 主密钥：未变更（`1b44994bd816...`）。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260829123732.tar`
  - `/srv/yuance/backend/backups/20260829043732`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200 ok。
- `https://yuance.quanxinfu.com/api/readyz`：200 ready。
- `/version.json`：`{"version":"20260829123323"}`。
- 容器 `yuance-api`：running / healthy，运行镜像与最新镜像一致。

## 验收步骤

1. 刷新正式环境页面（清除旧 JS 缓存后重新进入资料详情页）。
2. 打开资料 `P260713139801`，重新下载 Excel 附件。
3. 下载时应先显示“正在下载中 + loading”，随后自动保存解密后的 xlsx，
   用 Excel/WPS 打开不应再出现乱码。
