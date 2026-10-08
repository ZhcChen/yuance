# 资料长正文与传输容量

资料正文不设固定字符数上限，HTML/plain创建更新共用保存路径。保留安全清洗、受控附件和章节标识，不截断SQL/正文。已有正文及版本快照使用SQLite TEXT，无长度CHECK，无需类型迁移或回填历史资料。实际存储仍受SQLite编译容量、运行内存及磁盘限制，不能称技术上无限。

## 当前源码容量

- 资料POST/PATCH完整UTF-8 JSON请求：16 MiB（16777216 bytes），含其他字段、标签与JSON转义。超限413，`error.code=payload_too_large`；不进入保存事务。其他API保持原有限额。
- 清洗/补章节属性后按正文JSON转义字节预检可重提交容量，在16 MiB中预留64 KiB给受限元数据。规范化结果过大同样413并回滚，不保存因系统扩容而无法正常重提交的正文。这是传输容量保护，不是固定字符数限制；用户新增内容仍须满足完整请求容量。
- 共享Web编辑器及API正文回读只校验类型，无固定字符限。Desktop资料通道请求同为16 MiB字节保护，资料回包128 MiB；其他Desktop操作保持原有保护。
- CLI正文文件/stdin无字符计数，JSON响应默认128 MiB（134217728 bytes）；`YUANCE_MAX_RESPONSE_BYTES`可设置正整数字节容量，0/非整数拒绝。超限报`response_too_large`，不输出不完整JSON。CLI进程内读取/序列化仍消耗内存。
- HTML清洗/章节补属性可能扩容，展示回包可能含正文双份；请求与响应不是相同容量。接近传输边界的正文重存须按回读后完整JSON字节计算。业务无字符上限不保证任意容量内容可传输或浏览器可流畅编辑。

## 写入与回读

维护AI使用现有 `resources create/update --body-file <PATH|-> --body-format html`，纯文本用plain。修改前读取body，保留合法章节标识；保存后GET核验安全内容、中文、SQL、代码块、尾部及章节引用完整。HTML安全清洗会规范标签/转义，不以未经清洗的HTML字节一致作为成功标准。413不自动截断/拆文，也不重试写入；回包失败先GET确认写入结果。

## 发布要求和现状

本次仅准备代码、OpenAPI、CLI/Skill和网关模板，不自动部署，不改BI项目P260713090179资料19。API镜像发布不会自动合并公网Nginx配置。需要按 `docs/runbooks/production-deployment.md` 发布匹配后端/前端，再按 `deploy/easy-deploy/production/gateway/README.md` 合并模板中仅Yuance资料路由的16m及JSON413配置，检查 `nginx -t` 后reload；不要覆盖其他域名或代理共享snippet。

2026-10-08只读检查已知正式Yuance server、引用snippet和nginx.conf未发现显式client_max_body_size；不能将仓库16MiB声明视为公网已生效。发布后应核验完整有效配置与公共请求链路，不能仅凭health/ready声称长正文上线。未来代理或SQLite编译配置变更须重新记录有效容量。

回滚旧代码会恢复字符限制，长资料可能重新无法维护；不要为回滚截断已有数据。
