---
title: Web 与 Desktop U3 项目附件预览 API 复核
type: review
status: completed
date: 2026-08-07
plan: docs/plans/2026-08-07-001-refactor-web-desktop-exact-experience-parity-plan.md
---

# Web 与 Desktop U3 项目附件预览 API 复核

## 结论

项目附件预览已具备双宿主共享的版本化元数据与内容接口，可作为 Browser 和 Desktop 后续共享预览界面的唯一服务端契约。本切片未向 Desktop renderer 暴露对象存储地址、凭证或任意读取能力。

## 复核范围

- 预览类型、策略、能力状态和前后项导航元数据。
- `GET`、`HEAD` 与单段 byte `Range` 内容响应。
- 项目成员、viewer、设备身份和跨项目对象隔离。
- pending、归档、不支持类型和 legacy feature flag 降级。
- OpenAPI、设备业务白名单与运行手册一致性。

## 关键边界

- `HEAD` 和 `416` 只查询对象元数据，不读取对象正文。
- `206` 通过对象存储 range read 只读取请求区间；`200` 才读取完整正文。
- 多段 Range 明确返回 `416`，避免产生未实现的 multipart 语义。
- 内容响应使用 `nosniff`、`private, no-store`、inline disposition 和 sandbox CSP。
- SVG 不进入直接预览；不支持或不可用内容仍可由调用方降级到受控下载。

## 验证

```text
cargo check --manifest-path api/Cargo.toml
cargo test --manifest-path api/Cargo.toml --test device_business_parity_flow
cargo test --manifest-path api/Cargo.toml --test device_session_contract_flow
cargo test --manifest-path api/Cargo.toml --test project_management_flow
cargo test --manifest-path api/Cargo.toml --test routing_smoke
```

结果：5、7、179、31 项测试全部通过。
