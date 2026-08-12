# 工作项详情页讨论区同步复核

日期：2026-08-12
提交：`3346e31`
范围：Web / Desktop 共享前端、API 详情 payload

## 结论

工作项详情页顶部“工作项详情”标题与刷新按钮已移除；主内容讨论区已按旧版 Web 版本同步 UI 与“发表/回复并指派”逻辑。本地聚焦验证通过，尚未执行正式环境部署。

## 改动摘要

- `frontend/packages/app-shell`：详情路由不再渲染全局 page-heading；新增评论/回复指派状态；评论提交支持“发表并指派 / 回复并指派”两段式调用；评论附件缩略图 URL 注入。
- `frontend/packages/ui`：讨论区恢复“协作记录 / 讨论”头部、彩色首字母头像、讨论卡片、发表于/编辑于时间；评论附件恢复图片/视频缩略图卡片；附件区标题恢复“历史资料 / 已有附件”。
- `api/src/web/api/mod.rs`、`frontend/packages/api-client`、`web/src/lib/api.js`：详情 payload 增加 `reporter_username`，供主评论“发表并指派”使用。

## 验证

- `npm --prefix frontend run check`：通过（api-client / app-core / app-shell / platform-contract / ui 共 191 项）。
- `npm --prefix web run check`：通过（52 项）。
- `npm --prefix desktop run check:renderer`：通过，renderer 构建成功。
- `cargo check -p yuance-api`：通过。
- `cargo fmt --all -- --check`、`git diff --check`：通过。

## 已知差异与后续

- 评论缩略图使用 `/api/v1/.../download` 作为 `<img>/<video>` 源；鉴权失败时显示“预览不可用”占位，不影响点击预览。
- 工作项附件列表仍是共享扁平行样式，与旧版缩略图卡片仍有差异；如需要，可下一轮把 `AttachmentList` 统一升级为卡片变体。
- “发表并指派”的目标沿用旧版语义：主评论指派给报告人，回复指派给被回复人；目标必须是启用中的项目成员，否则后端返回业务错误。
