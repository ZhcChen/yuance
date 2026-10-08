# 本地开发套件任务

输入：`spec.md`、`plan.md`
状态：验收完成，待交付

## 本机 Docker 隔离

- [x] T001 [US2] FR-002 实施 local-docker 包装和聚焦测试，覆盖 context、builder、环境覆盖和显式远程拒绝。
- [x] T002 [US2] FR-003 接入本地镜像构建、smoke、测量与 Make cache 命令；依赖 T001，本地 tag/tar 独立，正式构建显式保留原制品口径。

## 本地开发套件

- [x] T003 [US1] FR-004 FR-005 修复 local-validation 地址/端口校验和 file key；增加显式 seed，不自动重设导入用户。
- [x] T004 [US1] FR-001 FR-003 新增 local-dev 统一命令与仅 API 的本机 compose；依赖 T001/T003。
- [x] T005 [US1] FR-006 对齐 Make/npm、README、API/Desktop 和 local-development Runbook；依赖 T002/T004。

## 真实验证与交付

- [x] T006 验证：执行聚焦失败场景测试、shell 语法、Spec Kit 检查和 doctor；依赖 T001-T005。
- [x] T007 验证：真实本机构建、容器 seed/health/ready/login/restart/down，验证原生 API 和 Web 代理；依赖 T006。
- [x] T008 独立代码审查、converge、复核证据和 diff 检查；依赖 T007。
- [ ] T009 按小闭环提交推送；不部署正式环境。

## 验收证据

- 聚焦套件测试 9/9、构建与清理回归 6/6、Spec Kit 测试 10/10 通过；shell 语法、正式模板校验通过。
- 本机 OrbStack 原生 ARM64 完整构建、load/save 通过；开发容器首次 migration/core/admin、ready、登录、认证 me、停止重启和密钥/用户保留通过。
- 原生 seed、API ready、Vite /web/app 和代理登录、API 重启密钥保留通过；远程环境变量注入仍使用本机且全局 context 不变。
- 独立审查发现并修复首次 seed 失败重试、旧镜像/端口误判、不同 checkout 容器冲突和备用正式制品示例回归。最终独立复核无阻断问题。
- 复核记录：`docs/reviews/2026-10-08-local-development-toolkit-review.md`。Desktop GUI、AMD64 完整构建、重新 npm ci、正式部署未执行；验证临时服务均已关闭，本地开发数据/密钥/镜像保留。
