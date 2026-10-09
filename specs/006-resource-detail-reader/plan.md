# 资料详情页阅读与操作体验实施方案

- 规格：`spec.md`
- 状态：实现与自动验证完成；本机预览已就绪，等待用户目视确认

## 技术上下文

资料详情由共享前端宿主渲染：`frontend/packages/app-shell/src/app.jsx` 提供资料数据、权限判断、路由和解锁/附件/归档动作；`frontend/packages/app-shell/src/application.css` 控制详情固定页头、左侧目录与独立正文滚动。章节目录和正文内部链接由 `frontend/packages/ui/src/rich-text.jsx` 生成并维护，已有可调整目录宽度。当前详情页把标题、元数据和所有管理操作放在正文卡片同一头部；用户截图显示正文第一标题与外层资料标题重复，长段落跨越可用阅读区。

本次不改 API、业务状态、富文本清洗或附件调用；无数据模型、数据库迁移、外部接口和新依赖。可用的端到端回归位于 `web/e2e/app-shell.spec.mjs`、`web/e2e/resource-detail-toc-resize.spec.mjs` 与 `web/e2e/resource-chapter-links.spec.mjs`。本地 Vite 已支持 `YUANCE_WEB_PROXY_TARGET`，本次按用户要求仅在启动进程中临时指定 `https://yuance.quanxinfu.com`，不改仓库配置；该代理仅供用户登录后的只读视觉预览。

## 规范与约束核对

遵循根目录 `AGENTS.md` 的 Spec Kit 与真实验证要求，以及 `docs/runbooks/spec-kit-workflow.md`、`docs/runbooks/local-development.md` 和 `frontend-design` Skill。用户明确要求本机代理正式环境 API，因此仅本次本机运行覆盖本地开发 Runbook 的 localhost-only API 约束；不得将正式 API 地址写入文件、打印或读取 Cookie/凭据，不执行任何正式资料写操作，不部署。保留现有项目颜色、组件、权限和阅读状态约定；详情页专属样式限制在 app-shell，不扩散到共享富文本组件。

## 实现方案与文件范围

在 app-shell 为读者加入简洁页头：返回资料库固定在左上，类别放在返回入口旁，不显示会与正文版本日期混淆的系统修改时间；资料标题仅在正文首标题不与资料名重复时显示。编辑作为有权用户的主要操作，归档以可见次级按钮放在编辑旁；超级管理员密码重置保持直接可见且仅限原有权限，继续使用现有点击处理器、禁用条件和确认对话框。受保护资料未解锁时仍显示资料名。

将资料阅读卡留作全高主体；保留目录/正文两个独立滚动区域及现有目录调整行为，为正文文本设置可读的最大行宽，表格和代码仍在自身区域横向滚动。窄屏下页头和管理操作组按空间换行、不互相挤压，目录维持现有横向导航样式。只调整 `app.jsx`、`application.css` 和受影响的 `web/e2e/app-shell.spec.mjs`，不触碰正文 HTML、数据、API 或富文本组件。

## 阶段与依赖

1. 页面结构与样式：修改共享 app-shell 的详情页页头、直接可见的次级操作、标题重复处理和阅读宽度/响应式样式；保留全部现有业务处理器，完成后执行既有详情页 E2E。文件：`frontend/packages/app-shell/src/app.jsx`、`frontend/packages/app-shell/src/application.css`。
2. 回归断言与真实预览：更新 E2E 对返回、编辑、直接可见的归档和密码重置操作、无系统修改时间、标题唯一、权限和多视口几何的断言；执行共享前端检查及章节/附件相关测试，再启动本地 Vite 正式 API 代理供用户预览。文件：`web/e2e/app-shell.spec.mjs`，运行态仅为本机进程。

两阶段顺序依赖，单人串行实施；阶段 1 可独立回滚，不改项目路由、数据或权限。

## 验证与验收

执行 `npm --prefix frontend run check`、`npm --prefix web run check`；使用 `npm --prefix web run test:e2e -- --grep "shared project resources filter read and unlock protected details"` 覆盖核心详情页与 390/768/1280/1440 宽度，并运行 `resource-detail-toc-resize.spec.mjs`、`resource-chapter-links.spec.mjs` 及 SVG/长正文相关详情回归。验证页头不重叠、正文/目录滚动独立、宽表/代码可横向滚动、重复标题只显示一次、锁定资料仍有名称、普通查看者看不到管理操作、维护者仍可使用既有编辑/归档/密码重置逻辑。启动本地 Vite 正式 API 代理，验证资料详情 SPA 路由和只读健康接口可达；用户在本机登录后进行最终视觉确认。代理不代为执行资料写操作。

## 运行与恢复

无需迁移、运行态数据或 Runbook 修改。预览前需存在 `web/node_modules`，启动 `YUANCE_WEB_PROXY_TARGET=https://yuance.quanxinfu.com npm --prefix web run dev -- --host 127.0.0.1 --port 4173 --strictPort`；用户在本机预览页面登录。结束预览时关闭本次 Vite 进程。该过程不会部署或写正式资料；恢复代码可回滚本次详情页 JSX/CSS 和相应 E2E 断言。
