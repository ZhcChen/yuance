<div align="center">
  <img src="api/static/brand/yuance-logo.svg" width="96" height="96" alt="元策 Logo">
  <h1>元策</h1>
  <p><strong>面向企业研发团队的轻量项目管理系统</strong></p>
  <p>围绕项目、需求、任务、Bug 与成员协作，提供清晰、高效的一体化研发管理体验。</p>
  <p>
    <img src="https://img.shields.io/badge/%E4%BC%81%E4%B8%9A%E7%BA%A7-%E7%A0%94%E5%8F%91%E5%8D%8F%E4%BD%9C-1f5fbf?style=flat-square" alt="企业级研发协作">
    <img src="https://img.shields.io/badge/%E9%A1%B9%E7%9B%AE%E7%AE%A1%E7%90%86-%E9%9C%80%E6%B1%82%C2%B7%E4%BB%BB%E5%8A%A1%C2%B7Bug-2d8a68?style=flat-square" alt="项目管理：需求、任务和 Bug">
    <img src="https://img.shields.io/badge/%E9%AB%98%E6%80%A7%E8%83%BD-Rust%20%2B%20Axum-c2410c?style=flat-square" alt="高性能 Rust 与 Axum">
    <img src="https://img.shields.io/badge/Rust-1.94-000000?style=flat-square&amp;logo=rust" alt="Rust 1.94">
  </p>
  <p>
    <a href="#核心功能">核心功能</a> ·
    <a href="#项目结构">项目结构</a> ·
    <a href="#文档入口">文档入口</a>
  </p>
</div>

元策（yuance）第一版采用 Rust 单体服务交付，在保持部署简单的同时，为企业研发团队提供聚焦核心协作流程的项目管理能力。

## 核心功能

| | 能力 | 说明 |
|:--:|---|---|
| 🏢 | 项目与成员 | 管理项目空间、成员关系与项目范围权限 |
| 🧩 | 研发工作项 | 统一管理需求、任务和 Bug，支持层级、优先级与截止日期 |
| 🔄 | 协作流转 | 支持状态流转、处理人指派、交接上下文与操作记录 |
| 💬 | 讨论与通知 | 提供富文本评论、回复、实时讨论和工作项通知 |
| 📎 | 资料与附件 | 管理项目资料，支持文件上传及常见文档在线预览 |
| 📊 | 进度洞察 | 提供项目看板、个人视图、周期管理与进度分析 |
| 🤖 | AI 协作 | 通过 OpenAPI 与 Codex Skill 查询和操作项目工作项 |
| 🖥️ | 多端体验 | 提供 Web 工作台与桌面客户端发布能力 |

## 项目结构

| 目录 | 用途 |
|---|---|
| [`api/`](api/) | Rust API、Web 页面、数据库迁移、模板与静态资源 |
| [`frontend/`](frontend/) | Web 与桌面端共享的前端工程 |
| [`desktop/`](desktop/) | Electron 桌面客户端及发布工具 |
| [`skills/yuance-agent/`](skills/yuance-agent/) | 面向 Codex 的元策协作 Skill |
| [`tools/yuance-agent-cli/`](tools/yuance-agent-cli/) | Skill 内置的 Rust OpenAPI CLI |
| [`docs/`](docs/) | 需求、计划、复核、运行手册与工程规范 |
| [`deploy/`](deploy/) | 正式环境部署模板 |

## 文档入口

| | 文档 | 内容 |
|:--:|---|---|
| 🚀 | [本地开发与启动](api/README.md) | 环境准备、常用命令、迁移与本地初始化 |
| 📦 | [正式环境部署](docs/runbooks/production-deployment.md) | 构建、发布、健康检查与回滚流程 |
| 🔌 | [API v1 契约](docs/runbooks/api-v1-contract.md) | 鉴权、分页、项目上下文与接口约定 |
| 🤖 | [Codex Skill 安装](docs/runbooks/yuance-agent-codex-installation.md) | 跨平台安装、凭证配置与升级方式 |
| 🖥️ | [桌面端发布](docs/runbooks/desktop-release-publication.md) | 桌面客户端构建与发布流程 |
| 📐 | [工程规范](docs/standards/) | Git、数据访问、UI 与运行配置约定 |

核心技术栈：**Rust · Axum · Askama · SQLite · TypeScript · Electron**
