# 附件预览改为前端解密执行计划

日期：2026-08-31

## 目标

资料库/工作项加密附件预览时，OSS 密文不再由服务端解成明文后返回给浏览器；
改为服务端返回“签名密文 URL + 加密元数据”，由浏览器 WebCrypto 解密后交给
file-viewer 渲染，保持“上传、存储、预览、下载”全程只在端侧出现明文。

## 范围

- 后端：`/web/.../preview/content` 与 `/api/v1/.../preview/content` 增加
  `client_decrypt=1` 参数；加密附件带参数时返回 JSON，未带参数保持服务端解密
  （兼容 desktop 与旧页面）。
- Web 弹窗：附件预览统一通过浏览器解密器解析 content URL；文档交给
  file-viewer，文本不再走 iframe，图片/视频使用解密后的 Blob URL。
- 独立 `/preview` 页：document-preview 使用同一协议并前端解密。
- 静态资源：新增 `/static/document-preview-crypto.mjs` 供独立预览页使用。

## 步骤

1. 后端定义 `client_decrypt` 查询参数与加密预览 JSON 响应。
2. web/API 两类 preview content handler 按参数分流。
3. web document-viewer 增加 `resolvePreviewContent`（fetch + 校验 + WebCrypto 解密）。
4. AttachmentPreview 接入解析器，图片/视频/文本/文档统一前端解密。
5. 独立预览页接入静态解密模块。
6. 测试：Rust 加密预览 JSON、前端解密单元测试、E2E 保持通过。
7. 提交、推送、部署正式环境并复核。

## 验收

- 加密 docx/pdf/xlsx 弹窗与独立页均可预览且可滚动。
- 未加密附件行为不变。
- 无 `client_decrypt` 参数时服务端解密行为不变。

## 当前状态

- 后端 web/API preview content handler 已完成 `client_decrypt=1` 分流。
- web 弹窗 document-viewer 与独立预览页已接入端侧解密；图片/视频/文本经
  Blob URL 渲染，文档交给 file-viewer。
- 新增 `/static/document-preview-crypto.mjs` 供独立预览页复用。
- Rust 与前端检查、相关回归测试已通过；待部署正式环境后做线上复核。
