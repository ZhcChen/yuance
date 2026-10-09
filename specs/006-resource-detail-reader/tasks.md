# 资料详情页阅读与操作体验任务

输入：`spec.md`、`plan.md`

状态：实现与自动验证完成；等待用户目视验收

## 阶段一：资料详情页层级调整

- [x] T001 [US1][US2] FR-001/FR-002/FR-003/FR-007 调整 `frontend/packages/app-shell/src/app.jsx` 的资料页头：左上返回资料库、标题及元信息、主要编辑入口和次级操作菜单；复用原权限判断、禁用状态与确认逻辑，受保护资料未解锁时保留资料名。
- [x] T002 [US1][US3] FR-002/FR-004/FR-005/FR-006 调整 `frontend/packages/app-shell/src/application.css` 的资料阅读页头、正文行宽、宽内容横向滚动与窄屏布局；保留目录和正文独立滚动及既有目录拖拽布局。依赖 T001。

## 阶段二：回归与运行时验收

- [x] T003 [US1][US2][US3] FR-001 至 FR-007 更新 `web/e2e/app-shell.spec.mjs`，验证返回链接位置、编辑主操作、次级操作、锁定资料标题、普通查看权限及 390/768/1280/1440 视口不溢出。依赖 T001/T002。详情页断言已验证返回链接位于页头、编辑为主操作、次级菜单可键盘关闭、分类和标题显示正确，角色权限与四个视口几何无溢出。
- [x] T004 执行 `npm --prefix frontend run check` 与 `npm --prefix web run check`，并运行详情页、章节目录/锚点、SVG 和长正文相关 Playwright 测试；记录通过、失败、跳过和未覆盖项。依赖 T003。`frontend`、`web` 检查通过；详情页 E2E 4/4、目录/章节/SVG/长正文 E2E 11/11 通过，无跳过项。
- [x] T005 启动本机 Vite 预览并检查详情 SPA 路由和代理健康接口；正式 API 代理不执行保存、归档或其他写操作。依赖 T004。服务运行于 `http://127.0.0.1:4173`，详情路由及 `/api/healthz` 均返回 HTTP 200。隔离浏览器没有正式登录态，真实资料内容与登录后的控制台/视觉状态留待用户打开预览确认。

## 复核与交付

- [x] T006 对照规格和计划复核 diff、权限及已有滚动/目录行为；执行 `make spec-kit-check FEATURE=specs/006-resource-detail-reader STAGE=converge`；不自动部署。依赖 T004/T005。复核未发现权限或布局回归；外部指针点击关闭菜单的问题已修复并通过定向 E2E 复测。

## 验收证据

自动验证结果：`npm --prefix frontend run check` 通过；`npm --prefix web run check` 通过；资料详情 Playwright 4 项通过，菜单指针关闭补丁合入后核心详情测试再次通过；目录缩放/章节链接/SVG/长正文 Playwright 11 项通过；本机详情 SPA 路由和代理 `/api/healthz` 均返回 200。实际目标资料登录后渲染与人工视觉验收尚未执行；用户登录后仅作只读预览。
