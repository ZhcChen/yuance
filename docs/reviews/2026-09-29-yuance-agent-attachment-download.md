# Yuance Agent 项目资料附件下载复核

日期：2026-09-29

## 范围

- 项目资料正文中的附件 ID 到受控 API `download-url`、对象存储 GET、校验/解密、本地输出的闭环。
- Skill 与 OpenAPI 对新加密附件、历史明文附件和短时签名数据的说明。
- 工作项、评论、项目级附件和发布资产没有 Agent CLI 下载入口，不属于本次验收范围。服务端这些下载路由目前复用附件签名/加密响应构造器。

## 复核结论

- 下载契约只接受有效的服务端 GET、HTTPS 或 API loopback URL、有限 headers 与未过期签名；对象存储请求不携带 API Bearer Token/Cookie，也不跟随重定向。
- 加密附件必须包含密文 SHA-256；外层明文 SHA-256 可以为空。下载先校验密文摘要，再解密并校验格式头 SHA-256 和明文大小；若服务端明文摘要存在，还须与其一致。`encryption: null` 才走历史明文分支。
- 部分历史明文附件的 `checksum_sha256` 是空字符串。此时只校验响应长度和登记大小，并报告 CLI 本地计算出的摘要；这不是服务端摘要验证。
- `upload-url` 与 `download-url` 只输出 allowlist 元数据；签名 URL、headers 与 key 被脱敏。依赖旧版 CLI 读取原始签名字段的自动化存在行为不兼容，应迁移到 `upload` / `download` 复合命令。
- 所有远端字节在写入前均已完成传输校验、解密和摘要校验；目标以排他新建避免覆盖，Unix 权限为 `0600`。常规写入错误会尝试通过已打开文件句柄清空目标；进程被强制终止时仍可能留下部分文件，Windows 文件权限继承输出目录 ACL。

## 验证

- `cargo test -p yuance-agent -- --skip classifies_timeout_disconnect_and_invalid_json`：全部其余测试通过。
- `cargo clippy -p yuance-agent --all-targets -- -D warnings`：通过。
- `cargo fmt --all` 与 `git diff --check`：通过。
- 覆盖加密多分块、加密空文件、加密外层明文摘要缺失、篡改容器头摘要后拒绝、历史明文完整摘要、历史明文空摘要、密文摘要失败、AEAD 失败、路径冲突、签名请求脱敏和 Unix 输出权限。
- Windows 目标未在当前 macOS 主机完成交叉构建；缺少 MSVC C/C++ SDK。Windows 写入使用标准库文件创建并继承输出目录 ACL，仍需 Windows runner 覆盖权限和文件系统行为。

## 遗留

- 全量测试中的 `api_client::classifies_timeout_disconnect_and_invalid_json` 在本机断开端口的场景下断言错误分类失败；跳过该单测后 CLI 测试全通过。该测试失败在本次改动前已观察到，和附件下载逻辑无关。
- 当前 Skill 源码和 CLI 源码已更新，但没有构建/发布或安装新的 CLI 包；用户机器上已安装版本不会自动获得 `attachments download`。
