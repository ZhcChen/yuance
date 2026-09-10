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

## 当前用户

```text
<cli> whoami
```

只报告 `/api/v1/auth/me` 返回的当前 Token 用户，不根据用户身份自动扩大项目、资料或通知查询范围。

## 项目资料

```text
<cli> resources create \
  --project-key <KEY> --title <TITLE> \
  [--category <CATEGORY>] [--body-file <PATH|->] [--body-format html|plain] \
  [--access-password-stdin] [--tags <TAG>...] \
  [--related-work-item-key <ITEM_KEY>] [--related-cycle-id <ID>]
```

创建资料前必须确认项目 key 和标题；正文较长或包含 HTML 时使用 `--body-file`。访问密码只能通过 `--access-password-stdin` 从 stdin 传入；正文和访问密码不能同时从 stdin 读取。

```text
<cli> resources list --project-key <KEY> [--q <KEYWORD>] [--category <CATEGORY>] [--status active|archived|all] [--tag <TAG>] [--related-work-item-key <ITEM_KEY>] [--related-cycle-id <ID>]
<cli> resources get --project-key <KEY> --resource-id <ID>
printf '%s\n' '<RESOURCE_PASSWORD>' | <cli> resources unlock --project-key <KEY> --resource-id <ID>
<cli> resources update --project-key <KEY> --resource-id <ID> [--title <TITLE>] [--category <CATEGORY>] [--body-file <PATH|->] [--body-format html|plain] [--access-password-action keep|set|clear] [--access-password-stdin] [--tags <TAG>...] [--related-work-item-key <ITEM_KEY>] [--related-cycle-id <ID>]
```

资料列表不接受 `--page`/`--per-page`。资料 ID、关联对象和项目 key 不明确时先查询或询问，不猜测。密码只从 stdin 读取，解锁返回的短时 `access_token` 不得记录或持久化。

## 资料附件

```text
<cli> resources attachments list --project-key <KEY> --resource-id <ID> [--access-token-stdin]
<cli> resources attachments create --project-key <KEY> --resource-id <ID> --original-filename <NAME> --content-type <TYPE> --byte-size <BYTES> [--checksum-sha256 <SHA256>]
<cli> resources attachments upload-url --project-key <KEY> --resource-id <ID> --attachment-id <ID> [--access-token-stdin] [--expires-in-seconds <N>]
<cli> resources attachments complete --project-key <KEY> --resource-id <ID> --attachment-id <ID> [--encrypted-sha256 <SHA256>]
<cli> resources attachments download-url --project-key <KEY> --resource-id <ID> --attachment-id <ID> [--access-token-stdin] [--expires-in-seconds <N>]
<cli> resources attachments delete --project-key <KEY> --resource-id <ID> --attachment-id <ID> --if-match <RESOURCE_UPDATED_AT>
```

附件命令只接受固定资料附件路径。`access-token` 通过 `--access-token-stdin` 从 stdin 读取，不能放入 argv、环境变量、普通文件或日志。当前 CLI 不执行对象存储文件字节 `upload`/`download`，也不提供任意 URL、对象键或 raw HTTP 参数；签名请求中的完整 URL、headers 和 `encryption.key` 不进入普通日志。

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

## 通知

```text
<cli> notifications list [--filter all|unread|pending|read] [--limit <N>] [--page <N>] [--per-page <1..100>]
```

只有用户明确要求查看通知或根据某条通知继续分析时才查询；不因为 `whoami` 返回的用户而默认查询通知。

## 全局选项

```text
<cli> --pretty <command> ...
<cli> --help
<cli> --version
```

`--pretty` 只改变 JSON 缩进，不改变 envelope。`--help` 和 `--version` 输出人类可读文本。
