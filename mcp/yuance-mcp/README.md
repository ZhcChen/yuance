# 元策 MCP Server

这是元策内置的本地 stdio MCP server。它不直连数据库，只通过元策 OpenAPI / `/api/v1` 调用服务。

## 环境变量

- `YUANCE_BASE_URL`：元策服务地址，例如 `https://yuance.quanxinfu.com`
- `YUANCE_API_TOKEN`：个人中心创建的 `yuance_pat_*` Token

Token 绑定创建它的真实用户，并继承该用户的项目范围、RBAC 和业务权限。Token 名称会作为 AI 助手名称展示，例如“张三 的 AI助手「Codex CLI 助手」”。

AI 通过 MCP 处理工作项时只能提交到“待确认”，不能直接完成、验证或关闭需求、任务和 Bug；最终确认由真实用户完成。

## 本地运行

```bash
npm install
npm run check
YUANCE_BASE_URL="https://yuance.quanxinfu.com" \
YUANCE_API_TOKEN="yuance_pat_xxx" \
npm start
```

## 受保护资料规则

如果资料 `is_protected = true`：

- 默认只展示标题、分类、创建人、更新时间和受保护状态。
- 不展示正文。
- 不展示附件下载地址。
- 不尝试绕过访问密码。
- 只有用户明确授权并提供该条资料访问密码时，才调用 `yuance_unlock_project_resource`。
- `access_password` 只用于本次请求，不缓存，不输出，不写日志。

## 工具列表

- `yuance_list_projects`
- `yuance_get_project`
- `yuance_list_work_items`
- `yuance_get_work_item`
- `yuance_list_work_item_comments`
- `yuance_create_work_item_comment`
- `yuance_handoff_work_item`：提交待确认，不直接关闭工作项。
- `yuance_list_project_resources`
- `yuance_get_project_resource`
- `yuance_unlock_project_resource`
- `yuance_list_notifications`
