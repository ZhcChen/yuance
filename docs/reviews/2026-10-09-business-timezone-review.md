# 东八区业务时间显示修复复核

日期：2026-10-09
活动规格：specs/007-business-timezone/spec.md

## 结论与时间契约

SQLite datetime('now') 保存 UTC，API 透传无时区字符串；原显示入口混用设备时区解析和原字符串展示，导致八小时偏差。共享前端统一将历史无时区时间解释为 UTC，再按 Asia/Shanghai 展示；显式 Z/偏移按原时刻转换。服务端桌面下载页同步转换并标注东八区。

2026-10-09 02:30:01、2026-10-09T02:30:01Z、2026-10-09T10:30:01+08:00 均显示 2026-10-09 10:30:01。纯日期、非法值保持原值，空值为空。数据库、API、CLI/Skill、鉴权过期、排序及用户正文不变，无迁移。

## 独立审查

只读后端审计确认 UTC 存储来源。独立 correctness reviewer 发现个人分析统计起点 joined_at 漏转换，已补齐共享 formatter 并扩充已有 E2E 断言；复核 findings 为空。后续下载页跨年 fixture、附件预览 query fixture 及 charset 修复独立复核无剩余发现。

## 实际验证

- npm --prefix frontend run check：通过，包含共享时间与组件测试。
- npm --prefix web run check：通过，68 项测试。
- cargo test -p yuance-api display_timestamp：1 项通过。
- cargo test -p yuance-api --test system_management_flow desktop_downloads_page_exposes_only_published_uploaded_assets：1 项通过，实际 HTML 跨年显示 2027-01-01 04:30:01（东八区）。
- cargo fmt --all --check：通过。
- web/e2e/business-timezone.spec.mjs：UTC、Asia/Shanghai、America/Los_Angeles 三个浏览器时区 3/3 通过；真实本机 API 创建/回读资料确认原值不变、显示正确，finally 清理测试资料。工作项评论、附件、流转覆盖偏移和跨年；截止日期保持不变。
- 既有消息搜索、个人资料、工作项布局、编辑流转、附件、资料权限、个人分析 7 项聚焦回归最终通过。初次附件失败因 preview/content fixture 未涵盖 client_decrypt 查询参数；修正后暴露 text/plain Blob 无 charset 导致中文乱码。仅给未声明 charset 的 text/plain 补 UTF-8，显式 charset 与原始字节保持不变，失败用例复跑通过；该预览修复单独提交。

## 范围与发布

Web 与 Desktop 共用前端实现；未启动打包桌面客户端，不声称完成其独立运行验收。本轮未部署正式环境，未修改正式资料。本机 4173 预览继续代理正式 API；E2E 写入仅使用独立本机临时数据库。回滚显示层提交即可，无数据库恢复操作。
