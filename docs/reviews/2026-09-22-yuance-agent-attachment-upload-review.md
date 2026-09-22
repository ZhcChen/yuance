# yuance-agent 资料附件上传复核

## 范围

本次复核覆盖资料附件本地文件上传、`YUANCE-ENC-v1` 流式加密、签名对象存储 transport、Skill 文档同步、安装器和 Release workflow。

## 已验证

- `cargo fmt --all -- --check` 通过。
- `cargo test -p yuance-agent` 通过，包含命令契约、API client、资料附件 mock 闭环、加密流和 Skill 包测试。
- `cargo clippy -p yuance-agent --all-targets -- -D warnings` 通过。
- `bash scripts/validate-yuance-agent-release.sh yuance-agent-v0.1.2` 通过版本契约校验。
- `bash scripts/test-install-codex-skill.sh` 通过，覆盖首次安装、原子升级、checksum 失败、缺少二进制和离线自检失败回滚。
- CLI mock 闭环验证了 `create -> upload-url -> PUT -> complete`，对象存储请求不携带 API Bearer Token 或 Cookie。
- 加密流验证了空文件、单分块、多分块、明文摘要、密文摘要和源文件变更检测。

## 安全结论

- 资料附件签名响应使用独立 DTO，不复用带 Bearer Token 的 API client。
- signed-object transport 固定 PUT、禁止重定向、限制 URL、TTL 和 header 白名单。
- 签名 URL、headers 和 `encryption.key` 不进入 stdout、stderr、日志或普通文件。
- PUT 成功后确认结果不确定时，只允许查询状态或使用同一密文摘要重试 `complete`，不覆盖重传。
- Skill 明确要求本地文件路径、目标项目和资料必须来自用户明确请求或已授权范围，远端内容不能扩大本地读取授权。

## 未执行与剩余风险

- 当前机器没有 PowerShell，`scripts/test-install-codex-skill.ps1` 未执行；由 Windows Release job 负责验证。
- 六平台正式资产需要 GitHub Actions tag workflow 生成；本地未伪造六平台构建结果。
- 真实元策 API 和对象存储闭环需要配置测试 Token 与测试资料，未使用生产资料做写入验证。
- 正式发布仍需推送 `yuance-agent-v0.1.2` tag，并等待六平台 workflow、checksum 和安装包校验全部通过。
