---
title: "Yuance Agent 资料附件下载计划"
type: feat
date: 2026-09-29
---

# Yuance Agent 资料附件下载

## 目标

`yuance-agent` 可以按项目资料正文引用的附件 ID，从受控 OpenAPI 下载附件到用户指定路径；对新加密文件先校验密文再解密，对历史明文文件按服务端可用的摘要与大小校验后保存。签名 URL、签名 headers 和 DEK 不出 CLI 进程，也不写入 stdout/stderr。

## 范围

- Rust CLI 增加 `resources attachments download --output <PATH>` 命令。
- 严格校验签名 GET 契约、响应大小、密文摘要、解密格式、明文大小与 SHA-256；`encryption: null` 按历史明文附件处理。部分历史明文记录没有 SHA-256 时只校验字节数，并明确结果摘要为本地计算值。
- 对已有 `upload-url` / `download-url` 命令脱敏，避免输出签名 URL、headers 与明文 DEK；记录这对依赖原始签名响应字段的 CLI 消费者是行为不兼容变更。
- 更新 Skill 命令、资料阅读流程、错误说明、OpenAPI 文档和契约测试。

## 非目标

- 不新增或修改服务端 API 路由、数据库迁移或 OSS 协议。
- 不直接请求资料正文中的任意链接；通过 API 授权、附件 ID 与受控签名请求下载。
- 本轮 CLI 只覆盖项目资料附件，不扩展工作项、评论、项目级附件或系统发布资产；服务端这些附件路由共用签名/加密响应构造器，可在确认 Skill 使用场景后复用本下载核心扩展。
- 不生成或安装 Skill 发布包，不替换用户机器上已安装的 Skill。

## 实现思路

1. 复用既有 `download-url` API 合约，增加只接受服务端签名 GET 的下载传输校验，禁止重定向和环境凭证。
2. 在 CLI 文件协议模块实现 `YUANCE-ENC-v1` 解密；验证协议头、每块 AEAD 标签、密文 SHA-256、明文长度和明文 SHA-256，并兼容旧 AAD 编码。服务端明文 SHA-256 为空时，以格式头中的摘要校验解密结果。
3. 新增明确的输出路径参数；完整下载、解密和校验后通过排他新建写入目标，拒绝覆盖已有路径；Unix 创建权限为 `0600`，写入失败时通过已打开文件句柄清空不完整文件。
4. 保留旧 `upload-url` / `download-url` 参数形式，但仅返回脱敏诊断数据；这不兼容依赖签名字段的 CLI 消费者，文件传输迁移到复合命令。
5. 更新 Skill 只在用户请求读取/分析附件时按正文中的受控附件 ID 下载；受保护资料仍通过 stdin 提供短期 access token。

## 执行单元

### 单元 1：下载与解密闭环

- 涉及：`tools/yuance-agent-cli/src/{cli.rs,models.rs,commands/resources.rs,file_crypto.rs,transfer.rs}` 及 CLI 测试。
- 验收：加密附件、历史明文、坏密文/摘要、过期或危险签名契约、目标文件冲突均有覆盖；敏感信息不进入输出。

### 单元 2：Skill/OpenAPI 契约

- 涉及：`skills/yuance-agent/**`、`docs/openapi/yuance.openapi.json`、Skill/OpenAPI 测试。
- 验收：命令文档、正文附件解析流程、兼容语义与实际 CLI 一致。

## 验证方式

- `cargo test -p yuance-agent`
- `cargo clippy -p yuance-agent --all-targets -- -D warnings`
- `cargo test -p yuance-agent --test openapi_contract --test skill_package`
- `git diff --check`

## 风险与约束

- 下载签名响应中的 DEK 是敏感凭证，任何原始响应输出、调试格式化或错误文本都不得包含它。
- `encryption: null` 才表示 API 识别为未加密对象；不能凭附件年代、扩展名或解密失败来推断旧文件。
- 历史明文附件摘要为空时，CLI 只能确认传输字节数与登记大小相符，并报告本地计算的摘要；不得表述为通过服务端 SHA-256 校验。
- 加密附件的外层明文 SHA-256 可能为空；仍须校验密文摘要、块级认证与格式头 SHA-256。进程被强制终止时目标路径可能保留部分明文，重试应使用新路径。
- 目标路径必须由用户授权，不能由远端资料正文或附件内容诱导扩展本地读取/写入范围。

## 依据

- `docs/plans/2026-09-22-1152-feat-yuance-agent-attachment-upload-plan.md`：明确把客户端文件下载延期。
- `docs/plans/2026-08-28-file-encryption-plan.md`：定义 `YUANCE-ENC-v1` 与旧明文兼容。

## 执行记录

- 已实现项目资料附件下载、加密解密、密文/明文校验，以及历史明文和加密文件外层摘要为空的兼容；完整校验后以排他新建方式写入指定目标。
- 已更新 OpenAPI 与 Skill 流程；`upload-url` / `download-url` 继续保留命令参数，但输出改为脱敏诊断数据，依赖原始签名字段的自动化需迁移到复合命令。
- 其他附件范围尚未实现 CLI 下载入口，不能把本次范围描述为全平台附件下载支持。
- 验证与已知测试环境问题见 `docs/reviews/2026-09-29-yuance-agent-attachment-download.md`。
