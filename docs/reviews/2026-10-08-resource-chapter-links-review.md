# 资料同文档章节引用复核

日期：2026-10-08
规格入口：`specs/002-resource-chapter-links/`

## 结果与独立审查

通过。后端原先过滤标题 id/a name，前端也过滤 id 并按序号+标题重算定位，编辑器拒绝 fragment。现在仅在 h1–h6 保留严格限定的 `data-yuance-section-id`，保存补齐 UUID 并去重；正文引用和目录共同限定正文作用域、滚动同一正文容器。工作项/评论编辑器不启用资料专用保存协议。

改名、重排保留既有标识；同名标题各自独立；重复显式标识首个保留，后者生成新标识。删除后引用失效，全文替换须保留要继续引用的标识。

独立只读 reviewer 发现旧 index/slug 别名可能在删除同名首章后误绑剩余章节，已修复：别名只为原始无标识历史阅读节点在 WeakMap 注册；首次编辑迁移可解析旧 href；持久化标题不按文字/序号回退。最终独立复核无阻断问题。临时标识预留合法标识且使用有界碰撞后缀，UUID 碰撞重新生成。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `cargo test -p yuance-api --lib resource_` | 8/8；清洗、唯一/幂等/保留、历史展示、附件/SVG回归 |
| `cargo test -p yuance-api --test resource_contract` | 4/4 |
| `npm --prefix frontend run check` | 共享包源码/边界/类型/lint/各包与根测试通过 |
| 最终共享 UI check | 93/93，章节 helper 5 项 |
| `npm --prefix web run check` | 类型/lint、62/62 测试通过 |
| `npm --prefix desktop run check:renderer` | renderer 类型/lint/构建通过 |
| `cargo test -p yuance-agent --test skill_package --test openapi_contract --test command_flow` | 20/20；既有 HTML 文件透传、契约和 Skill 边界 |
| Playwright `resource-chapter-links.spec.mjs resource-detail-toc-resize.spec.mjs` | 4/4，本机 API 与项目无头 Chromium |

真实 PAT E2E 执行 POST → GET → 编辑器 PATCH → GET → PAT 改名/插入前置标题 PATCH → GET → 删除目标 PATCH，没有 mock 后端保存。保存与回读均保留目标属性及 fragment；重复标题标识唯一，脚本/事件/危险 URL 不保留。

实际点击表格“见 3.10”、正文目录和左侧目录，正文 scrollTop 一致；目标距正文顶部约 24px，整页 scrollY 不变。无效引用提示目标不存在，正文不跳顶、hash 不变；外部带 fragment 链接默认事件未被接管。编辑器选择文字、选择章节、保存后 GET 返回有效引用。

历史阅读/首次编辑迁移/删除同名首章为独立页面 fixture，其保存使用 mock，不作为后端历史写入证据。历史 HTML 后端清洗另有单元测试，正常保存链路由真实 PAT E2E 验证。目录拖动/宽度持久化/键盘操作、空正文转有正文均回归通过。

成功截图为 Playwright `real-resource-chapter-jump` attachment，报告位于 `.artifacts/playwright-report/`。测试临时资料/PAT 已清理，临时服务已停止。

## 收敛与边界

FR-001–FR-007、SC-001–SC-003 有实现与验证映射，无新增实现缺口；converge 结构检查通过。实际代码审查和运行验收独立于结构检查。

未部署正式环境、修改外部 BI 手册、打开 Desktop GUI、发布或更新已安装 Skill 包。仓库 OpenAPI/Skill 文档已同步，CLI 无需新参数或二进制协议变更。前后端须匹配发布，写入方始终保存后 GET 核验。历史已被过滤的任意 id/name 无法恢复，须明确补上标识和引用。
