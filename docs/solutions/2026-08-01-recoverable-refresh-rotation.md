---
title: 使用预持久化 transaction 恢复 Refresh Rotation
type: solution
status: accepted
date: 2026-08-01
---

# 使用预持久化 transaction 恢复 Refresh Rotation

## 摘要

rotating refresh credential 不能只依赖“旧 token 单次消费”。客户端必须在请求前持久化 transaction ID，服务端必须按 source generation + transaction 保存短期加密结果，才能在响应丢失或进程强杀后安全恢复同一代凭证。

## 背景

如果服务端已提交 rotation，但客户端在响应到达或新 refresh 落盘前退出，旧 refresh 已失效，新 refresh 又不可得。盲目生成新 transaction 重试会被服务端视为旧 generation replay；直接签发另一组凭证则会产生并行 credential。

## 关键结论

- 客户端在发送 refresh 前，先把 `(source_generation, transaction_id)` 与当前 refresh credential 原子落盘。
- 服务端在同一数据库事务中消费 source generation、创建下一代 credential，并保存绑定 family/device/server/source hash/transaction 的加密响应。
- 相同 source generation + 相同 transaction + 相同 source credential 返回同一结果；仅知道 transaction ID 不能恢复凭证。
- 相同 source generation + 不同 transaction 是 replay，必须撤销整个 credential family，使竞争中已经返回的 access/refresh 也失效。
- 客户端收到响应后，只在 generation 和 pending transaction 仍匹配时原子提交；迟到响应一律丢弃。
- 幂等密文过期、损坏或因主密钥变化无法解密时 fail closed，要求重新授权，不能签发第二个不相关结果。
- logout、撤销和本地删除必须与 credential mutation 串行化，并通过持久 tombstone 防止 backup 在强杀后复活。

## 可复用建议

- 把 transaction recovery 设计成协议的一部分，不要把网络重试留给通用 HTTP retry middleware 猜测。
- 服务端唯一约束同时覆盖 family/source generation 和 transaction ID；并发测试必须包含同 ID 与不同 ID 两类竞争。
- 客户端状态机应把 `refreshing`、`locked`、`revoked` 和 `pending_revocation` 分开，避免瞬时网络失败恢复旧 access。
- access token 尽量只驻留内存；持久 record 只保存恢复 refresh 所需的最小绑定状态。

## 验证 / 证据

- `api/tests/device_refresh_rotation_flow.rs`
- `desktop/test/credential-coordinator.test.mjs`
- `desktop/test/device-auth-headless-integration.test.mjs`
- `api/src/domains/device_sessions.rs`
- `desktop/src/auth/credential-coordinator.mjs`

## 适用范围

- OAuth-like opaque refresh credential、设备会话和其他“服务端先提交、客户端后持久化”的单向代际协议。
- 不适用于可安全重复计算、没有单次消费状态或无需客户端持久化的新请求。
