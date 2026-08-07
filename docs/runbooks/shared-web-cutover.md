# 共享 Web 正式入口切换与回滚

## 适用范围

`YUANCE_WEB_APP_SHELL_V1` 控制已完成迁移的正式 `/web/*` GET 页面由共享 React 应用承载。写操作、Browser Cookie/CSRF、Desktop device session 与 operation registry 不受该开关影响。

当前已接入的页面族：

- 项目列表、项目详情、周期详情、资料详情和个人分析
- 需求、任务和 Bug 列表
- 工作项详情

## 启用

在 API 服务运行环境设置：

```bash
YUANCE_WEB_APP_SHELL_V1=true
```

重启 API 服务后，验证正式路径直接返回共享应用，并确认筛选 query、深链接和登录回跳保持不变。

## 回滚

移除该环境变量或设置为非真值后重启 API 服务：

```bash
unset YUANCE_WEB_APP_SHELL_V1
```

关闭后，已接入页面恢复 Askama SSR handler。回滚期间不得删除 `api/templates/web/` 中对应模板、旧列表 partial 或其 `api/static/app.js` / `api/static/app.css` 依赖。

## 验证

```bash
cargo test --manifest-path api/Cargo.toml --test routing_smoke web_shell_owner_serves_migrated_routes_from_same_app_entry -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_work_item_list_owner_preserves_filter_query_for_unauthenticated_request -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test project_management_flow web_work_item_list_pages_filter_by_type -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test auth_security_flow web_app_work_item_detail_owner_preserves_deep_link_query_for_unauthenticated_request -- --test-threads=1
cargo test --manifest-path api/Cargo.toml --test project_management_flow web_work_item_detail_page_renders_full_shell -- --test-threads=1
```

共享入口测试同时覆盖正式工作项详情；认证测试验证列表筛选与详情深链接回跳；两个 `project_management_flow` 测试在默认关闭状态验证旧 SSR 列表与详情仍可工作。
