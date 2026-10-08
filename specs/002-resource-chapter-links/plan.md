# 资料同文档章节引用实施方案

- 规格：`spec.md`
- 状态：已完成，实现与验收已提交推送（`e4fbec0`）

## 技术上下文

后端 project_resources.rs 的 ammonia 同时清洗保存和展示，当前过滤 id/name。共享 UI rich-text.jsx 使用 DOMPurify、contenteditable/execCommand；当前目录 index+slug 会随改名重排变化且遗漏 h6。资料正文有独立滚动容器。现有 quick-xml 可遍历已清洗的序列化标签，无需新依赖。

## 规范与约束核对

遵守 AGENTS.md、Spec Kit Runbook 和宪章；仅本地运行，保持 HTML 安全清洗。不新增 API 字段、数据库迁移、分支、PR 或正式部署。

## 实现方案与文件范围

- 标题专用 data-yuance-section-id，值为 yuance-section- 前缀加 1–80 个 ASCII 字母/数字/下划线/连字符；不放开 id/name。链接使用 href="#yuance-section-sql-310"。
- 后端只在 h1-h6 放行并校验该属性。保存清洗后遍历标题，为缺失/冲突者分配 UUID 并持久化；历史正文回读仅清洗，前端阅读时使用确定性临时标识，不写库。二次清洗幂等。
- 前端共享章节工具统一验证/去重、标题列表、片段解析和滚动。资料编辑器在真实 DOM 上补标识，保留合法标识；章节链接工具提供标题选择，普通链接允许合法章节片段。仅资料启用该编辑能力，评论/工作项不扩大保存协议。详情只接管纯 fragment，正文容器滚动留白 24px，失效引用显示提示。旧 index+slug 别名只为无持久化标识的历史标题在阅读时注册；首次编辑将可解析旧引用迁移为新标识。持久化标题不按文字/位置回退，也不猜测失落的自定义 id/name。
- HTML 中的稳定属性不是全局 DOM id；定位始终限定当前正文标题。左侧目录和正文点击共用同一函数，初始 hash 也按此解析。
- 更新 docs/openapi/yuance.openapi.json 的正文说明、Skill references 和维护者 Runbook；CLI 既有 --body-file/--body-format html 原样透传，无需新参数。

## 阶段与依赖

1. 后端清洗、持久化与测试。
2. 共享 UI、编辑器、定位及测试，依赖统一标识合同。
3. 文档、真实 API/页面验收、独立 review 和交付。写入串行，探索/审查并行。

## 验证与验收

执行 cargo test -p yuance-api resource_section；npm --prefix frontend run check --workspace @yuance/frontend-ui；真实 OpenAPI POST/GET/PATCH、浏览器详情表格/正文/自动目录定位及编辑器重存。Playwright 回归 resource-detail-toc-resize.spec.mjs。验证重复/改名/重排/删除、脚本/事件/危险 URL、外链和历史资料；证据写入 docs/reviews/。

## 运行与恢复

使用本机开发/测试服务；关闭本轮启动的服务。无数据库迁移，回退代码不会删除正文；旧版本会在再次保存时移除新属性，须说明上线需匹配前后端。维护方法写入 docs/runbooks/resource-chapter-links.md；不部署正式环境。
