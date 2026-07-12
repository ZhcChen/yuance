---
title: 浏览器冒烟验证
type: runbook
status: active
date: 2026-06-30
---

# 浏览器冒烟验证

用于验证服务端测试不容易覆盖的真实浏览器交互：

- 登录和 session 跳转。
- 顶部系统管理二级菜单 hover、右上角用户菜单与亮 / 暗主题切换。
- 角色权限页、创建角色 modal 打开 / 关闭和权限树父子联动。
- 用户管理创建用户、调整角色和重置密码 modal。
- 我的页面编辑资料和修改密码 modal。
- 对象存储配置 modal、版本回滚和确认弹窗。
- 项目创建 modal。
- 项目成员添加和成员角色调整 modal。
- 顶部当前项目可搜索下拉、空状态和项目切换。
- 工作项创建 modal。
- 工作项附件上传 modal、真实浏览器文件选择、本地图片预览、环形上传进度、签名直传、上传完成回写和页面刷新。
- 已上传图片的受鉴权下载加载、缩略图、查看器放大、旋转、重置与 Escape 关闭。
- 工作项详情不暴露删除入口，固定操作栏、回复编辑器和图片查看器交互正常。
- 浏览器控制台错误检查。

## 前置条件

本机需要安装 `agent-browser`：

```bash
npm install -g agent-browser
agent-browser install
```

## 执行

```bash
make api-browser-smoke
```

脚本默认使用隔离环境，不会复用当前 `127.0.0.1:33033` 的开发服务：

- 临时端口：`33035`
- 临时数据库：`/tmp/yuance-browser-smoke/yuance.sqlite3`
- 临时环境：`YUANCE_ENV=test`
- 临时管理员：`yuance_admin / Yuance@2026Dev!`

执行完成后会自动关闭临时服务和浏览器会话，并把截图、服务日志保留在 `/tmp/yuance-browser-smoke`。截图是 best-effort 收尾步骤；如果浏览器 daemon 忙导致截图超时，脚本会记录提示但不会否定已经完成的业务冒烟结果。

## 可选环境变量

```bash
YUANCE_BROWSER_SMOKE_PORT=33036 make api-browser-smoke
YUANCE_BROWSER_SMOKE_HEADED=1 make api-browser-smoke
YUANCE_BROWSER_SMOKE_ROOT=/tmp/yuance-browser-smoke-2 make api-browser-smoke
```

## 失败排查

- 如果提示端口占用，换一个 `YUANCE_BROWSER_SMOKE_PORT`。
- 如果提示未找到 `agent-browser`，先安装并执行 `agent-browser install`。
- 如果直传附件失败，优先查看：
  - `/tmp/yuance-browser-smoke/server.log`
  - 脚本输出中的浏览器错误
  - `/tmp/yuance-browser-smoke/*.png` 截图
- 如果 iframe 页面导航超时，脚本会在错误中标明触发操作；优先检查对应页面的服务端日志和浏览器控制台。

该脚本是补充验证，不替代 `cargo test --workspace` 和 `cargo clippy`。
