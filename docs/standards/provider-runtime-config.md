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

## OpenDAL 使用边界

- domain 层负责把配置转换为 OpenDAL `Operator`。
- 浏览器不得接触长期密钥。
- 上传和下载使用短期 presigned request。
- 真实探测连接后续实现时不得把外部错误原样泄露到页面。

## 生产注意事项

- `YUANCE_SECURITY_MASTER_KEY` 必须稳定，丢失后旧密文无法解密。
- 更换 master key 需要独立的密钥轮换迁移方案。
- 备份数据库时等同备份 provider 凭据密文，应按敏感数据处理。
