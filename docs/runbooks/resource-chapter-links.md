# 资料同文档章节引用

## 维护 AI 的 HTML 与 API 写法

```html
<table><tbody><tr><td>源表映射</td><td><a href="#yuance-section-sql-310">见 3.10</a></td></tr></tbody></table>
<p>章节目录：<a href="#yuance-section-sql-310">3.10 SQL 对账</a></p>
<h3 data-yuance-section-id="yuance-section-sql-310">3.10 SQL 对账</h3>
<p>SELECT ...</p>
```

只在 h1–h6 使用 `data-yuance-section-id`。值须匹配 `^yuance-section-[A-Za-z0-9_-]{1,80}$`；标识与标题文字无关，文档内唯一。`id`、`a name`、事件属性及危险 URL 仍被过滤。

在现有 `POST /api/v1/projects/{project_key}/resources` 或 `PATCH /api/v1/projects/{project_key}/resources/{resource_id}` 中发送 `body` 为上述 HTML 字符串、`body_format` 为 `html`。请求的认证/权限与原协议相同。更新前 GET，以 `body` 编辑；保存后再次 GET，核验标题标识及链接匹配，不用 `body_html` 代替编辑正文。

CLI 原样传递 HTML，无需新参数：

```bash
<cli> resources update --project-key <KEY> --resource-id <ID> --body-file manual.html --body-format html
<cli> resources get --project-key <KEY> --resource-id <ID>
```

编辑器选择待链接的文字，点击“章节链接”，选择目标标题即可创建引用；重复标题按正文顺序显示编号。也可在“链接”中输入完整 `#yuance-section-...`。

## 标识生命周期

| 操作 | 行为 |
| --- | --- |
| 改标题文字、重排标题 | 保留既有属性，链接不变 |
| 同名标题 | 每个标题拥有独立标识 |
| 复制出重复标识 | 首个保留，后者生成新标识；已有链接仍指向首个 |
| 新增无标识标题 | 编辑器/服务端保存时生成并持久化 |
| 删除标题 | 原引用失效，阅读页提示目标不存在，不绑定另一个同名标题 |
| 全文重写 | 维护者须保留要继续引用的原标识，否则原链接失效 |
| 历史无标识资料 | 阅读时使用确定性临时目录标识，不写库；首次编辑保存生成持久化标识 |
| 历史 id/name 已被过滤 | 无法恢复原对应关系；维护者重新指定标识并同步引用 |

正文链接和自动目录都只在当前正文的标题中查找，滚动正文容器并留出 24px 顶部间距。无效/删除引用不会改变页面 hash 或跳到页面顶；外链（包括外链上的 fragment）不被接管。旧目录的 `resource-heading-序号-标题` 别名仅用于历史阅读兼容，不保证改名/重排后继续有效；新引用应使用持久化标识。

## 发布与验证

OpenAPI 需更新服务端清洗行为及正文契约说明，CLI 命令/二进制协议无需改变，yuance-agent Skill 需同步上述维护规则。前后端须匹配发布；旧服务端可能过滤新属性，旧前端不会处理新章节链接。本任务只本地验证，不表示正式环境已支持。

验证入口：`cargo test -p yuance-api --lib resource_`、共享 UI check、`npm --prefix web run test:e2e -- resource-chapter-links.spec.mjs resource-detail-toc-resize.spec.mjs`。
