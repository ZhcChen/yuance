---
title: SQL 与 domain repository 规范
type: standard
status: active
date: 2026-06-26
---

# SQL 与 domain repository 规范

## 分层约定

- 业务查询和写入放在 `api/src/domains/*`。
- Web handler 只做 extractor、权限校验、调用 domain、组装 view model。
- SQL 使用显式 raw SQL，不引入 ORM。
- 跨表写操作优先使用事务。

## 命名约定

- 表名使用复数 snake_case，例如 `work_items`。
- 主键统一 `id INTEGER PRIMARY KEY AUTOINCREMENT`。
- 业务唯一键保留清晰字段，例如 `project_key`、`item_key`、`role_code`。
- 状态字段使用稳定英文枚举值，页面层负责中文展示。

## 查询约定

- 列表查询必须有稳定排序，通常为 `updated_at DESC, id DESC` 或 `created_at DESC, id DESC`。
- 页面列表第一版可不做复杂分页，但 domain 方法要保留 limit/page 扩展空间。
- `SELECT *` 禁止用于业务代码。
- 可能为空的关联展示字段使用 `COALESCE` 给出空字符串。

## 写入约定

- seed 必须幂等，优先使用唯一键和 `ON CONFLICT`。
- 涉及主记录和关联记录的写入必须同事务提交。
- 重要系统操作同步写 `audit_logs`。
- 业务协作操作同步写 `project_activities`。

## 迁移约定

- 已发布迁移不修改，只新增迁移。
- 每个新表必须包含必要索引、外键和状态约束。
- 敏感字段不可明文存储；需要通过 `platform::crypto` 加密。
