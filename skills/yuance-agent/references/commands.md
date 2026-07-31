# CLI 命令参考

以下命令中的 `<cli>` 表示当前 Skill 目录内的 `scripts/yuance-agent`，Windows 使用 `scripts\yuance-agent.exe`。所有业务成功结果均为 stdout JSON envelope。

## 环境与自检

```text
YUANCE_API_TOKEN=<PAT>                 # 业务命令和联网自检必填
YUANCE_BASE_URL=https://...            # 可选，默认正式环境

<cli> doctor --installation
<cli> doctor
```

`doctor --installation` 不读取 Token，也不访问网络。不要把 Token 放进命令行参数、正文文件或 Skill 文件。

## 项目

```text
<cli> projects list [--status <STATUS>] [--page <N>] [--per-page <1..100>]
<cli> projects get <PROJECT_KEY>
```

项目不明确时先使用 `projects list`。获得唯一候选后再读取详情；多个候选时让用户确认。

## 工作项查询

```text
<cli> work-items list \
  [--item-type requirement|task|bug] \
  [--project-key <KEY>] [--q <KEYWORD>] \
  [--status open|in_progress|pending_confirmation|done|resolved|verified|closed|cancelled] \
  [--priority P0|P1|P2|P3] [--assignee-username <USERNAME>] \
  [--page <N>] [--per-page <1..100>]

<cli> work-items get <ITEM_KEY>
```

列表时尽量显式传 `--project-key` 和必要筛选；不要默认枚举所有可见项目。

## 创建工作项

```text
<cli> work-items create \
  --project-key <KEY> --item-type requirement|task|bug --title <TITLE> \
  [--description <TEXT> | --description-file <PATH|->] \
  [--priority P0|P1|P2|P3] [--assignee-username <USERNAME>] \
  [--due-date <YYYY-MM-DD>] [--parent-item-key <ITEM_KEY>]
```

`project_key`、`item_type` 和 `title` 必须由用户输入或已确认上下文提供。不要为了补齐参数猜测默认项目或标题。

## 更新元数据

```text
<cli> work-items update <ITEM_KEY> \
  [--title <TITLE>] \
  [--description <TEXT> | --description-file <PATH|->] \
  [--priority P0|P1|P2|P3] [--due-date <YYYY-MM-DD>] \
  [--parent-item-key <ITEM_KEY>]
```

至少提供一个字段。此命令不接受状态或处理人；需要改变两者时使用 `handoff`。

## 流转与指派

```text
<cli> work-items handoff <ITEM_KEY> \
  --status open|in_progress|pending_confirmation|done|resolved|verified|closed|cancelled \
  [--assignee-username <USERNAME>] \
  [--body <TEXT> | --body-file <PATH|->] \
  [--source-comment-id <ID>]
```

`status` 必填。用户只说“指派”但未说明目标状态时，先读取详情并询问目标状态；不要假设保持当前状态可被服务端接受。用户只说“进入处理中”但未给处理人时，不擅自选择成员。

## 评论与回复

```text
<cli> comments list <ITEM_KEY>

<cli> comments create <ITEM_KEY> \
  (--body <TEXT> | --body-file <PATH|->) \
  [--body-format html|plain] [--parent-comment-id <ID>]
```

默认 `body_format` 为 `html`。顶层评论不传 `parent_comment_id`；回复前先通过 `comments list` 确认目标评论 ID。

## 全局选项

```text
<cli> --pretty <command> ...
<cli> --help
<cli> --version
```

`--pretty` 只改变 JSON 缩进，不改变 envelope。`--help` 和 `--version` 输出人类可读文本。
