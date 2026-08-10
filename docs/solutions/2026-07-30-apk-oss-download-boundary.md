---
title: APK 与 OSS 下载边界判断
type: solution
status: accepted
date: 2026-07-30
---

# APK 与 OSS 下载边界判断

## 摘要

APK 上传完成后“不能下载”不是 OSS 的必然行为。需要先区分上传、页面发现、签名下载和移动端安装四类问题，避免把产品入口边界或 Android 安装限制误判为对象存储故障。

## 背景

系统版本管理已能通过 OSS 保存多平台版本资产，公开 `/web/downloads` 当前定位为桌面端下载页。Android APK 虽然可以作为系统版本资产上传和通过受控下载入口取得，但当前没有面向普通用户的移动端公开发现页。

## 关键结论

- 在签名身份具备对象读取权限、Bucket Policy 与 OSS 配置允许访问的前提下，阿里云 OSS 可通过签名 GET URL 下载任意对象类型；APK 不是 OSS 的禁用类型。
- 当前 `api/src/domains/files.rs` 已允许 `application/vnd.android.package-archive`。
- 当前系统版本 API 已允许 `platform = android`，且 `api/tests/system_management_flow.rs` 覆盖 APK 的“创建资产 -> 签名上传 -> 上传确认 -> 发布”流程。
- 系统管理页对已上传 APK 提供受权限保护的下载入口；公开 `/web/downloads` 页面被设计为“桌面端下载页”，只选择完整三平台桌面版本：每个平台为 `universal`，或同时具备 `x64` 与 `arm64`，刻意不展示 Android。
- `GET /web/downloads/{release_id}/assets/{asset_id}` 只验证“已发布且已上传”，不按平台限制。因此已发布 APK 在知道 release/asset ID 时也会走短时 OSS 签名 URL，但当前没有面向普通用户的 Android 发现页面。

## 排查口径

1. 上传失败：检查浏览器直传的 CORS、签名请求头、Content-Type 和 OSS 返回 XML。
2. 已上传但页面看不到：这是当前公开页面仅支持桌面端的产品边界，不是 OSS 下载失败。
3. 点击后 302/403：检查签名是否过期、Bucket/Endpoint 是否匹配、对象是否存在、RAM 权限，以及 OSS 防盗链 Referer 规则。
4. 返回 200 但手机不安装：这是 Android 浏览器/系统对未知来源 APK、下载权限或签名包的安全限制，不是 OSS 读取失败。

## 可复用建议

- 移动端公开分发需要在明确接受“已发布资产公开可下载”这一模型后单独实施。
- 可选产品入口包括新增 `/web/mobile-downloads` 或统一下载页，并按 Android/iOS 平台显式筛选资产。
- 服务端应展示对已上传字节计算并持久化的 SHA-256 与版本说明。
- 如需改善 Android 下载体验，可通过 OSS 对象元数据或已签名的响应参数设置 `Content-Disposition: attachment`。
- 发布前应校验目标平台允许的文件格式；Android 至少校验 CI 产物签名清单，条件具备时校验 APK package name、versionCode 与允许的签名证书。
- 不得仅因为公开桌面页未显示 APK 就把问题归因于 OSS。

## 验证 / 证据

- 文件：`api/src/domains/files.rs`
- 文件：`api/tests/system_management_flow.rs`
- 文件：`docs/plans/2026-07-23-003-feat-system-release-management-plan.md`
- 文件：`docs/runbooks/desktop-release-publication.md`

## 适用范围

- 系统版本管理资产上传、OSS 签名下载、桌面/移动端公开分发入口设计。
- 不适用于 D1/D2 的 Electron 安全宿主、device-session 或 Desktop 自动更新信任链。

## 后续事项

- 若要面向普通用户公开 Android 下载，应单独创建移动端下载页或统一下载页计划。
- 若不接受“已发布资产公开可下载”，必须在公开路由前增加鉴权与授权校验。
