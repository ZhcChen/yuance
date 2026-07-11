---
date: 2026-07-11
topic: dashboard-project-personal-analysis
origin: docs/brainstorms/2026-07-11-dashboard-project-personal-analysis-requirements.md
---

# 工作台项目推进与个人分析实施计划

## 实施单元

- [x] T1. 在项目领域层增加按用户、项目聚合的待处理统计和个人贡献分析查询。
- [x] T2. 增加受项目访问权限保护的个人项目分析路由、视图模型和页面模板。
- [x] T3. 重构工作台项目推进表，移除重复工作项区，增加待处理快捷入口和查看操作。
- [x] T4. 调整共享工作项列表模板，移除 Hero 并将新建按钮移动到列表标题栏。
- [x] T5. 补充领域查询、路由渲染和浏览器交互测试，完成桌面与移动端视觉检查。

## 统计实现约束

- 完成产出从 `project_activities` 的终态变更事件计算，按 `actor_user_id` 归属。
- 待处理从 `work_items.assignee_user_id` 与非终态状态计算。
- 评论参与从非删除的 `work_item_comments.author_user_id` 计算。
- 所有查询同时限定项目和当前用户，沿用现有项目访问控制。
- 时间展示使用现有页面时间格式；数据库聚合沿用 SQLite UTC 时间。

## 验证

- 领域测试覆盖终态事件、重复流转、待处理分类及空数据。
- 页面测试覆盖权限、项目表快捷链接、分析指标和新建按钮位置。
- 浏览器冒烟覆盖工作台到待处理列表、工作台到个人分析页面。
