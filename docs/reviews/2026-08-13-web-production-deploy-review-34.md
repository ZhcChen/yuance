---
title: Web/API 正式环境部署复核（富文本工具栏常用格式调整）
type: review
status: completed
date: 2026-08-13
---

# Web/API 正式环境部署复核（富文本工具栏常用格式调整）

## 结论

通过。富文本工具栏已按调整后的交互上线：段落格式、字号、文字颜色直接进入一级
工具栏，打开菜单前保存选区、应用格式后恢复选区；公网健康检查、迁移、文件对象
审计均正常，容器 running/healthy 且运行最新镜像。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD =
  `22e90f4806548b04d9f3c2967badedf6a9838157`。
- 发布方式：本地生成离线 bundle
  `/tmp/yuance-production-22e90f4.bundle`（SHA256
  `f203e5fb4a54dd11017bd9f359d764ea4577fbfacfe8f097edba487e44ba9684`），
  scp 到 WSL 后同步到 `22e90f4`，随后执行 `./scripts/deploy-production.sh`。
- 相对上次发布 `7661033` 的内容：
  - 富文本工具栏重构：段落格式（正文/标题 1/标题 2/标题 3）、字号、文字颜色
    直接展示在一级工具栏；
  - “更多”菜单收敛为引用、代码块、MD 转换、清除格式；
  - 打开菜单前保存选区，应用格式时恢复选区，选中文字后可直接改颜色/字号；
  - 菜单互斥并显示当前选中文字字号/颜色激活态；
  - 颜色 `rgb()` 归一为 hex，匹配色板。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:6f9a6b54ac77eb91da97d05b69de52da734e5b6bc3c3ac7e61f5cf2279e41299`。
- 镜像 tar：`dist/yuance-api-linux-amd64.tar`，SHA256
  `3549e2a119f3cf3313782005ca719c644e2bcf79d7b13003b8224293b0fd59fb`。
- 容器：`yuance-api` running/healthy，运行镜像 ID 与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30，state ok；`migrate up`、`seed
  core` 幂等执行成功。
- 文件对象审计：total=84 attached=84 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260813120512.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260813040512`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/version.json`：`{"version":"20260813120422"}`。
- `/web/app/assets/index-7dqr7S_3.js`：包含 `yc-rich-toolbar-select`、
  `yc-rich-toolbar-popover`、`段落格式`、`文字颜色` 标记，确认新工具栏产物已上线。

## 验收步骤

1. 打开 `https://yuance.quanxinfu.com`，进入工作项编辑/评论富文本。
2. 选中一段文字后，一级工具栏应能直接应用段落格式、字号与文字颜色，且应用后
   选区保持。
3. “更多”菜单应只包含引用、代码块、MD 转换、清除格式。
4. Desktop 通过共享前端自动同步，无需单独发布。
