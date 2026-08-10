---
title: main Web 基础原语与画布 V1 复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 基础原语与画布 V1 复核

## 结论

V1 完成。共享 UI 已按固定 main CSS 校准 button、field、feedback、modal、table、pagination、badge 与 pill tabs；card 使用统一 16px radius 和 card shadow token，同时保留 `section`、`article`、`a` 的页面语义。消息、搜索、项目和工作项中原有的 `shell-button`、`message-tab`、`message-kind`、各类 pill 和 `message-pagination` 平行实现已清零。

内容画布恢复桌面 18px、移动 12px padding，并移除当前实现额外施加的 1200px 内容上限。Browser 与 Desktop 继续复用同一 `SharedApp`、UI package 和 application CSS。

## 复核发现与修正

四视口截图复核发现 1280px 下搜索框被 flex 拉伸，导致下载、系统管理与项目控件重叠。搜索与项目控件现使用基线宽度对应的固定 flex-basis；E2E 新增品牌、导航、工具区和工具子项边界不相交断言。修正后 390/768/1280/1440 均无 document 横向溢出或顶部控件重叠。

对抗式复核还发现新增但未使用的固定 `<section>` Card 抽象会破坏现有 `article/a` 语义，因此移除该组件，只保留共享 card token 和语义无关样式合同。

## 验证

- `npm --prefix frontend run check`：通过。
- `npm --prefix web run check`、`npm --prefix web run build`：通过。
- `npm --prefix desktop run check:renderer`：通过。
- Playwright：根导航、搜索、任务列表、消息语义目标、项目切换与四视口全局壳共 7 项通过。
- 运行截图：390px 移动画布无横向裁切；1280px 顶栏入口完整且互不重叠。
- 残留扫描：旧 button/tab/badge/pagination class 在 app-shell 运行源码中为零。

Web/Desktop 构建保留既有 500kB chunk warning，本切片未改变 API、认证、文件、SSE 或 Desktop 安全边界。

## 后续

进入 V2，移除所有 route 强制共享的 `shell-header` 与三摘要卡，按 main 恢复 Dashboard 四指标、项目 compact table、待处理讨论和最近活动双栏。
