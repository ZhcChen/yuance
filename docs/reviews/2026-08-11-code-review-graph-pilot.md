# Code Review Graph 受控引入试点复核

## 结论

- 试点结论：**受控保留**，作为 `plan` / `review` 阶段的手工旁路证据源，不接入任何自动链。
- 5 个真实跨模块改动中，3 个产生经源码复核的 CRG 独有候选文件；2 个确认既有覆盖、未发现候选外文件。
- 增量更新实测约 0.5 秒，满足“中位数不超过 5 秒”的保留条件。
- `detect-changes --brief` 摘要对本次样本召回不足（5/5 均显示 0 changed functions / 0 test gaps），结论应主要依据 `query` / `importers_of` / `callers_of` 手工查询，不以摘要面板作为有效性的主要证据。
- 未引入 hooks、daemon、watch 或默认测试/提交链；`make crg.guard` 通过。

## 验证基线

- 图构建：438 文件解析；`make crg.status` 显示 436 files / 6032 nodes / 83051 edges；`graph.db` 约 86M；完整构建约 11 秒。
- 增量更新：`make crg.update` 更新 2 个文件、0 节点/边，耗时约 0.5 秒。
- MCP：`codex mcp get code-review-graph` 返回固定命令 `uvx --from code-review-graph==2.3.7 code-review-graph serve`；不带 `--repo` 的 CLI 查询能在元策目录自动定位 `.code-review-graph/graph.db`。
- MCP stdio 冒烟：`initialize` + `tools/list` 返回 server 与 `query_graph_tool` 等工具，server 可正常启动和暴露工具面。
- 当前 Codex 会话启动早于 MCP 注册，最终工具加载需重启会话后验证。

## 试点样本

| 提交 | 改动范围 | 首轮候选 | CRG 查询 | 有效新增 | 源码复核 |
| --- | --- | --- | --- | --- | --- |
| `5e99789` 粘贴图片 MIME 推断统一 | api / desktop / web / frontend | 8 文件 | `callers_of image_content_type_for_filename`、`callers_of createBrowserFilePlatform`、`callers_of createDesktopFiles` | `web/src/main.jsx`、`desktop/src/renderer/main.jsx` 不在首轮候选 | `web/src/main.jsx:6,20`；`desktop/src/renderer/main.jsx:11,26` |
| `947e6ce` 富文本直接粘贴图片上传 | desktop / frontend / web | 19 文件 | `callers_of RichTextEditor`、`importers_of rich-text.jsx`、`callers_of createFileDialog` | `desktop/src/main.mjs`、`desktop/test/support/network-session-electron-driver.mjs` 不在首轮候选 | `desktop/src/main.mjs:62,1449`；driver `:11,223,373` |
| `9fdbd1f` 对齐顶部项目角标 | desktop / frontend / web | 10 文件 | `callers_of createNotificationEventCoordinator`、`callers_of formatNavigationBadge` | 无候选外文件 | 结果与首轮候选一致 |
| `c8bf77d` 移除工作项保存视图 | api / frontend / web | 11 文件 | `callers_of buildWorkItemListPath` | 无候选外文件 | 结果与首轮候选一致 |
| `ea74781` 工作项更新支持周期字段 | api / frontend / docs | 6 文件 | `callers_of updateWorkItem`、`search update_work_item` | `frontend/packages/app-core/src/work-item-collaboration.js`、`desktop/test/renderer-api-transport.test.mjs` 不在首轮候选 | `work-item-collaboration.js:63`；`renderer-api-transport.test.mjs:121` |

## 误报与降级

- `detect-changes --brief` 对 5 个样本均输出 0 changed functions、0 test gaps、risk 0.00，属于摘要召回不足；已按规则降级到手工 `query`，未阻塞任务。
- 裸符号名查询可能返回 `ambiguous`，需使用图内 `qualified_name` 再次查询；属于正常使用方式，不是误报。
- 所有 CRG 新增候选均通过 `rg` 与当前源码复核；未发现需要记录为误报的路径。

## 保留建议

- 保留手工入口 `make crg.build` / `crg.update` / `crg.status` / `crg.review` 与独立 `crg.guard`。
- 跨 API / Web / Desktop / 共享前端包改动时，优先查询平台入口调用者（如 `web/src/main.jsx`、`desktop/src/main.mjs`、测试支撑驱动）和共享 UI 组件 importers。
- `detect-changes --brief` 摘要仅作参考；有效证据以可复核的 `query` 结果为准。
- 不使用 CRG 的 risk score 或 token savings 作为质量门禁，维持“运行时 > 测试/验收 > 当前源码 > CRG 高置信边 > CRG 推断边”的优先级。
