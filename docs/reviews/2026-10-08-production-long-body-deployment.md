# 正式发布：资料长正文及后续修复

2026-10-08用户明确授权“部署正式环境”。本次部署成功，未修改BI项目P260713090179资料19，也未写入任何正式业务验收资料。

## 发布制品

- 应用源码：`6b966ea5cb54d995b032b6b18a1d5e9a539aef9c`，部署时main与origin/main一致、工作区干净。
- 入口：`YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_BUILD_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2 ./scripts/deploy-production.sh`。
- 构建在qfy-test2专用build目录执行，正式backend目录不编译；前端检查、Desktop renderer检查和linux/amd64镜像构建成功。
- 发布tar SHA256：`79c32cd7f34cd02e523a8874868680880dacf35c706582612cfb4f64b4d1591c`，复制前后核对一致。
- 运行镜像与latest一致：`sha256:e26cf78600265ad191ba61d0ef7273e12b8cbfbdf6ff52b4244bb6f644e9a4a6`。镜像未提供源码标签，源码归属通过部署脚本的git archive、固定commit构建目录及制品校验链确认。
- 旧镜像备份：qfy-test2 `/srv/yuance/releases/yuance-api-linux-amd64.before-20261008171858.tar`。
- SQLite发布前备份：qfy-test2 `/srv/yuance/backend/backups/20261008091902`，主库/WAL/SHM共3个文件。迁移检查及up、seed core成功，未执行demo/local-admin seed。

## 网关

仅向qfy-sc-test `/etc/nginx/conf.d/qfy-443-frp-web.conf` 的Yuance server插入资料正则location及命名JSON413处理；保留TLS、其他域名、共享snippet和502/503/504维护页映射。

- 修改前SHA256：`a53336f3cec442f3aada9e31c1443a6005a15515226ca93825ba7fc1574e8a77`，应用前再次校验，防止覆盖并发修改。
- 修改后SHA256：`0770866febf3ac729768e927ef0c271c2bb7ca153f8a7f179696e27b1074bbef`。
- 备份：`/etc/nginx/conf.d/qfy-443-frp-web.conf.before-yuance-20261008171944.bak`。
- `nginx -t`及`systemctl reload nginx`成功，备份不匹配配置加载的`*.conf`。

## 发布后验证

- yuance-api容器running/healthy，内网与公网health/ready成功；公网Web及auth.css返回200，未误返回维护页。
- SQLite `PRAGMA integrity_check`：`ok`。
- 文件对象审计：total=151、attached=151、orphan/pending_orphan/uploaded_orphan/deleted_orphan均0。
- 公网无凭证POST/PATCH，使用不存在项目路径：完整JSON 3,145,786字节均返回401，确认通过旧默认网关容量并到达应用鉴权；17,825,850字节均返回413、`error.code=payload_too_large`及16MiB明确说明，不产生业务写入。
- 首次Node fetch探测17MiB请求遇到HTTP/2流关闭（NGHTTP2_ENHANCE_YOUR_CALM）；改用HTTP/1.1重新执行完整探测全部通过。已验证HTTP/1.1标准JSON413，未将HTTP/2提前关闭当成业务接口失败或宣称其完整响应已验证。

正式环境未执行带凭证长正文创建/修改、Web编辑器或章节点击验收；对应已完成本机真实测试见 `docs/reviews/2026-10-08-resource-long-body-review.md`。本次发布验证不替代上述业务验证，也不声称技术上无限：资料完整UTF-8 JSON传输容量为16MiB，正文无固定字符数上限。

## 记录与回滚

本机执行日志：`.artifacts/production-deploy-2026-10-08.log`、`.artifacts/production-capacity-2026-10-08.log`；容量探测脚本：`.artifacts/verify-production-length.mjs`。这些是忽略的运行制品，本记录保存关键结果。

回滚按 `docs/runbooks/production-deployment.md` 加载旧tar并重建api；数据库回滚须停服务后成组恢复备份。网关可恢复上述备份，先`nginx -t`再reload。回滚旧应用会恢复字符限制，禁止为回滚截断现有长正文。发布记录提交与运行源码commit分别记录，不要求为文档提交重建镜像。
