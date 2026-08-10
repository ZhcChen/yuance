# Web/Desktop U3 项目附件复核

## 结论

项目附件列表、登记上传、失败续传、下载、Desktop 原生定位和归档已迁移到唯一共享 React 实现。Browser 与 Desktop 使用同一附件状态模型和操作入口；宿主差异仅保留在受控文件 capability、传输和下载落盘 adapter。

## 关键边界

- 项目详情新增共享“项目文件”标签，viewer 可查看和下载，owner、maintainer 与超级管理员可上传、续传和归档。
- 上传遵循登记、签名、对象传输、确认四阶段；失败附件保留原记录，续传要求重新选择名称、类型、大小和 SHA-256 一致的原文件，并复用既有附件 ID。
- Desktop renderer 不接触 signed request。主进程 coordinator 通过固定 `attachment.project*` operation 完成登记、签名、传输和确认。
- Desktop 登记完成后通过受控进度事件发布公开附件 DTO，后续传输失败时共享 UI 仍可提供同 ID 续传，不会重复登记。
- 下载由 Browser DOM 或 Desktop 原生保存能力承载；Desktop 仅向 renderer 返回一次性 reveal capability，不返回文件路径。
- 归档保留附件记录并停止生成上传、下载签名；确认弹窗和重复提交锁由共享 UI 统一实现。
- 路由切换会失效旧上传 action 并清理上传、归档、下载状态，旧请求不能覆盖新项目页面。
- 项目附件列表加载失败只影响文件标签，不阻断项目信息、成员和周期页面。

## 运行基准差异

旧 `api/static/app.js` 和项目附件 handler 保留了附件业务能力，但当前 `api/templates/web/projects/detail.html` 没有渲染对应入口。迁移以正在运行的 API contract、权限规则和 parity manifest 目标语义为准，不复制这个入口缺失问题。

## 验证

- `cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow`
- `npm run check --prefix frontend/packages/app-core`
- `npm run check --prefix frontend/packages/platform-contract`
- `npm run check --prefix frontend/packages/app-shell`
- `npm run check --prefix desktop`
- `npm run test:e2e --prefix web -- --grep 'shared project file'`
- `node --test desktop/test/desktop-business-file-integration.test.mjs`
- `node --test desktop/test/business-attachment-coordinator.test.mjs desktop/test/file-commands.test.mjs desktop/test/renderer-api-transport.test.mjs`

## 剩余范围

项目附件预览和受控内容流仍为 `baseline`，不得视为本切片完成。项目详情页继续保持 `in_progress`；项目资源、版本/标签、文件对象树、活动和个人分析完成后，才能整体退役旧项目详情实现。
