# 资料长正文修复复核与验收

日期：2026-10-08
规格：`specs/003-resource-long-body/`
容量与发布要求：`docs/runbooks/resource-long-body.md`

## 结果与审查

资料HTML的50000、plain的20000字符校验及共享API/Desktop的正文字符限制已移除。Web/PAT共用创建更新路径，保留标题/标签/密码校验、权限、附件控制、HTML安全清洗及稳定章节协议。

资料POST/PATCH完整UTF-8 JSON容量16MiB，超限JSON413/payload_too_large；其他API不放宽。清洗补章节属性后按正文JSON转义字节预检，在16MiB中预留64KiB给受限元数据，扩容超限回滚。正常保存的规范正文不会因系统补属性无法回提交；用户新增内容仍须符合传输容量。

SQLite主表/版本表均已为TEXT且无长度CHECK，不新增迁移。当前保存流程不写版本表；测试独立插入读取该字段，仅证明既有字段容量，不声称新增版本功能。Desktop资料请求16MiB、资料回包128MiB，其余操作保护不变。CLI正文继续文件/stdin透传，JSON响应默认128MiB，可配置YUANCE_MAX_RESPONSE_BYTES，不输出不完整JSON。

独立安全/API审查发现并复核修复：清洗扩容需在保存前拒绝；Nginx新413映射需显式保留502/503/504维护页，避免error_page继承回归。最终无未解决阻断问题，OpenAPI/Skill准确说明规范化容量拒绝。

## 验证

| 验证 | 结果 |
| --- | --- |
| `cargo test -p yuance-api --lib resource_` | 9/9，含JSON近边界、中文、转义、章节与安全回归 |
| `cargo test -p yuance-api --test resource_contract` | 4/4 |
| project_management_flow资料测试 | 9项通过，既有附件删除失败另行记录；排除该项重跑9/9通过 |
| 新长正文router/SQLite测试 | HTML/plain完整保存回读重存，仅改标题PATCH可用，独立版本字段往返；原请求超限及补属性超限均413且不写入 |
| `npm --prefix frontend run check` | 边界、类型、lint、共享包及根测试通过 |
| `npm --prefix web run check` | 类型/lint、62/62通过 |
| Desktop operation/renderer transport/rest transport | 56/56，长文、类型、UTF-8超限及其他操作容量回归 |
| Desktop check:network / check:renderer | 通过，含renderer构建 |
| CLI api_client/command_flow/openapi_contract/skill_package | 31项通过，既有timeout/disconnect分类1项跳过 |
| CLI严格Clippy | 通过 |
| Playwright long-body / detail-toc-resize | 4/4，真实本机API、PAT、Web编辑器及CLI进程 |
| scripts/test-resource-long-body-gateway.cjs | 经local-docker隔离容器；派生正式模板nginx -t、POST/PATCH JSON413、维护页回归通过 |

Playwright输入49363字符→回读57063字符，原样PATCH后全文一致。长HTML输入235597字符，含中文、长SQL、60代码块、62章节标识、61引用：PAT创建读取→Web修改保存→PAT修改→CLI修改/GET全部成功。2700条SQL、尾部中文、代码块及章节引用均完整；正文和左侧目录实际点击到同一目标。

CLI纯文本4620006字符/5180018字节，创建→GET→修改→OpenAPI回读全文相等，请求超过旧应用2MiB，回包含正文双份超过旧CLI8MiB。CLI默认容量另用超过8MiB JSON实测，保留自定义小容量拒绝及0容量配置错误验证。

安全清洗增加rel等属性；初次E2E误要求未经清洗HTML字节相等，修正测试预期后核验完整安全正文，未放宽清洗。报告与截图在`.artifacts/playwright-report/`。临时PAT已删除，测试资料通过API归档，本机服务测试后停止；未操作生产BI手册。

## 已有失败及边界

- 附件删除测试在隔离基线809fa15同样HTTP400，旧fixture未传If-Match。临时补头后又暴露旧回包仍为删除前状态，而数据库已deleted；这项无关fixture调整已撤回，本次不改附件删除代码，报告既有失败。
- API全目标严格Clippy被现有too_many_arguments、collapsible_if、needless_borrow等告警阻断；未清理无关API告警。CLI严格Clippy通过。
- CLI既有classifies_timeout_disconnect_and_invalid_json此前在本机断开连接分类失败，本次明确跳过，不计入通过数。
- Nginx本机fixture移除TLS证书引用，未验证正式证书、FRP及生产容量生效。正式已知配置只读检查未发现显式资料容量，源码不能代表公网已生效。

## 收敛与发布

FR-001–FR-006、SC-001–SC-003均有实现/验证映射，Spec Kit一致性和收敛无新增实施缺口。独立review与真实验证不由结构检查替代。

OpenAPI、CLI和仓库Skill已同步，CLI需新二进制以获得响应容量配置，无需新正文参数。正式API/前端、网关及对外CLI/Skill Release未发布，未执行正式部署。后续须同步API镜像与Nginx资料路由及413映射，再验收公网链路；不得为验证修改BI正文。
