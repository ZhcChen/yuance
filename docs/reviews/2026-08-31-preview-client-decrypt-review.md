# 附件预览前端解密复核

## 标题信息

- 主题：附件预览从服务端解密改为浏览器端解密后交给 file-viewer
- 关联计划：`docs/plans/2026-08-31-preview-client-decrypt.md`
- 审查范围：`api/src/web/api/mod.rs`、`api/src/web/user/mod.rs`、
  `api/src/web/router.rs`、`api/static/document-preview*.mjs`、
  `frontend/packages/app-shell`、`frontend/packages/ui`、`web/src`
- 负责人：Codex
- 日期：2026-08-31

## 目标对齐

加密附件预览时服务端不再返回明文，改为返回密文签名 URL 与加密元数据，
由浏览器 WebCrypto 解密后交给 file-viewer；未加密附件与未携带
`client_decrypt` 参数的请求保持原行为。

## 已执行验证

- `cargo check -p yuance-api`
- `cargo test -p yuance-api --test device_business_parity_flow`
- `cargo test -p yuance-api --test device_session_contract_flow`
- `cargo test -p yuance-api --test project_management_flow` 中两个预览内容用例
- `cargo fmt --all -- --check`
- `npm --prefix frontend run check`
- `npm --prefix web run check`
- `npm --prefix web run build`
- `node --check` 校验两个静态 mjs
- 关键证据：加密资源附件请求 `preview/content?access=...&client_decrypt=1`
  返回 `application/json`，含 `url` 与 `encryption.file_object_id`；不带参数
  的 Range 预览仍返回明文片段；现有 OpenAPI/会话契约测试通过。

## 主要发现

### 必须修正的问题

- 无。

### 可接受的残留项

- 独立预览页静态解密模块与 Web 侧解密逻辑存在少量重复，后续可考虑抽成共享
  静态模块；当前两处实现一致且各自可独立验证。
- 密文 URL 的响应体读取超时在独立预览页模块中只覆盖到响应头，Web 侧已覆盖
  完整读取；影响很小，可在后续统一。

### 建议后续跟进

- 部署正式环境后，用加密的 pdf/docx/xlsx、图片、视频与文本附件做线上复核。
- 线上确认 OSS 桶的 CORS 已允许跨域 GET 密文（下载链路已验证，预览链路
  应复用同一配置）。

## 与计划的一致性

- 符合计划：后端 `client_decrypt=1` 分流、Web 弹窗与独立预览页前端解密、
  静态解密模块、测试与构建验证均已完成。
- 未偏离：未执行正式环境部署，需用户确认后按
  `docs/runbooks/production-deployment.md` 发布。

## 回归与风险

- 未发现明显回归；未加密附件与旧调用方式仍走服务端路径。
- 仍需关注：`client_decrypt` 请求返回的 DEK 是文件级数据密钥，仅对有预览
  权限的会话可见，行为与下载 URL 接口一致。

## 结论

- 结论：有条件通过
- 下一步：提交推送后部署正式环境，并补线上复核证据
