# Web/Desktop U2 身份、路由与账户上下文复核

## 结论

U2 的身份恢复、共享路由、项目上下文、全局搜索和个人账户安全能力已进入唯一共享 React 组件树。Browser 使用 Cookie/CSRF，Desktop 使用 device principal 与固定 operation registry；两端通过同一 `api-client` 执行相同业务动作。

`page.shell.dashboard` 保持 `in_progress`：共享壳、当前项目和状态摘要已统一，但页面登记的“创建项目”属于 U3 项目域纵向迁移，不在 U2 中虚报完成。

## 关键证据

- Browser 认证失效保留共享深链接，logout 返回登录页：`web/e2e/app-shell.spec.mjs`
- Browser 搜索、资料、密码、PAT、设备撤销与项目切换：`web/e2e/app-shell.spec.mjs`
- Desktop 真实 Electron + real API 读取、更新和删除账户安全数据：`desktop/test/desktop-business-api-integration.test.mjs`
- Desktop logout 单飞、远端撤销、失败恢复和本地清理：`desktop/test/credential-coordinator.test.mjs`
- Session/device principal 可管理账户，PAT principal 被拒绝：`api/tests/device_access_auth_flow.rs`
- 密码修改保留当前凭证并撤销其他 Browser/Desktop 会话：`api/tests/device_access_auth_flow.rs`
- 固定 operation、输入白名单、DTO 去敏与 renderer 路由映射：`desktop/test/operation-registry.test.mjs`、`desktop/test/renderer-api-transport.test.mjs`

## 安全复核

- PAT 明文仅在创建响应出现，列表、日志和 Desktop 报告均不包含明文。
- Desktop renderer 无通用 fetch，新增请求只能经固定 operation registry。
- 密码、PAT 和设备 mutation 使用单次提交锁；删除和撤销使用共享确认 Modal。
- Browser mutation 经过 CSRF；device bearer 不依赖 Browser CSRF。
- 未引入 macOS Keychain 或 Electron `safeStorage`。

## 验证结果

- `cargo test --manifest-path api/Cargo.toml --test device_access_auth_flow device_access_manages_personal_tokens_and_device_sessions`
- `cargo test --manifest-path api/Cargo.toml --test device_access_auth_flow device_password_change_preserves_current_family_and_revokes_other_sessions`
- `node --test desktop/test/desktop-business-api-integration.test.mjs`
- `node --test desktop/test/credential-coordinator.test.mjs`
- `npm run test:e2e --prefix web -- --grep 'root navigation and logout|session expires|shared profile page|shared account security|global search|project switch'`
- `npm run check --prefix frontend/packages/ui`
- `npm run check --prefix frontend/packages/app-shell`
- `npm run check --prefix web`

以上验证均通过。U2 Exit 已满足；下一依赖单元为 U3。
