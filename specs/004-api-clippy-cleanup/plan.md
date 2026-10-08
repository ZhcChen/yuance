# API 严格 Clippy 告警清理实施方案

- 规格：`spec.md`
- 状态：实现及验收完成

## 技术上下文

Rust 1.94，现有 API/Axum/SQLx/SQLite。基线严格 Clippy：lib 51项、lib-test 53项；去重告警位于domains的device_sessions/files/project_resources/projects，platform的file_crypto/config，web的api/device_file_transfer/user。不新增依赖、数据库迁移或外部协议。

## 规范与约束核对

遵循AGENTS.md与Spec Kit Runbook；当前main分支、显式需求目录，无部署授权。不全局allow lint。并行只读探索/审查，主线程串行修改；不改变授权和事务边界。

## 实现方案与文件范围

先用cargo clippy --fix应用编译器可机械修正建议，逐项审查控制流与借用变化。其余函数用有语义的输入结构或元组分组相关参数，同步全部调用点；复杂SQL行用类型别名，测试模块移到文件末尾，浮点比较使用明确的partial_cmp保持NaN拒绝行为。全目标检查还覆盖api/tests/的辅助函数参数、类型比较与跨await锁；测试锁改为Tokio异步Mutex。修改仅限被告警定位的源码和受内部签名影响的调用/测试。无需独立research/data-model/contracts，原有协议不变。

## 阶段与依赖

T001机械告警修正后T002参数/类型/文件组织调整；T003严格检查及实际回归；T004独立审查与收敛；T005小闭环提交推送。探索可并行，写入不并行。

全量验证若发现已过期的测试夹具假设，先对照基线及现有行为，再仅更新相应断言。当前发现设备资料标题需保留章节属性，以及演示数据已扩展为12项目；不通过修改产品或种子数据迁就旧测试。

routing_smoke还发现docs/runbooks/api-v1-contract.md缺少两条既有资料库关联路径；按当前router与OpenAPI补全路径及方法，不新增路由或修改OpenAPI。

## 验证与验收

执行cargo fmt --all -- --check、cargo clippy -p yuance-api --all-targets -- -D warnings、cargo test -p yuance-api及CLI契约测试。复用会话刷新、加密往返、资料长正文、附件保护和项目管理测试。若暴露既有失败，核对当前基线并精确记录，不混入无关重构；任何本轮新增失败必须解决。独立复核安全/事务/参数顺序和浮点边界，证据写docs/reviews/。

## 运行与恢复

无运行态变化。无需同步OpenAPI、CLI、Skill或本机安装包，不部署、不修改生产资料。回滚对应源码提交即可。
