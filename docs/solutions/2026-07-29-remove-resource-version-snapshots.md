---
title: 移除资料版本快照并保持同名附件隔离
date: 2026-07-29
status: accepted
---

# 移除资料版本快照并保持同名附件隔离

## 背景

项目资料库以富文本作为主要组织方式。资料维护者可在正文中使用文字标识不同文件版本，并继续上传新的附件，不需要系统为每次资料编辑维护独立的正文快照。

原有资料版本快照不包含独立附件快照；附件删除后，历史正文中的附件引用也不能保证继续可用。因此继续维护该功能会增加复杂度，却不能提供完整的文件版本恢复能力。

## 决策

- 停止创建和读取 `project_resource_versions` 快照。
- 移除资料版本详情路由、详情页版本历史区块和对应样式。
- 资料详情只显示当前富文本正文；旧版本 URL 不再提供访问入口。
- 保留既有 `project_resource_versions` 表及其历史数据，不在本次变更中执行删除或清空。
- 未来若要删除旧表，必须先确认生产历史数据的保留期限、备份方式和不可逆迁移授权。

## 附件对象键

附件对象键由服务端创建，客户端不能指定。当前格式为：

```text
uploads/pending/<uuid>.<normalized-extension>
```

原始文件名保存在 `file_objects.original_filename`，不参与对象键生成。同名文件每次都会获得新的 UUID，因此可以同时上传，且不会覆盖已有 OSS 对象。

## 验证

- 创建、编辑资料后不会新增版本快照。
- 已有快照记录在编辑后仍保留，但不再通过 Web 页面或路由展示。
- `/web/projects/{project_key}/resources/{resource_id}/versions/{version_id}` 返回 `404`。
- 两个同名文件对象具有不同 `object_key`，写入测试对象存储后可分别读取各自内容。

## 相关文件

- `api/src/domains/project_resources.rs`
- `api/src/web/router.rs`
- `api/src/web/user/mod.rs`
- `api/templates/web/projects/resource_detail.html`
- `api/src/domains/files.rs`
- `api/tests/project_management_flow.rs`
- `api/tests/storage_config_flow.rs`
