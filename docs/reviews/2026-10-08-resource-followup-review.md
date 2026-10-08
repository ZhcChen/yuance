# 资料修复后续问题复核

日期：2026-10-08

## 附件删除回包

基线测试先返回400：旧请求缺少已要求的 `If-Match: resource.updated_at`。补齐后请求200，但回包仍为uploaded；删除事务使用了更新前查询的附件字段。

修复仅在删除事务提交成功后，将返回摘要状态设为deleted。摘要其余字段不受删除更新影响。保留事务内版本检查与正文引用检查，以及存储对象清理路径。测试覆盖缺少If-Match返回400、过期版本返回409、正文仍引用返回409且附件/对象存在，移除引用后回包与数据库均为deleted且对象已清理。

## CLI连接异常测试

本机代理将已关闭localhost端口的连接失败转换成HTTP502，导致原库客户端断言失败。清除代理后原测试通过，未发现产品错误分类缺陷。

仅将闭端口断言改为真实CLI子进程，移除六个大小写代理变量与个人响应容量变量，使用测试地址/Token；断言退出码23及stderr JSON中的connect/connect_failed。不在多线程测试中修改全局环境，不改变正常CLI代理行为。

## 验证与独立审查

- `cargo test -p yuance-api --test project_management_flow attachment -- --nocapture`：24/24通过。
- `cargo test -p yuance-api --test resource_contract`：4/4通过。
- CLI的api_client、command_flow、openapi_contract、skill_package：32/32通过，无跳过。
- `cargo clippy -p yuance-agent --all-targets -- -D warnings`：通过。
- correctness-reviewer独立只读审查：无阻断问题，引用和版本保护未退化，CLI环境隔离不修改产品行为。

API严格Clippy仍有既有跨模块告警，lib为51项、lib-test为53项，涉及too_many_arguments、collapsible_if、needless_borrow等；留作独立专项，不混入本次两项修复，也不宣称API严格Clippy通过。

无需数据库迁移、OpenAPI/Skill变更或CLI产品二进制更新。本次未部署正式环境，未修改BI手册。上一份长正文验收中记录的附件失败与CLI跳过，已由本次修复和上述验证闭环；其他既有告警仍有效。
