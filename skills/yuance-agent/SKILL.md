---
name: yuance-agent
description: 通过元策 OpenAPI 分析和操作项目、需求、任务、Bug 与工作项评论。用户要求查询项目或工作项、创建或更新需求/任务/Bug、发表评论或回复、流转状态、指派处理人时使用；也适用于未点名元策但明确要求处理元策工作项的场景。普通本地代码任务或首版不支持的元策能力不要使用。
---

# 元策项目协作

通过 Skill 自带的 `yuance-agent` CLI 操作元策，不手写 HTTP 请求。

## 定位 CLI

从当前已加载 `SKILL.md` 的所在目录确定 `<skill-dir>`，不要依赖当前工作目录或源码仓库：

- macOS/Linux：`<skill-dir>/scripts/yuance-agent`
- Windows：`<skill-dir>\scripts\yuance-agent.exe`

执行前确认 `YUANCE_API_TOKEN` 已配置；仅在用户需要覆盖默认正式环境时使用 `YUANCE_BASE_URL`。不得读取、回显、记录或写入 Token。

首次使用或排查安装时运行 `doctor --installation`；需要验证凭证与服务连通性时运行 `doctor`。

## 核心流程

1. 从用户输入中提取 `project_key`、`item_key`、动作和筛选条件。
2. 标识不明确时先执行窄范围查询；不要猜测项目、工作项、评论或用户标识。
3. 分析项目时先读取项目，再按显式项目范围和分页查询工作项。
4. 任何写操作前读取目标工作项；评论、回复、流转或指派前还要读取评论上下文。
5. 检查写操作所需字段。缺项目、标题、目标状态、处理人或回复目标时，先询问用户。
6. 执行一次最小写操作，解析 stdout 的 JSON envelope，并报告服务端实际结果。
7. 服务端拒绝状态转换、权限或范围时停止，不通过改用其他接口规避。

完整命令参数见 [references/commands.md](references/commands.md)。按任务选择性读取 [references/workflows.md](references/workflows.md)，错误处理见 [references/errors.md](references/errors.md)。

## 写入边界

- 创建前必须明确 `project_key`、`item_type` 和 `title`。
- 更新只用于标题、描述、优先级、截止日期和父工作项。
- 状态变化或处理人变化只使用 `work-items handoff`。
- 不在本地重建状态机；允许的转换以服务端当前校验为准。
- 回复评论前必须从评论列表确认 `parent_comment_id` 属于同一工作项。
- 正文较长或包含 HTML 时使用 `--description-file` / `--body-file`；传 `-` 可从 stdin 读取。
- 不重试可能重复创建、评论或流转的写操作，除非先读取并确认前一次未成功。

## 输出规则

- 只把 stdout 当作成功 JSON；只把 stderr 当作错误 JSON 或参数解析诊断。
- 分析结果说明结论、关键证据、风险和下一步。
- 写入结果说明动作、目标、关键参数和服务端返回的实际标识或状态。
- 缺信息时说明已确认内容和唯一必要的补充信息，不伪造成功结果。
- 认证、权限、范围、状态机和网络错误按错误类型处理，不盲目重试。

## 范围控制

首版只支持项目、工作项和工作项评论命令。用户要求其他元策能力时，明确说明当前 Skill 不支持并停止，不猜测隐藏命令或直接调用未知端点。
