# 资料库附件 OSS 静态加密与前端解密

## 标题信息

- 任务：资料库附件文件对称加密（OSS 只存密文），Web / Desktop 下载后解密
- 状态：进行中
- 负责人：Codex
- 日期：2026-08-28
- 上游文档：无（来自需求讨论）

## 目标

新上传的资料库附件在 OSS 中为密文；Web 与 Desktop 下载后自动解密得到明文；
服务端预览、Range 与图片/视频/文档查看保持可用；存量明文文件不受影响。

## 范围

- `api`：文件主密钥、文件加密格式、DEK 信封、数据库迁移、上传/下载/预览接口扩展、
  文件对象审计兼容。
- `web`：浏览器端加密上传、fetch 密文并解密下载。
- `desktop`：主进程流式加密上传、流式解密下载。
- 前端平台契约与 Desktop 传输契约扩展。
- OpenAPI、部署脚本/runbook、测试。

## 非目标

- 存量 OSS 明文文件迁移（后续单独任务）。
- 资料库以外附件（工作项、评论、项目附件、发布资产）首版不启用。
- 服务端不可信的端到端加密（E2EE）与用户口令/设备密钥体系。
- 主密钥自动轮换工具（首版只保留 `key_version` 字段，不做轮换命令）。
- 前端 wasm。

## 影响区域

- `api/src/platform/crypto.rs` 或新增 `api/src/platform/file_crypto.rs`
- `api/src/platform/config.rs`
- `api/src/domains/files.rs`、`api/src/domains/storage.rs`
- `api/src/web/api/mod.rs`、`api/src/web/attachment_preview.rs`
- `api/migrations/20260828xxx_*.sql`
- `docs/openapi/*`
- `frontend/packages/platform-contract/src/files.js`
- `web/src/platform/browser/files.js`
- `frontend/packages/api-client/src/resources.js`、`work-items.js`
- `desktop/src/files/transfer-contract.mjs`、`upload-executor.mjs`、
  `download-executor.mjs`、`business-attachment-coordinator.mjs`
- `deploy/easy-deploy/production/backend/*`、`docs/runbooks/production-deployment.md`

## 实现思路

1. 密钥体系（单机单节点简化版）
   - 文件级 DEK：每个资料库附件随机生成 32 字节，服务端用文件主密钥加密成
     DEK 信封存数据库；DEK 随文件生命周期不变。
   - 文件主密钥：应用启动时若 `YUANCE_FILE_MASTER_KEY` 已设置则读取；未设置时
     在 `<data_dir>/secrets/file_master_key` 生成 32 字节随机密钥（0600）并写盘，
     后续启动读取跳过；日志提示备份该文件。主密钥不落数据库。
   - DEK 信封带 `key_version`（首版固定 `v1`），为未来轮换预留。
2. 文件加密格式 `YUANCE-ENC-v1`
   - Header：magic、version、chunk_size、plaintext_byte_size、plaintext_sha256、
     chunk_count、每块 nonce。
   - Body：每块独立 AES-256-GCM（AAD 绑定文件 ID 与块序号），密文追加认证标签。
   - 分块格式支持服务端按块 Range 读取解密，保证预览/视频拖动可用。
   - OSS 对象 Content-Type 使用 `application/octet-stream`，原类型仍存数据库。
3. 上传链路
   - 创建资料库附件时服务端生成 DEK 并保存信封；
   - `upload-url` 响应扩展 `encryption`（DEK、格式、分块大小、明文大小、明文 SHA256）；
   - Web/Desktop 先加密后 PUT 密文，计算密文 SHA256；
   - `mark uploaded` 校验密文大小/类型，保存密文 SHA256。
4. 下载链路
   - `download-url` 响应扩展 `decryption`（DEK、格式、分块大小、明文大小、明文
     SHA256），同时 `transfer.sha256` 改为密文 SHA256；
   - Web：fetch 密文 → 分块解密 → Blob 保存；
   - Desktop：主进程 fetch 密文 → 流式解密写文件，校验密文与明文完整性。
5. 预览链路
   - 服务端读 OSS 密文 → 解封 DEK → 按块解密 → 沿用现有
     `preview/content` 响应与 Range。
6. 兼容
   - 存量与未加密附件 `encryption_status = 'plain'`，所有链路保持现状；
   - API 无 `encryption/decryption` 字段时，前端走旧逻辑。

## 阶段拆分

### 阶段 1

- 目标：服务端完成加密格式、密钥、信封、API 扩展与预览解密。
- 边界：不改前端，仅新增 API 字段与 Rust 测试。
- 验收重点：Rust roundtrip/Range 测试通过；加密文件 `mark uploaded` 校验密文；
  preview 能解密返回明文；未加密文件行为不变。

### 阶段 2

- 目标：Web 端加密上传与解密下载。
- 边界：仅 Web 浏览器适配层与平台契约，不涉及 Desktop。
- 验收重点：上传后 OSS 为密文；下载后 Blob 为明文；未加密文件仍原生下载。

### 阶段 3

- 目标：Desktop 主进程加密上传与解密下载。
- 边界：仅 Desktop 文件执行器与传输契约，不涉及 Web。
- 验收重点：主进程流式加密/解密；契约校验密文与明文完整性。

### 阶段 4

- 目标：端到端联调、OpenAPI、部署脚本/runbook、正式部署。
- 边界：不做存量迁移。
- 验收重点：本地 Web/Desktop 上传下载解密一致；正式环境手工验收。

## 执行单元

### 单元 1

- 所属阶段：阶段 1
- 目标：文件主密钥读取/自动生成与配置文件变更
- 涉及文件 / 模块：`api/src/platform/config.rs`、部署 runbook
- 前置依赖：无
- 验证方式：单测覆盖“无密钥生成到 `<data_dir>/secrets`，有密钥跳过”
- 完成标准：启动日志可看到主密钥来源；密钥文件 0600

### 单元 2

- 所属阶段：阶段 1
- 目标：`YUANCE-ENC-v1` 分块加密/解密与信封实现
- 涉及文件 / 模块：`api/src/platform/file_crypto.rs`（或扩展 crypto.rs）
- 前置依赖：单元 1
- 验证方式：Rust 单测 roundtrip、错误密钥/篡改、分块 Range 解密
- 完成标准：完整文件与任意块范围可正确解密

### 单元 3

- 所属阶段：阶段 1
- 目标：数据库迁移与文件对象加密元数据
- 涉及文件 / 模块：`api/migrations/*`、`api/src/domains/files.rs`
- 前置依赖：单元 2
- 验证方式：迁移状态 33/33；审计命令兼容
- 完成标准：`encryption_status`、密文大小、密文 SHA256、DEK 信封落库

### 单元 4

- 所属阶段：阶段 1
- 目标：资料库附件 upload/download/preview API 扩展
- 涉及文件 / 模块：`api/src/web/api/mod.rs`、`attachment_preview.rs`
- 前置依赖：单元 3
- 验证方式：API 集成测试覆盖加密上传、下载响应、预览 Range
- 完成标准：仅 `project_resource` 附件启用；旧附件响应无加密字段

### 单元 5

- 所属阶段：阶段 2
- 目标：Web 加密上传与解密下载
- 涉及文件 / 模块：`web/src/platform/browser/files.js`、平台契约、api-client
- 前置依赖：单元 4
- 验证方式：browser 适配层测试；本地手工上传/下载
- 完成标准：OSS 为密文；下载 Blob 为明文；旧文件行为不变

### 单元 6

- 所属阶段：阶段 3
- 目标：Desktop 加密上传与解密下载
- 涉及文件 / 模块：`desktop/src/files/*`、`transfer-contract.mjs`
- 前置依赖：单元 4
- 验证方式：Desktop 执行器测试；本地手工上传/下载
- 完成标准：主进程流式处理；契约校验密文/明文哈希

### 单元 7

- 所属阶段：阶段 4
- 目标：端到端联调、OpenAPI、部署脚本/runbook
- 涉及文件 / 模块：`docs/openapi/*`、部署脚本、部署复核文档
- 前置依赖：单元 5、6
- 验证方式：全套 check/test；正式部署后手工验收
- 完成标准：资料库新文件加密上传，Web/Desktop 下载解密正常

## 建议执行顺序

- 先做单元 1-4（服务端闭环），再做单元 5（Web），单元 6（Desktop）；
- 单元 4 完成后先进入一次 `review`，确认 API 契约后再写两个前端；
- 单元 7 结束进入正式部署 review。

## 验证方式

- 命令：
  - `cargo test -p yuance-api file_crypto`
  - `cargo test -p yuance-api`（全量相关）
  - `npm --prefix web run check`
  - `npm --prefix frontend run check`
  - `npm --prefix desktop run check`
- 手工检查：
  - 上传资料库文件后 OSS 对象首字节不是明文签名（PNG/PDF 等 magic 被隐藏）；
  - Web/Desktop 下载得到可打开的原文件；
  - 图片/视频预览与拖动正常；
  - 旧文件下载/预览不受影响。
- 预期证据：正式环境 `/version.json` 更新、上传前后 OSS 对象大小变化、
  加密字段出现在 API 响应。

## 风险 / 待确认问题

- 主密钥文件必须单独备份；丢失后已加密文件不可读。
- 旧版本客户端拿到加密文件会得到密文，前后端需同版本发布。
- Web 解密下载使用内存 Blob，100MB 上限下内存峰值约 2-3 倍文件大小。
- 加密后 OSS 对象大小变化，所有按明文大小校验的旧逻辑需同步调整。

## 沉淀跟进

- 完成后将“分块 AES-GCM 跨端格式”与“单机文件主密钥自动生成”经验写入
  `docs/solutions/`。
