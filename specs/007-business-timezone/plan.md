# 东八区业务时间显示修复实施方案

- 规格：`spec.md`
- 状态：方案完成

## 技术上下文

SQLite TEXT 时间由 datetime('now') 产生 UTC，Web/OpenAPI DTO 直接透传无偏移字符串。app-shell 的 formatTimestamp/formatChangeTimestamp 用宿主时区解析；dashboardTimestamp 只删除 T/Z；共享 UI 工作项、评论和附件直接显示原值。服务端 /web/downloads 的 display_timestamp 也仅替换 T。数据库设计本身无误，时刻解释和展示层有误；本机 TZ=Asia/Shanghai 已复现无时区 02:30 与带 Z 02:30 分别显示 02:30/10:30。

## 规范与约束核对

遵循 AGENTS.md、docs/runbooks/spec-kit-workflow.md 与本地 E2E 入口，不部署、不修改正式数据。不改变 API、CLI/Skill、数据库字段、鉴权过期和日历日期语义。前端复用共享 UI 包，Web/Desktop 同源受益；Rust 复用现有 chrono，无新增依赖。

## 实现方案与文件范围

在 frontend/packages/ui/src/formatters.js 新增共享 formatBusinessTimestamp，历史 YYYY-MM-DD HH:mm:ss 或无偏移 ISO 按 UTC 解释；明确 Z/偏移按原时区解析；Intl.DateTimeFormat 显式使用 Asia/Shanghai，固定 24 小时，复用缓存实例。纯日期、非法值保持原值，空值为空；支持完整格式和现有列表短格式。

app-shell 三个现有入口委派共享 formatter；资料列表提示也转换。共享 work-item-detail.jsx、work-item-comments.jsx、work-item-attachments.jsx 的可见时间复用 formatter，不修改原对象和编辑比较。api/src/web/user/mod.rs 的 display_timestamp 通过 chrono UTC/显式偏移解析转换为 +08:00，下载模板标注东八区。新增单元和本机 API/浏览器测试；时间契约与证据记录在 docs/reviews/。无数据模型/接口迁移。

## 阶段与依赖

1. 共享前端 formatter 与调用方串行实现，单元覆盖不同设备时区和边界。
2. 补服务端下载页格式化与 Rust 测试，单人集成避免共享工作区写冲突。
3. 本机真实 API 和模拟偏移的浏览器验收、独立 review、规格收敛及提交推送。后端存储审计已独立委派，仅只读。

## 验证与验收

npm --prefix frontend run check；npm --prefix web run check；cargo test -p yuance-api display_timestamp；npm --prefix web run test:e2e -- e2e/business-timezone.spec.mjs。单元覆盖 UTC、Asia/Shanghai、America/Los_Angeles 设备时区及等价偏移、跨年、毫秒、空/非法值和纯日期。浏览器在三个设备时区使用本机真实创建资料的 API 返回值验证显示，工作项详情与评论/附件/流转使用历史 UTC 和等价偏移 fixture 验证一致显示；截止日期不变。复用资料详情权限、目录/章节相关 E2E。测试只使用 Playwright 本机临时数据库；独立复核不代替真实验证。

## 运行与恢复

无迁移与运行配置变化。当前 4173 正式 API 代理保持只读预览；正式发布需用户另行授权。回滚本轮显示层提交即可，数据库与 API 不变。
