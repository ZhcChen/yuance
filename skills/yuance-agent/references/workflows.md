# 工作流参考

## 分析项目或工作项

1. 有明确 `item_key`：执行 `work-items get`，需要历史上下文时再执行 `comments list`。
2. 只有明确 `project_key`：执行 `projects get`，再用同一 `project_key` 和必要筛选执行 `work-items list`。
3. 两者都没有：执行 `projects list` 收敛候选；无法唯一确定时询问用户。
4. 列表结果较多时使用分页和关键词继续收敛，不扩大为无界枚举。
5. 报告时区分服务端事实、基于事实的判断和仍需确认的信息。

示例：“分析 YCE 项目的 Bug”应先读取 `YCE` 项目，再执行带 `--project-key YCE --item-type bug` 的工作项列表。

## 创建需求、任务或 Bug

1. 确认项目、类型和标题。
2. 必要时读取项目详情，确认用户指定的是目标项目。
3. 对处理人、父工作项等标识先读取或让用户明确提供。
4. 只提交用户明确给出的可选字段。
5. 创建成功后从返回 envelope 报告新工作项标识；失败时不要用相同命令盲目重试。

示例：“创建一个任务”缺少项目和标题，应先询问，不执行创建命令。

## 更新工作项元数据

1. 执行 `work-items get <ITEM_KEY>`。
2. 比较当前值与用户要求，只发送需要变更的元数据。
3. 用户要求改变状态或处理人时切换到 handoff 流程，不使用 update。
4. 没有实际变更字段时停止，不发送空 PATCH。

## 流转或指派

1. 执行 `work-items get <ITEM_KEY>`。
2. 执行 `comments list <ITEM_KEY>`，读取最近上下文和可能的来源评论。
3. 确认目标状态；涉及指派时确认准确的 `assignee_username`。
4. 需要关联用户明确指向的评论时传 `source_comment_id`。
5. 执行一次 `work-items handoff`，以返回状态为准。
6. 服务端拒绝转换时报告当前状态和错误，不自行尝试其他状态路径。

示例：“把 YCE-BUG-12 指派给 alice 并进入处理中”应先读取详情与评论，再以 `in_progress` 和 `alice` 执行 handoff。

## 评论或回复

1. 执行 `work-items get <ITEM_KEY>`。
2. 执行 `comments list <ITEM_KEY>`。
3. 顶层评论不传父评论 ID；回复必须确认目标 `parent_comment_id`。
4. HTML 正文使用 `html`，纯文本使用 `plain`；复杂正文优先通过文件或 stdin 传入。
5. 执行一次 `comments create` 并报告返回的评论标识。

## 不支持的请求

当用户请求当前命令参考中不存在的能力时：

1. 明确说明当前 Skill 只覆盖项目、工作项和工作项评论。
2. 不尝试猜测命令、读取私有路径或直接访问未声明端点。
3. 询问用户是否改为执行现有范围内的相关查询；没有替代动作时停止。
