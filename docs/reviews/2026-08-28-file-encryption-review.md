---
title: 资料库附件 OSS 静态加密实现复核
type: review
status: active
date: 2026-08-28
---

# 资料库附件 OSS 静态加密实现复核

## 结论

资料库新附件静态加密已按计划完成：服务端生成文件级 DEK 并信封封装，OSS 只保存
`YUANCE-ENC-v1` 密文；Web 使用 WebCrypto、Desktop 使用 Node `crypto` 在上传前加密、
下载后解密。已上传的明文附件不迁移、不受影响，后续新上传附件自动走加密链路。

## 实现要点

- 无需新增上传记录表：现有 `file_objects` 就是上传记录，已扩展
  `encryption_status`、`encryption_format`、`data_key_envelope`、
  `encrypted_byte_size`、`encrypted_checksum_sha256` 字段。
- 主密钥优先使用 `YUANCE_FILE_MASTER_KEY`；未设置时首次启动自动生成到
  `<data_dir>/secrets/file_master_key`（0600），已存在则跳过。
- 文件级 32 字节 DEK，AES-256-GCM 按 1MB 分块，AAD 绑定 `file_object_id +
  chunk_index`；header 内嵌明文大小、明文 SHA、nonce 表。
- 只对 `project_resource` 新附件启用加密，其他附件保持明文，避免扩大行为面。
- 下载签名返回 `encryption` 元数据；加密响应统一 `application/octet-stream`，
  Desktop/Web 校验密文大小与密文 SHA 后再解密，并再次校验明文 SHA。
- 上传完成后客户端把密文 SHA 提交到 `mark uploaded`，服务端登记密文元数据。

## 验证

- 服务端：`file_crypto` 6 个单测通过，`cargo test -p yuance-api --lib` 通过
  （`project_management_flow` 的并行隔离失败为既有用例问题，单跑通过）。
- Web：`npm run check` 57 个测试通过，覆盖加密上传、解密下载、篡改与错误密钥。
- Frontend：`npm run check` 全部通过，覆盖签名授权传递与密文 hash 确认。
- Desktop：新增 `file-crypto` 与加密 upload/download 单测，相关 49 个测试通过；
  全量 500 个中 489 个通过，8 个 Electron 集成用例因本机
  `node_modules/electron` 未安装而失败，与本次改动无关。

## 风险与边界

- 主密钥不支持轮换，正式环境首次启动后必须保持稳定并单独备份
  `/data/secrets/file_master_key`；轮换会造成已加密附件无法解密。
- 按用户约束仅考虑单机单节点部署，不做多实例密钥分发与并发生成竞争处理。
- 加密下载在 Desktop 端先收集密文再解密，明文上限 100MB，内存占用可接受。
- OpenAPI 静态契约未登记资源附件上传/下载路径，属于既有文档范围，不在本次扩展。

## 待办

- 本地 `git push` 被当前网络环境中断（SSH 连接到 github.com 后连接关闭），
  3 个功能提交与 1 个文档提交仍在本地 `main`，需要网络恢复后推送。
- 正式部署尚未执行；部署前需推送成功且工作区与 `origin/main` 一致。
