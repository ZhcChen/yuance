---
title: Web 与 Desktop U7 系统发布资产复核
type: review
status: completed
date: 2026-08-08
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U7 系统发布资产复核

## 结论

Browser 与 Desktop 已共用同一套 React 发布资产交互和 app-core 生命周期，覆盖文件选择、登记、上传签名、传输、确认、刷新、下载和删除确认。宿主差异仅存在于文件与签名传输 capability：Browser 执行受控直传，Desktop renderer 只提交固定业务意图，由主进程完成签名和字节传输。

## 行为与边界

- 上传固定执行 `registering -> signing -> uploading -> confirming -> refresh`，写入成功但刷新失败会保留成功结论并单独提示。
- 平台仅允许 `windows/macos/linux/android/ios`，架构仅允许 `universal/x64/arm64`，资产类型仅允许 `installer/signature/sbom/manifest/checksums`。
- Browser 文件 capability 与签名 capability 均为一次性弱引用，上传使用短时签名请求并在同源写入时补充 CSRF。
- Desktop IPC、coordinator 和 operation registry 三层均拒绝任意 URL、method、header、非法 ID、未知枚举与附加字段。
- Desktop renderer 永远无法调用 `authorizeSignedRequest`，也不会收到 signed request、`object_key` 或 `file_object_id`。
- 草稿资产删除必须二次确认；下载使用单飞锁，只有 `uploaded` 资产显示下载入口。

## Manifest

- `page.system.releases` 保持 `shared`，补齐发布资产登记、签名、确认、下载签名和删除的动态 API effects 及双宿主证据。
- `action.system.release.asset-download` 提升为 `shared`，保留真实正式 Web 下载 route，并登记共享 API 下载签名与宿主传输效果。
- 上传和删除没有独立旧 Web form route，因此不伪造 action request；其正式能力归属、状态和测试由页面 contract 与动态 API surface 记录。

## 验证

- `npm --prefix frontend run check:packages`：API client 42 项、app-core 56 项、app-shell 4 项、platform contract 8 项和 UI 39 项通过。
- `node --test desktop/test/attachment-operation-registry.test.mjs desktop/test/business-attachment-coordinator.test.mjs desktop/test/file-commands.test.mjs desktop/test/preload-contract.test.mjs desktop/test/renderer-composition.test.mjs`：47 项通过。
- `npm --prefix desktop run check:network && npm --prefix desktop run check:ipc && npm --prefix desktop run check:renderer`：语法、类型、lint 与 renderer 生产构建通过。
- `npm --prefix web run test:e2e -- --grep "shared system release assets"`：Browser 文件选择、登记、PUT、确认、刷新、下载和删除确认通过。

## 后续

发布页面尚未执行正式 `/web/system/releases` cutover。下一切片应完成 route flag 切换、旧模板特征回归和回滚证据，再将页面与相关动作提升为 `cutover`。
