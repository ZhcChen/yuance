---
title: "yuance-agent 资料附件密文长度修复复核"
type: review
date: 2026-09-22
---

# yuance-agent 资料附件密文长度修复复核

## 问题结论

`yuance-agent 0.1.2` 在部分对象存储签名响应包含 `Content-Length` 时，使用本地推导值校验签名；服务端上传签名对加密附件没有返回真实密文长度，导致签名长度契约不完整，SVG 上传在 signing 阶段失败。

## 修复内容

- API 对加密附件上传签名返回 `YUANCE-ENC-v1` 的实际密文长度。
- API 上传签名请求统一携带密文 `Content-Length`。
- CLI 使用服务端密文长度，并与本地协议公式交叉校验，拒绝不一致的服务端契约。
- CLI 错误信息包含签名值和期望值，便于定位不同服务端版本的契约漂移。
- 增加 CLI 加密签名契约测试和 API 上传签名回归测试。
- 版本升级到 `yuance-agent 0.1.3`。

## 验证

- `cargo test -p yuance-agent` 通过。
- `cargo test -p yuance-api --lib file_crypto -- --nocapture` 通过。
- `cargo test -p yuance-api --test device_business_parity_flow device_principal_matches_business_read_write_and_revocation_contract -- --nocapture` 通过。
- `bash scripts/test-install-codex-skill.sh` 通过。
- `bash scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.3` 通过。
- API 全量 `clippy -D warnings` 仍受仓库既有告警阻塞，本次新增代码未产生新的编译错误；应与既有基线分开处理。

## 发布与部署边界

本次不只是 CLI 修复，API 签名契约也发生了修复，因此必须先发布服务端，再发布 `yuance-agent-v0.1.3`。旧版 CLI 在服务端更新后会继续工作；新版 CLI 在服务端未更新时会明确拒绝不一致契约，不会上传错误长度对象。

## 后续修复

`0.1.3` 实际上传时又发现加密流在最后一个密文分块已经发送后，摘要状态可能尚未收到额外的 `None` 轮询，导致上传成功后读取摘要失败。CLI 已将完成标记前移到最后分块及源文件校验完成时，并升级到 `0.1.4`；服务端无需再次修改。
