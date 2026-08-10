# main Web 桌面端下载边界 V10 复核

## 结论

`/web/downloads` 的 masthead、发布摘要、三平台卡、双架构下载行、空态和响应式断点与 `main@6c0e56d` 等价。基线内联 CSS 已原样迁移到 `/static/desktop-downloads.css`，页面继续满足 CSP 和边界样式版本化要求。

当前新增的 internal development release 信任说明属于发布安全合同：明确 macOS ad-hoc、Windows 不签名、Linux/全部制品 minisign 与下载地址撤回窗口，不改变基线页面几何。

`page.boundary.downloads` visual contract 已更新为 `matched`，V10 无 `pending` 页面。

## 验证证据

- 真实发布数据 flow 确认仅展示已发布且上传完成的资产，不泄露对象存储字段。
- SSR 边界样式测试确认 downloads 使用版本化静态 CSS 且无内联样式。
- `cargo test --manifest-path api/Cargo.toml --test system_management_flow desktop_downloads_page_exposes_only_published_uploaded_assets`
- `cargo test --manifest-path api/Cargo.toml --test routing_smoke server_rendered_boundaries_use_versioned_styles_without_inline_css`
