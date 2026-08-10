# U5 评论草稿附件生命周期复核

## 结论

新评论 composer 已在 Browser 与 Desktop 共用同一草稿、上传、正文引用、发布和取消状态机。评论附件创建由 `baseline` 推进为 `shared`，Desktop 只新增固定领域 operation，不暴露 URL、method、headers 或任意请求能力。

## 关键证据

- `SharedApp` 只在用户选中合法非空文件后创建评论草稿，后续附件绑定同一草稿；上传完成后把受控 preview content URL 写入共享富文本正文。
- 发布已有附件的评论使用 draft publish API；无附件评论继续使用直接创建 API。发布提交与伴随刷新分别处理，刷新失败不会误报发布失败。
- 显式取消和跨路由离开都会调用 draft cancel API；自动清理失败保留草稿句柄，并在下一次附件操作前重试。
- 服务端取消端点仅允许草稿作者执行，继续检查 CSRF / device principal、`comment:write` scope、项目访问与写权限；取消时删除对象内容、归档附件并软删除草稿。
- Desktop registry 仅增加 `workitem.commentdraftcreate`、`workitem.commentdraftpublish`、`workitem.commentdraftcancel`，输入使用严格字段集合和长度/类型校验。

## 验证

- Browser E2E：新评论选择附件后创建草稿、上传、插入正文、发布，以及第二个草稿取消清理。
- Desktop：operation registry、renderer transport 和真实 Electron + Device API create/publish/cancel 流程。
- API：草稿取消后评论不可读取，附件状态为 `deleted`，测试对象内容不存在；OpenAPI Device allowlist 包含固定 DELETE 路径。
- 共享 UI：草稿附件列表、上传状态和取消入口由唯一 `WorkItemComments` 渲染。

## 风险复核

- 对象存储删除与 SQLite 更新无法组成跨系统事务；端点采用先删除对象、再归档记录和草稿的 fail-closed 顺序。中途失败会返回错误并保留尚未完成的草稿，允许重试，不会把残留草稿误报为已取消。
- 路由离开清理不阻塞用户导航；失败时保留内存重试句柄。进程被强制终止后的陈旧草稿仍需后续服务端定期清理机制兜底，该项不改变本切片的显式取消与正常路由生命周期语义。
- 未引入 macOS Keychain 或 Electron `safeStorage`，未扩大 Desktop IPC 与网络能力边界。
