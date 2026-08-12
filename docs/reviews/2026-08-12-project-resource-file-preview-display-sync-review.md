# 项目资料详情：文件附件显示与预览对齐旧版复核

日期：2026-08-12

## 结论

资料详情页正文内文件附件已按旧版 `.discussion-rich-body` 行为对齐：文件以类型卡片展示，点击弹出“复制链接 / 预览 / 下载”菜单，文档预览走旧版站内文档预览窗口，图片与视频继续使用已对齐的站内媒体预览。

## 实现

- 富文本文件节点生成与展示时补齐 `data-yuance-file-kind`、`data-yuance-file-ext`，旧数据缺失时在 `RichTextContent` 渲染时按文件名补全。
- 资料详情正文容器恢复 `discussion-rich-body` 方言，并在 `application.css` 补齐正文排版、文件卡片及 word/sheet/slide/pdf/text/code/archive 分类配色（含暗色主题）。
- `RichTextContent` 新增文件附件激活回调，资料详情内文件点击打开 `RichAttachmentMenu`，菜单支持复制链接、文档预览、下载。
- 剪贴板、新窗口预览、锚点下载等浏览器交互收敛到 UI 包 `rich-attachment-actions.js`，app-shell 只通过注入模块与平台下载用例操作，维持共享包边界。
- 受保护资料的访问 token 会在下载链接、复制链接和预览地址中追加 `access` 参数。

## 验证

```bash
npm --prefix frontend run check
npm --prefix web run check
npm --prefix desktop run check:renderer
```

- UI 包新增文件类型推导与附件菜单测试，56 项通过。
- app-shell、web、desktop renderer 检查均通过。
- 正式环境部署验收待用户发起。
