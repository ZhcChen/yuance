---
title: main Web 视觉合同 V0 复核
type: review
status: completed
date: 2026-08-09
plan: docs/plans/2026-08-09-002-refactor-main-web-visual-parity-plan.md
baseline: main@6c0e56daa5460a9725ee00b8937124d390e9bd0b
---

# main Web 视觉合同 V0 复核

## 结论

V0 完成，可以进入 V1。`frontend/parity/main-web-visual-contract.json` 已将完整扫描固化为可执行合同，并与 `frontend/parity/experience-manifest.json` 的 30 个页面双向闭合。合同固定基线 SHA 和四个视口，逐页登记 V2-V10 单元、基线来源、fixture、区域顺序、稳定锚点、几何锚点、computed style、响应式预期、状态、动态遮罩、严重度和迁移状态。

schema 使用 Draft 2020，并对所有对象设置 `additionalProperties: false`。测试明确限制无基线页面只能是设备授权和 Shared App 入口；周期详情、资料详情和角色权限详情必须先补稳定 fixture；遮罩不得覆盖 `body`、`main` 或使用任意选择器；宿主差异只能登记字体渲染、原生滚动条和 Desktop 窗口边框。

## 可复现采集

`web/scripts/capture-main-visual-baseline.mjs` 固定基线提交，使用 `.artifacts/visual-parity/runtime/` 下的隔离 worktree、Cargo target、SQLite 和服务日志，并在 34000-34999 中选择空闲端口。浏览器使用独立 headed session，输出固定写入 `.artifacts/visual-parity/main/`。脚本退出时关闭 session、终止临时服务并移除 worktree，不接触当前开发数据库或个人浏览器状态。

审计采集计划：

```bash
npm --prefix web run capture:main-visual:plan
```

实际重新采集：

```bash
npm --prefix web run capture:main-visual
```

本轮未重复执行完整 main 构建和 84 张截图采集；扫描阶段的运行证据仍位于 `.artifacts/main-visual-baseline/`，本轮通过脚本测试验证采集参数和隔离边界。

## 验证

- `npm --prefix frontend test`：48 项通过。
- `npm --prefix frontend run check`：通过。
- `npm --prefix web test`：43 项通过。
- `npm --prefix web run build`：通过；保留既有 chunk size 警告。
- `git diff --check`：通过。

## 后续约束

V1 必须以本合同中的全局 token、8 个 breakpoint、58px 顶栏、`.main` 独立滚动和 computed style 字段为实现依据。V2-V10 每完成页面切片后更新对应 `status`，不得扩大遮罩或新增自由文本宿主例外来绕过差异。
