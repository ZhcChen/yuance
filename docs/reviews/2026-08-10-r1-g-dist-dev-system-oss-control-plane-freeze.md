---
title: G-DIST-DEV R1 System/OSS 控制面冻结复核
type: review
status: completed
date: 2026-08-10
plan: docs/plans/2026-08-04-001-feat-g-dist-dev-internal-desktop-distribution-gate-plan.md
---

# G-DIST-DEV R1 System/OSS 控制面冻结复核

## 结论

通过（本地与可用 Gate）。U4-U6 的 System/OSS 发布、验证元数据、撤回、5 分钟 TTL 与 retention/N-1 控制面已实现并被负向契约冻结；R1 期间补上两个本地门禁缺口，发布脚本对 `desktop-v0.1.4` 与 `desktop-v0.1.5` 真实证据完成无副作用 preflight。

正式 System/OSS 发布、撤回演练和 N-1 恢复仍需要受限 `system_release:read/write` token 与正式 WSL 访问，属于 R2/R3 外部依赖，不在本阶段判定为缺失。

## 已实现（本地冻结）

- 迁移与 schema：`api/migrations/202608050001_add_system_release_verification_and_withdrawal.sql`、`202608050002_add_system_release_asset_evidence.sql` 提供 `channel`、`verification_status`、manifest/key/source 元数据、`withdrawn_*`、GitHub 处置状态和资产类型。
- 状态机与下载门禁：`api/src/domains/system_releases.rs` 只允许 verified 且未撤回的 internal 版本成为 latest/download；`withdrawn` 后停止签发新下载能力；并发 withdraw/download 测试收敛到拒绝。
- 发布脚本：`scripts/publish-desktop-release.mjs` 在任何 System/OSS 副作用前完成 minisign 版本、公钥、manifest、22 文件集合、签名、SBOM/provenance、source identity 校验；draft -> 上传 -> 受控回读 -> verify -> publish；同证据幂等，冲突不覆盖，withdrawn 版本拒绝复用。
- 撤回控制面：`POST /api/v1/system/releases/{id}/withdraw`、`PATCH .../withdrawal` 与审计记录，GitHub 处置失败保持 `failed` 可见告警。
- 5 分钟 TTL/SLO：`INTERNAL_RELEASE_DOWNLOAD_TTL_SECONDS = 300`，设置更新限制在 60..300 秒；`test_storage` 覆盖过期 grant 拒绝与 grant 绑定。
- retention/N-1：`update_settings` 清理全局超出版本，同时保护最近两个 verified、未撤回 internal 版本；撤回 current 后 latest 自动落到 N-1，`withdrawn/failed` 不成为回退候选。
- OpenAPI/前端契约：system OpenAPI 文档覆盖 release 全套路由与状态枚举；下载页和管理页展示 internal、macOS ad-hoc、Windows unsigned、Linux minisign 及撤回状态。
- GitHub Actions：全部 workflow 为 `.disabled`；`release-desktop.yml.disabled` 仅允许 `desktop-v*` tag 触发，普通分支 push 不会触发发行。

## 本阶段补齐的本地缺口

- `web/test/routes.test.mjs`：移除保存视图界面后残留的 `clearDefault` 断言与当前 `parseAppRoute` 契约不一致，已同步测试。
- `frontend/packages/ui/src/primitives.jsx`：下拉外部点击监听直接使用共享包禁止的 `document` 全局，已改为通过元素 `ownerDocument` 绑定监听，行为不变且通过边界检查。

## 需要正式环境验证（R2/R3）

- 正式 WSL 访问能力与当前受限 `system_release:read/write` token 权限（必须先重新验证，不沿用历史阻塞判断）。
- 将 `desktop-v0.1.4`（N-1）与 `desktop-v0.1.5`（current）发布到正式 System/OSS，并回读 GitHub、System、OSS 三处 manifest/digest 一致。
- 撤回 `desktop-v0.1.5` 的真实时间线：停止签发新 URL、旧 URL 5 分钟最大残余、GitHub 处置回写与审计。
- 基于正式数据的 N-1 恢复演练与重复发布/篡改负向演练。

## 验证

- `cargo test -p yuance-api`：全部通过（含 `system_management_flow` 19 项、`test_storage` 2 项）。
- `npm run check:frontend`：web 46、frontend 各包与边界、desktop renderer 全部通过。
- `npm --prefix desktop test`：478 项，475 pass，3 项 Windows-only skip，0 fail。
- 真实证据 dry-run preflight：`desktop-v0.1.4`、`desktop-v0.1.5` 均输出 `Verified 22 evidence files`，无 System/OSS 副作用。
- `git diff --check` 通过；`.artifacts/`、`test-results/` 未进入 Git。

## 风险与边界

- 已签发预签名 URL 在没有对象存储 deny 证据前，仅承诺最长 5 分钟残余，不宣称即时撤销。
- 正式发布前必须完成受限 token 创建和 WSL 可达性验证；不得使用 `qfy-sc-test` 旧冷回滚容器或本地 API 冒充正式环境。
- 生产 `G-DIST` 与 `G-UPDATE` 仍保持 pending/planned，本复核只冻结内部渠道 `G-DIST-DEV`。
