# API 严格 Clippy 清理复核

日期：2026-10-08
活动规格：`specs/004-api-clippy-cleanup/`
基线：`7cb13f6`

## 改动与语义边界

基线API严格Clippy在库上有51项告警、库测试上有53项。修正冗余借用、嵌套条件、返回值、重复类型和模块顺序；库通过后继续清理全目标暴露的测试辅助函数参数与跨await同步锁。未新增lint allow或修改全局告警等级。

会话刷新输入、附件归档输入、预览审计与Web预览输入改为语义结构，逐项保持原值；评论正文和格式组合，SQL行使用同一类型别名。资料活动的四个调用目标原来均为project_resource，去掉冗余参数并固定原绑定值。文件解密改用标准Range，保留块和明文的半开区间、末尾块+1、异常及事务顺序。HTTP协议、授权边界、数据库和加密格式未改变。

工时使用partial_cmp显式保持NaN拒绝，新增NaN、无穷、零、负数及(0,24]边界验证。Clippy自动建议曾把serde_json::Value的请求头字符串比较改为数字比较；主线程审查纠正为预计算期望字符串和as_str比较，没有修改产品响应协议。

## 验证发现的既有夹具问题

设备资料测试精确要求无属性h2，干净基线7cb13f6独立复现同样失败。更新为验证标题内容及合法UUID章节标识，保留脚本、事件属性、危险URL被清除的断言；设备业务一致性8/8通过。

全量回归发现5条旧演示数据假设：种子早已为12项目/12成员，暂停项目为CRM/IOT/TRAIN，自动选择按排序为PAY；种子及选择算法本轮未改。同步完整计数/集合/分页断言，当前项目用真实PATCH选择YCE后保留YCE→OPS的原验证。项目管理96/96通过，未通过修改产品数据迁就测试。

基线与主树曾共用target造成旧库签名被误复用；结束所有隔离编译后清理API开发构建缓存并从主树重跑。此中间构建失败不计作测试通过，也不作为产品回归。隔离worktree已删除，补丁及临时日志在.artifacts/中。

路由冒烟发现Runbook漏列两条已有资料库关联路径。按现有router和OpenAPI补齐GET关联列表及GET/POST/DELETE工作项关联状态路径；未新增接口。routing_smoke 30/30通过，最终全量也覆盖该检查。

## 独立审查

正确性审查、安全/对抗审查及新增夹具复核均无未解决阻断问题。已逐项核对SQL绑定、参数映射、权限短路顺序、加密范围与浮点语义。

保留一项既有测试隔离边界：routing_smoke的环境变量helper在action panic/取消时不自动恢复；原同步锁版本也没有RAII恢复。本轮仅改为异步锁，不扩展进程环境设计，此项不影响正式产品。

## 验收与交付

| 最终验证 | 结果 |
| --- | --- |
| `cargo clippy -p yuance-api --all-targets -- -D warnings` | 成功退出，无告警 |
| `cargo fmt --all -- --check` | 通过 |
| `cargo test -p yuance-api --no-fail-fast` | 393项通过、0失败、0忽略；含92库单元、96项目管理、30路由冒烟、19系统管理及会话/加密/资源合同等 |
| CLI api_client / command_flow / openapi_contract / skill_package | 32项通过、0失败、0忽略 |
| 独立正确性、安全/对抗及夹具审查 | 无未解决阻断问题 |

最终日志：`.artifacts/api-clippy-final.log`、`.artifacts/api-clippy-regression-final.log`、`.artifacts/api-clippy-cli-regression.log`。Spec Kit一致性覆盖FR-001–FR-004及SC-001–SC-003，无遗漏实施或验证项；阶段结构检查不替代上述运行结果。

不部署正式环境，不改BI正文，无需迁移、OpenAPI/CLI/Skill或本机安装包更新。历史复核中的Clippy失败由本次检查结果接续，不修改历史当时记录。
