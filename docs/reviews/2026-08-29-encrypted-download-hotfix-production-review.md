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

## 补充修复（2026-08-29）：服务端解密 500 与 AAD 分隔符兼容

上一版部署后，资料 `P260713139801` 的站内下载与预览改为服务端解密返回明文，
但实际返回 500：

- `GET /web/projects/P260713139801/resources/7/attachments/131/download`：500
- `GET /web/projects/P260713139801/resources/7/attachments/131/preview/content`：500
- API 错误：`{"error":{"code":"crypto","message":"敏感配置处理失败：文件分块解密失败或数据被篡改"}}`

### 补充根因

- Web `web/src/platform/browser/file-crypto.js` 的 `chunkAad` 分配了分隔符字节，
  但没有写入 `:`，实际加密 AAD 中该字节为 `0x00`。
- 服务端 Rust `api/src/platform/file_crypto.rs` 按 `yuance-file-enc:v1:<8 字节
  file_object_id>:<4 字节 chunk_index>` 解析，期望 `0x3a` 分隔符，因此无法解密
  早期 Web 上传的存量密文。
- Desktop `desktop/src/files/file-crypto.mjs` 从开始就写入 `0x3a`，不受影响。

### 补充修复内容

- 服务端 `decrypt_chunk` 先按冒号分隔符尝试解密，失败后回退到早期 Web 的零分隔符
  格式，兼容存量加密附件；新文件仍统一使用冒号规范。
- Web `chunkAad` 补写 `0x3a`，保证新上传附件与服务端规范一致；解密端同时兼容
  零分隔符存量文件。
- Desktop 解密端增加零分隔符回退，兼容早期 Web 上传、通过桌面端签名下载的文件。
- 新增回归测试：Rust `legacy_zero_separator_files_decrypt_with_fallback`、
  Web `browser decrypts legacy files encrypted with a zero AAD separator`、
  Desktop `decrypts legacy browser files encrypted with a zero AAD separator`。

### 补充验证

- `cargo test -p yuance-api --lib file_crypto`：7 项通过。
- `npm --prefix web run check`：58 项通过。
- `npm --prefix desktop run check` 对应 `file-crypto.test.mjs`：6 项通过。
- 正式下载接口：200，6244 字节，文件头 `PK\x03\x04`，SHA256
  `b9d78cc4ab7380b307b9de5ffc2634f2911d4d6b0667610c3ffd66bf9c2fa37d`。
- 正式预览接口：200，6244 字节，Content-Type
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`。

### 补充发布结果

- 发布版本：`20260829130108`。
- 发布源：`/srv/yuance/release-source`，HEAD = `74a03a20c0`。
- bundle：`/tmp/yuance-production-74a03a2.bundle`，SHA256
  `69931bbba75a8a45ce8b80279367aca28c9d3f0275ad87cbeecac1f3a67507bd`。
- 镜像 tar SHA256：`447ec251447a642b71b280d38192556ca5d1966eccdea32c9a78ec34317840c3`。
- 迁移：33/33，无新增迁移。
- 文件审计：total=117 attached=117 orphan=0。
- 主密钥：未变更。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260829132757.tar`
  - `/srv/yuance/backend/backups/20260829052757`
- 验证用临时 session 已回收（`revoked`），未保留正式环境登录凭证。
