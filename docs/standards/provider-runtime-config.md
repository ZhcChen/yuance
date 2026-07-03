---
title: Provider 运行时配置规范
type: standard
status: active
date: 2026-06-26
---

# Provider 运行时配置规范

## 范围

当前适用于对象存储配置，第一版 provider 为阿里云 OSS。

## 敏感信息规则

- AccessKey ID 和 AccessKey Secret 均视为敏感值。
- 敏感值使用 `YUANCE_SECURITY_MASTER_KEY` 派生密钥后加密入库。
- 页面只显示 AccessKey ID hint，不回显完整 AccessKey ID 或 Secret。
- 日志、审计 metadata、错误信息不得包含明文密钥。

## 配置版本

- 每次保存创建新的 `storage_configs` 记录。
- 保存时同步写 `storage_config_versions` 快照。
- 激活新配置时停用旧 active 配置。
- 当前 active 配置是文件上传签名的唯一来源。

## 默认值策略

- 阿里云 OSS 默认值兼容参考项目 qfy-sc：
  - Endpoint：`https://oss-cn-hangzhou.aliyuncs.com`
  - Region：`oss-cn-hangzhou`
  - 上传签名 TTL：`900` 秒
  - 下载签名 TTL：`600` 秒
- Bucket 不沿用 qfy-sc 的 `qfy-sc-private`，元策默认使用 `yuance-files`。
- 对象存储配置页在未配置时预填上述默认值；服务端保存时也会对空 Endpoint、Region、Bucket 执行同样兜底。
- 默认值只用于降低首次配置成本，不代表阿里云 Bucket 已存在；Bucket 仍需用户在 OSS 控制台或运维脚本中创建。

## OpenDAL 使用边界

- domain 层负责把配置转换为 OpenDAL `Operator`。
- 浏览器不得接触长期密钥。
- 上传和下载使用短期 presigned request。
- 桶检测必须走当前 active 配置，执行服务端临时对象写入、读取元数据和删除，确认 Bucket 存在且 AccessKey 具备对象读写权限。
- 桶初始化以写入 `yuance-system/.initialized` 标记对象为准；页面据此判断是否需要初始化。
- 元策当前不通过 OpenDAL 创建阿里云 Bucket，也不在页面自动创建 Bucket；如果 Bucket 不存在，应先到阿里云 OSS 控制台或运维脚本创建，再回到系统执行检测和初始化。
- 真实探测和初始化不得把外部错误原样泄露到页面，也不得输出 AccessKey 明文。

## 生产注意事项

- `YUANCE_SECURITY_MASTER_KEY` 必须稳定，丢失后旧密文无法解密。
- 更换 master key 需要独立的密钥轮换迁移方案。
- 备份数据库时等同备份 provider 凭据密文，应按敏感数据处理。
