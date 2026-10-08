# 资料长正文实施方案

- 规格：`spec.md`
- 状态：方案完成

## 技术上下文

Web、PAT 共用资源领域保存。HTML 输入限50000、plain限20000，清洗后自动补 UUID 扩容，导致回读无法重存。共享客户端正文回读限128Ki字符，Desktop资料请求/回读也有字符限制。SQLite主表和版本快照均为TEXT且无正文长度CHECK，复用既有迁移不新增DDL。Axum默认JSON请求2MiB，CLI响应8MiB；代理模板未声明请求容量。

## 规范与约束核对

遵循 AGENTS.md、local-development.md、既有安全及章节协议。正文仅移除字符检查，保留trim、非空、受控附件、清洗和权限。传输保护按完整UTF-8 JSON字节计算，不能等同于正文字符限制；不全局关闭限制。生产只读检查配置，不部署、不修改BI资料。

## 实现方案与文件范围

在api/src/domains/project_resources.rs移除正文字符限制。资料POST/PATCH在router配置16MiB完整JSON传输限制，提取失败413返回payload_too_large信封，其他JSON拒绝保留HTTP语义；无关端点不放宽。共享API正文解析只校验类型。Desktop仅资料请求改为16MiB字节保护、正文回读只校验类型、资料响应保留128MiB字节保护；其他操作容量不变。CLI JSON响应默认128MiB并允许环境配置，清晰拒绝超限。响应可能含body/body_html双份以及清洗扩容，因此不能简单将响应容量等同于请求容量。

更新OpenAPI正文说明及413、Skill长正文和回读验证写法；CLI继续body-file/stdin透传。代理模板仅Yuance资料路由采用16m并返回JSON413；Runbook说明上线需同步合并Nginx配置，自动API部署不代表网关已更新。用只读配置证据说明现状。长文本理论容量受SQLite编译参数、HTTP、内存及客户端共同约束，不承诺无穷。

## 阶段与依赖

先后端/共享客户端和传输，再Desktop/CLI与契约，最后真实端到端和独立review。清洗后按规范正文JSON转义字节预检16MiB容量，预留64KiB给受限元数据；补属性扩容超限也必须413并回滚，不能保存无法正常回提交的正文。读密集调查/review委派；主线程串行写入避免共享工作区冲突。

## 验证与验收

后端领域与router集成测试覆盖plain/HTML大于旧限、低于旧限清洗补属性后超限、完整UTF8保存/版本快照、16MiB超限不写入、旧2MiB以上成功。共享API/ Desktop/CLI测试覆盖隐藏限制与字节保护。make dev-*启动独立本机服务，无头Playwright复用真实PAT及Web编辑器，CLI通过进程使用临时PAT进行创建/读取/更新，回读核验安全正文、代码块和章节稳定。回归章节点击及左侧目录，执行前端类型/lint和Rust聚焦检查。最终独立审查并记录docs/reviews/证据。

## 运行与恢复

部署未授权。代码、OpenAPI、CLI及Skill需后续发布；网关容量模板需显式部署合并与nginx -t/reload，不得覆盖其他域名。SQLite无迁移，不重写旧资料。回滚代码恢复旧限制，可能重新导致长资料不可编辑，必须在回滚说明中提示。
