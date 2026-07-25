---
title: refactor: 纯前端离线文档预览与富文本文件卡统一升级
type: refactor
status: in_progress
date: 2026-07-19
origin: 用户口头确认：移除后端 Office 转换依赖，文档预览全部改为前端处理
deepened: 2026-07-25
---

# refactor: 纯前端离线文档预览与富文本文件卡统一升级

## Overview

把当前“后端读取/转换 + 模板渲染”的文档预览链路改成“后端只负责鉴权与原始字节流，同源前端负责解析与渲染”。`/preview` 页面继续保留，但 PDF、文本、表格、Word、Excel、PPT 的可视化都改为浏览器站内完成，不再依赖 `LibreOffice / soffice`、ONLYOFFICE 或任何外部在线文档服务。

## Problem Frame

当前离线预览虽然已经脱离 ONLYOFFICE，但 Office 文件仍依赖服务端本地转换为 PDF，这和用户最新要求冲突：

- 预览能力仍受正式机是否安装 `LibreOffice / soffice` 影响；
- `api/src/web/user/mod.rs` 中混入了 Office 转换、预览缓存、文本/CSV 服务端渲染等多套预览职责；
- 预览页面目前对 PDF 以外文件的主体渲染仍然偏后端驱动，不利于后续继续增强文档交互；
- 富文本文件卡已经统一，但“哪些格式可预览、由谁预览、失败如何降级”的产品语义还不够清晰。

这轮调整的核心不是改入口，而是把**预览解析责任**从后端彻底移到前端。

## Requirements Trace

- R1. 文档预览不得依赖外部在线预览服务。
- R2. 文档预览不得依赖后端本地 Office 转换链路。
- R3. PDF 继续站内预览，并保留现有目录、缩略图、翻页、缩放体验。
- R4. TXT / LOG / MD / JSON / XML / YAML 等文本型文件改为前端读取后渲染。
- R5. CSV / XLS / XLSX / ODS 以站内表格视图渲染，支持工作表切换。
- R6. DOCX / PPTX 改为前端离线解析与渲染。
- R7. 预览入口继续走受控同源链路，不暴露对象存储长期地址。
- R8. 保留“返回来源 / 上一份 / 下一份 / 下载原文件”交互。
- R9. 富文本上传中与已发布态文件卡，需要和新的预览支持矩阵保持一致。

## Scope Boundaries

- 不实现在线编辑，只做只读预览。
- 不引入 SaaS 文档预览服务，不新增服务端转换守护进程。
- 不改动现有权限、附件上传、对象存储直传和下载鉴权模型。
- 本轮优先覆盖现代浏览器可稳定前端解析的格式：`pdf/txt/log/md/json/xml/yaml/yml/csv/xls/xlsx/ods/docx/pptx`。
- 现有 `doc/ppt/rtf/odt/odp` 在去掉后端转换后，不再承诺首轮仍可站内渲染；若缺少稳定浏览器解析库，则统一降级为“可下载、不可预览”。
- 不在本轮引入新的前端构建工具；优先沿用当前静态资源 vendored 方式。

## Context & Research

### Relevant Code and Patterns

- `api/src/web/user/mod.rs` 已集中维护附件预览入口、来源跳转、上一份/下一份导航和 `preview_content` 响应，是本轮后端收口的主入口。
- `api/templates/web/document_preview.html` 已有独立预览页结构，以及 PDF 专用边栏、工具栏和错误态 UI，可继续复用整体壳层。
- `api/static/document-preview.mjs` 已经实现较完整的 PDF.js 浏览器预览体验，适合作为“非 PDF 预览模块化入口”的宿主。
- `api/static/app.js` 与 `api/static/app.css` 已封装富文本文件卡、右键菜单、预览入口和上传态 UI，文件格式标识体系可复用到新支持矩阵。
- `api/src/domains/storage.rs` 与现有 `preview_content` 路由已经能提供受控附件读取能力，本轮无需把 OSS 长期地址暴露给浏览器。

### External References

- PDF.js 官方预构建模块支持浏览器内同源 PDF 渲染，适合继续保留现有 PDF 预览主干：`https://mozilla.github.io/pdf.js/`
- SheetJS CE 官方文档支持浏览器侧从 `ArrayBuffer` 读取 `xls/xlsx/ods/csv`，并可将工作表转换为 HTML：`https://docs.sheetjs.com/`
- `office-open-xml-viewer` / `@silurus/ooxml` 提供浏览器侧 OOXML（含 `docx/pptx`）解析与渲染能力，适合作为纯前端 Office 预览栈候选：`https://github.com/yukiyokotani/office-open-xml-viewer`

## Key Technical Decisions

- **继续复用 `/preview` 页面和现有导航语义。** 用户入口、来源回退、上一份/下一份、下载原文件都不改，避免影响现有工作项、评论、资料库正文里的预览链接。
- **后端只保留三类职责：权限校验、预览元信息下发、原始字节流响应。** 不再负责 Office 转 PDF，不再负责文本/CSV 的最终 HTML 渲染。
- **前端按文件类型分流解析。**
  - PDF：继续使用现有 PDF.js 预览器；
  - 文本：浏览器 `fetch + ArrayBuffer + TextDecoder` 后渲染到文本视图；
  - 表格：使用 SheetJS 解析为 workbook，自定义工作表 tabs + 表格视图；
  - DOCX / PPTX：引入纯前端 OOXML 渲染库，在独立容器中渲染；
  - 其他不满足首轮能力的文档：统一降级为不可预览但可下载。
- **保留同源 `preview_content` 入口，不直接把 OSS 临时地址交给第三方脚本。** 这样仍然满足受控下载、审计记录和访问隔离要求，同时不影响前端读取 `ArrayBuffer`。
- **不为此引入 bundler。** 继续采用 `api/static/vendor/*` 挂载方式，把 PDF.js / SheetJS / OOXML 预览库以静态资产形式接入，保持当前 Rust 单体的部署模型简单稳定。
- **预览支持矩阵必须和富文本文件卡同步。** 哪些格式能预览、显示什么文案、是否展示“预览文档”按钮，全部由统一的文件类型映射驱动，避免列表页、正文、右键菜单语义不一致。

## Open Questions

### Resolved During Planning

- **是否需要保留后端 Office 转换作为兜底？** 不保留。用户已经明确要求移除后端依赖，本轮方案以纯前端预览为唯一方向。
- **是否需要改成直接使用 OSS 临时 URL？** 不需要。保留同源字节流入口即可满足前端预览，同时继续隐藏底层对象存储细节。
- **是否需要为文档预览引入完整前端构建体系？** 不需要。本项目当前是静态资源直出模式，本轮仍沿用 vendored 浏览器构建产物接入。

### Deferred to Implementation

- **OOXML 渲染库最终落地是单一库还是 `docx/pptx` 拆分库组合？** 计划以 `@silurus/ooxml` 为优先候选；若浏览器构建产物、包体积或兼容性不满足当前静态接入方式，再退回到 `docx`/`pptx` 分治接入。
- **文本与表格的预览大小阈值如何细分？** 需要结合真实文件样本与浏览器性能，在实现阶段收敛到更精确的字节数、行数和列数上限。
- **是否为 `doc/ppt/rtf/odt/odp` 再补一轮纯前端支持？** 首轮实现先统一降级；如后续找到维护质量足够的浏览器库，再单独开后续计划扩展。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart TB
  A[点击正文或文件卡的预览入口] --> B[/web ... /preview]
  B --> C[后端校验权限并下发预览元信息]
  C --> D[前端预览模块按 file_type 拉取 preview_content 字节流]
  D --> E{文件类型}
  E -->|pdf| F[PDF.js 渲染]
  E -->|txt md json xml yaml| G[TextDecoder + 文本视图]
  E -->|csv xls xlsx ods| H[SheetJS 解析 workbook + 表格视图]
  E -->|docx pptx| I[OOXML 前端渲染器]
  E -->|legacy / unsupported| J[不可预览降级态 + 下载原文件]
```

## Implementation Units

- [ ] **Unit 1: 后端预览契约瘦身为“元信息 + 原始字节流”**

**Goal:** 移除服务端 Office 转换与模板内嵌文本/CSV 渲染职责，让后端只保留受控入口和统一元信息输出。

**Requirements:** R1, R2, R7, R8

**Dependencies:** None

**Files:**
- Modify: `api/src/web/user/mod.rs`
- Modify: `api/src/platform/config.rs`
- Modify: `api/src/web/router.rs`
- Test: `api/tests/project_management_flow.rs`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 重构 `AttachmentPreviewStrategy`，把“OfficePdf”这种后端转换语义改成前端可识别的预览类别。
- `build_document_preview_template` 不再读取正文内容、不再构造文本/CSV 表格数据，也不再触发 `ensure_office_preview_cached_pdf`。
- `attachment_document_preview_content_response` 统一为所有可预览类型返回原始字节流，供前端 `fetch` 后自行解析。
- 删除 `preview-cache`、`LibreOffice / soffice`、`onlyoffice_*` 相关配置与辅助函数。
- 对首轮不再支持站内渲染的 legacy 格式，在模板元信息中明确标识为“不可预览，只可下载”，避免前端盲目尝试。

**Patterns to follow:**
- `api/src/web/user/mod.rs` 中现有附件权限校验、来源跳转、导航组装模式。
- 现有 `preview_content` 响应写法与 `X-Content-Type-Options` 等安全响应头设置。

**Test scenarios:**
- Happy path：`docx/xlsx/pptx` 详情页仍能打开 `/preview` 页面，页面元信息正常返回且内容流可读取。
- Happy path：`pdf/txt/csv` 不再依赖服务端模板填充正文内容，仍能获得可消费的预览内容 URL。
- Edge case：附件状态为 `pending` 或 `deleted` 时继续返回友好错误页，不泄漏内容流。
- Error path：`doc/ppt/rtf/odt/odp` 被识别为首轮不支持预览时，页面展示降级态而不是 JSON 报错。
- Integration：工作项、评论、资料库三类来源的上一份/下一份导航和下载原文件链接不回归。

**Verification:**
- 后端代码中不再存在 `LibreOffice / soffice / preview-cache / onlyoffice` 预览路径依赖。
- `/preview` 页面仍能稳定打开，并且前端可以从同源内容 URL 拉到对应附件字节流。

- [ ] **Unit 2: 纯前端预览页解析栈重构**

**Goal:** 把 PDF、文本、表格、DOCX、PPTX 的渲染全部收敛到浏览器模块中。

**Requirements:** R1, R2, R3, R4, R5, R6, R8

**Dependencies:** Unit 1

**Files:**
- Modify: `api/templates/web/document_preview.html`
- Modify: `api/static/document-preview.mjs`
- Add: `api/static/document-preview-office.mjs`
- Add: `api/static/vendor/sheetjs/*`
- Add: `api/static/vendor/ooxml/*`
- Test: `api/tests/routing_smoke.rs`

**Approach:**
- 模板层只渲染统一容器、元信息和 data attributes，不再服务端直出文本或表格 HTML。
- `document-preview.mjs` 继续承载 PDF 预览，并新增“根据 `file_type` 懒加载对应预览驱动”的调度能力。
- 文本类型使用 `TextDecoder` 渲染 `<pre>` 视图，并保留超大文件截断提示。
- 表格类型使用 SheetJS 将 workbook 解析为工作表 tabs + 表格 DOM；`csv/xls/xlsx/ods` 走同一套表格 UI。
- `docx/pptx` 走独立 OOXML 预览模块，保持站内白底阅读区，不再借由后端转 PDF。
- 所有非 PDF 预览都使用一次性字节流读取；解析失败时展示统一错误壳层，不能跳到 JSON。
- 预览模块按需加载，避免非 PDF 文件也强制加载 PDF.js 全套逻辑。

**Patterns to follow:**
- `api/static/document-preview.mjs` 当前的 PDF 工具栏、缩略图、目录与懒渲染模式。
- `api/templates/web/document_preview.html` 现有壳层、工具栏、错误页与空态结构。

**Test scenarios:**
- Happy path：PDF 继续具备目录、缩略图、页码定位、缩放和拖动浏览能力。
- Happy path：TXT / MD / JSON 预览时在统一阅读区显示文本内容，超阈值显示截断提示。
- Happy path：XLSX / CSV 至少支持多工作表切换、表格滚动和单元格内容展示。
- Happy path：DOCX / PPTX 能在浏览器中渲染首屏内容，且不依赖服务端返回 PDF。
- Edge case：空文件、损坏文件、编码异常文件渲染失败时，页面显示友好错误态。
- Error path：浏览器不支持所需 API 或第三方库初始化失败时，保留“下载原文件”作为兜底。
- Integration：通过同一个 `/preview` 页面切换上一份/下一份附件时，不同文件类型能正确销毁旧预览状态并初始化新模块。

**Verification:**
- 预览页网络面板里不再出现任何 Office 转换 API 或服务端 PDF 缓存请求。
- `docx/xlsx/pptx` 预览成功时，浏览器拿到的是原始附件字节流，而不是后端预先转好的 PDF。

- [ ] **Unit 3: 文件卡、右键菜单与预览支持矩阵统一**

**Goal:** 让富文本编辑态、已发布正文、资料库和工作项详情中的文件卡统一表达“可预览/不可预览”能力。

**Requirements:** R6, R7, R9

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `api/static/app.js`
- Modify: `api/static/app.css`
- Modify: `api/templates/web/partials/work_item_detail.html`
- Modify: `api/templates/web/projects/resource_detail.html`
- Test: `api/tests/project_management_flow.rs`

**Approach:**
- 提炼统一的“文件类型 -> 图标/色带/可预览能力/右键菜单项”映射，避免正文文件卡、上传占位卡、右键菜单和预览入口判断分散。
- `docx/xlsx/pptx/xls/ods/csv/pdf/text` 显示“预览文档”或等价预览入口；降级格式不展示误导性预览按钮。
- 右键菜单继续保留复制链接、下载；只有真正可内联预览的格式才展示预览动作。
- 文件卡文案同步更新，避免继续出现“服务端离线转换”之类旧口径。

**Patterns to follow:**
- `api/static/app.js` 现有文件类型映射、预览入口与右键菜单事件委托。
- `api/static/app.css` 现有富文本文件卡和正文附件卡视觉体系。

**Test scenarios:**
- Happy path：上传 `docx/xlsx/pptx` 后，编辑态与发布态文件卡都展示正确的预览入口。
- Happy path：`pdf/csv/txt` 文件卡延续可预览能力，入口文案与图标统一。
- Edge case：同一正文内混排可预览与不可预览文件时，卡片样式和菜单项不混乱。
- Error path：legacy `doc/ppt/rtf/odt/odp` 不再展示会失败的预览按钮。
- Integration：从工作项、资料库、评论正文点击预览时都进入同一 `/preview` 体验。

**Verification:**
- 文件卡、右键菜单、详情正文、资料正文的预览判断逻辑一致，不再存在“按钮可点但页面实际不支持”的错位。

- [ ] **Unit 4: 文档、部署口径与降级策略同步**

**Goal:** 移除所有后端转换部署口径，补足纯前端预览说明与验证清单。

**Requirements:** R1, R2, R8, R9

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `docs/runbooks/production-deployment.md`
- Add: `docs/runbooks/document-preview-frontend-validation.md`

**Approach:**
- 从部署文档中移除 `LibreOffice / soffice / preview-cache` 初始化、校验与故障说明。
- 增加纯前端预览的静态资产说明、支持格式说明和 legacy 降级规则。
- 补充验证步骤：PDF、文本、表格、DOCX、PPTX、不可预览 legacy 文件至少各验一份。

**Patterns to follow:**
- `docs/runbooks/production-deployment.md` 当前部署口径组织方式。
- 现有运行手册中关于文件对象、OSS、静态资源的说明风格。

**Test scenarios:**
- Test expectation: none -- 本单元以文档与运行手册更新为主，不新增业务测试文件；实现时需保证手册与代码行为一致。

**Verification:**
- 正式环境运行手册不再要求安装 `LibreOffice / soffice`。
- 新验证文档能覆盖纯前端预览成功与降级失败两类结果。

## System-Wide Impact

- **Interaction graph:** 工作项详情、资料详情、评论正文、文件卡右键菜单、`/preview` 页面、静态资源加载和附件字节流响应都会受影响。
- **Error propagation:** 预览解析失败要在 `/preview` 页内消费并显示友好提示，不能退化为 JSON 或浏览器下载页。
- **State lifecycle risks:** 预览页面切换附件时需要销毁旧的 PDF/OOXML/SheetJS 实例，避免内存泄漏和旧状态残留。
- **API surface parity:** Web 侧附件预览支持矩阵变化后，OpenAPI/MCP 若复用相同预览判断，也要同步保持语义一致。
- **Integration coverage:** 至少要覆盖“正文文件卡 -> `/preview` -> 同源字节流 -> 前端解析渲染”的完整链路。
- **Unchanged invariants:** 权限判断、附件上传、对象存储签名、下载审计、上一份/下一份导航、下载原文件入口保持不变。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 前端 Office 解析库包体积较大，影响首次打开速度 | 采用按文件类型懒加载，非 Office 文件不加载相关静态模块 |
| 大型表格或大型 PPTX 在浏览器内存占用过高 | 为表格、文本、演示文稿增加大小阈值与友好降级提示 |
| `doc/ppt/rtf/odt/odp` 在纯前端方案下缺少可维护的稳定解析库 | 首轮明确降级为仅下载，不保留隐式服务端兜底 |
| 新的第三方前端库与当前静态资源直出模式不兼容 | 优先选择已有浏览器构建产物的库；若候选库不满足静态接入，再回退到拆分库方案 |
| 预览页连续切换多份不同类型文档时状态回收不完整 | 在预览模块设计中显式加入销毁钩子和类型切换重置流程 |

## Documentation / Operational Notes

- 本轮落地后，正式环境不应再把文档预览能力与服务器安装的 Office 套件绑定。
- 需要明确告知用户：纯前端方案首轮重点保障现代常用格式，legacy Office / ODF 文档若暂不支持，将提供稳定下载兜底。

## Sources & References

- **Origin document:** 用户口头确认：移除后端 Office 转换依赖，文档预览全部改为前端处理
- Related code: `api/src/web/user/mod.rs`
- Related code: `api/templates/web/document_preview.html`
- Related code: `api/static/document-preview.mjs`
- External docs: `https://mozilla.github.io/pdf.js/`
- External docs: `https://docs.sheetjs.com/`
- External docs: `https://github.com/yukiyokotani/office-open-xml-viewer`
