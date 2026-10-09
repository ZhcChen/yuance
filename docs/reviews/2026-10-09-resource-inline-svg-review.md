# 资料正文 SVG 展示复核

状态：本机修复与验收通过，已正式发布，目标页面登录验收待完成。
规格：`specs/005-resource-inline-svg/`。

## 对象与根因

用户反馈项目P260713139801资料30附件189、193、194、192无法显示。已通过yuance-agent CLI只读确认四附件为uploaded、image/svg+xml，正文引用为img自身携带附件ID。未修改正式资料或附件；交付前回读仍为2301字符、updated_at `2026-10-09 02:40:20`、引用ID `[189,193,194,192]`。

独立源码核验发现两个缺口：

1. `frontend/packages/ui/src/rich-text.jsx` 原媒体选择器只命中附件容器后代，不命中img自身携带ID。
2. `frontend/packages/app-shell/src/app.jsx` 只为Desktop能力注入资料inline resolver；Web files没有该能力，因此标准figure也直接使用download，未接入已存在的Web受控预览与解密。

依据 `api/src/web/user/mod.rs` 下载分支，加密SVG先解密再返回安全下载响应，图片inline白名单不含SVG，因此应为application/octet-stream、attachment、nosniff。该结论来自源码，未以正式登录HTTP响应冒充验证。API preview/content已有SVG MIME、inline、no-store、nosniff与sandbox；Web应通过受控preview元数据、client_decrypt协议、密文校验、解密和Blob展示，不应直接扩大SVG下载白名单。

## 改动与兼容

- Web正文始终注入resolver，复用现有preview API与previewSourceResolver，检查content_enabled及image/video类型；失败使用已有图片错误状态，不回退download。
- Desktop继续优先使用原preview capability；Web Blob返回release并由既有异步/卸载流程撤销。
- 两处媒体选择器兼容裸img/video。裸img替换为React图片容器时保留附件ID/kind，确保点击预览仍可定位。
- HTML清洗、附件权限/归属、SVG安全校验、API/数据库/CLI命令不变；不新增inline SVG/object/iframe/data媒体能力。
- 标准新引用仍使用figure ID/kind=image/align，img src为当前资料download保存引用。完整HTML、CLI用法和显示验收已更新Skill及API/安装Runbook；不保存临时Blob、签名URL或密钥。

## 验证证据

- 用字段完整的最终夹具、临时反向应用仅本轮渲染修复，在旧源码运行明文SVG用例：自然宽度0，失败可复现；之后恢复全部修复。早期夹具缺summary/preview metadata导致的失败不作为产品失败证据。
- `npm --prefix web run test:e2e -- resource-inline-svg.spec.mjs resource-chapter-links.spec.mjs --workers=1`：7/7，无失败/跳过。包括历史明文、加密SVG、容器与裸img、点击预览、403不回退、损坏密文摘要、延迟加载离页释放、既有章节保存/编辑/目录点击。
- 真实CLI用例仅允许127.0.0.1，在专用test数据库启用memory存储；四个附件实际登记、签名、加密上传、complete，CLI保存/回读/原样重存HTML及受控下载解密一致。登录详情页四图自然尺寸320×160，Blob MIME为image/svg+xml；四个client_decrypt预览内容请求均200/application/json，无原始download请求、无控制台/pageerror。保存的截图由Playwright报告提供。
- 本机测试资料/附件/Token清理请求均核对2xx，临时文件删除。test memory配置保留在专用测试数据库；启动脚本下次重置，不宣称恢复先前存储配置。
- `npm --prefix frontend run check:packages`：通过；60+76+10+8+93共247项测试全过，相关类型与lint通过。
- `npm --prefix web run check`：通过，62项全过；`npm --prefix desktop run check:renderer`：通过并构建成功。
- `cargo test -p yuance-agent --test skill_package`：5/5；skill-creator quick_validate通过（使用uv隔离PyYAML，不改项目依赖）。
- 本机安装Skill的SKILL/commands/workflows与源码cmp一致，doctor --installation显示CLI 0.1.4。CLI逻辑未改，无需新参数/二进制；对外发布包尚未更新。

运行日志：`.artifacts/svg-e2e-baseline-valid.log`、`.artifacts/svg-e2e-final-acceptance.log`、`.artifacts/svg-frontend-check.log`、`.artifacts/svg-web-final-check.log`、`.artifacts/svg-desktop-check.log`。运行制品忽略入库，本记录保留关键事实。

## 独立审查与剩余验收

独立correctness/security复核无阻断项；建议的裸img点击、pending离页、checksum失败及清理HTTP状态已补测。仍沿用整文件预览的内存和超时保护，本次不改变传输容量。

正式浏览器隔离chrome-devtools访问目标地址重定向登录页；未取得正式Web凭证，PAT不能作为Web cookie使用。按用户提到的agent-browser查询可用会话，相关newlink-docs会话get url未响应，停止客户端命令；未连接日常Chrome、未读取其他账号凭证、未关闭其他任务的浏览器。正式页面四图、响应头及控制台尚未验收。

修复已按用户授权正式发布，仍需在授权登录态下打开同一正式资料验收。无需重写原正文或重建附件：修复兼容现有四个裸img。只有实际四图显示、网络及控制台通过后，才能完成T007；本机结果不能替代该项。

## 正式发布记录

2026-10-09，用户明确授权后，通过 `YUANCE_DEPLOY_MODE=remote YUANCE_DEPLOY_BUILD_MODE=remote YUANCE_DEPLOY_HOST=qfy-test2 ./scripts/deploy-production.sh` 发布修复提交586deff。构建在qfy-test2进行，未在正式服务器编译；日志为 `.artifacts/production-svg-deploy-2026-10-09.log`。

- 制品tar SHA256：`fd6c1b6fc56ebbe130ca7897ba0d4a55bced494d9a1205c21d2053aa277b4eb3`；运行镜像：`sha256:299bffbdefe132feeff0284de9f6966b0b9886485563971e7b21bedb47d206bf`，容器running/healthy。
- 旧制品备份：`qfy-test2:/srv/yuance/releases/yuance-api-linux-amd64.before-20261009111153.tar`；SQLite备份：`/srv/yuance/backend/backups/20261009031157`，包含主库、WAL和SHM。
- migrate status/up、seed core、重建与内网健康检查通过；SQLite integrity_check为ok。附件审计total=161、attached=161，全部orphan类别为0。
- 独立公网只读核验发布版本20261009111117。`/web/app/assets/index-CYRcq22q.js` 返回200/application/javascript、784830字节，SHA256为 `ecfbff90a39b9b2a51bf067e03957b64201be5ab7f3a38ac83aea99c4a731845`，与本机Web构建逐字节一致，包含本轮两处修复。
- 公网healthz/readyz均200，SQLite connected、production；Web和auth.css均200，无维护页。传输保护回归：无凭证约3MiB资料POST/PATCH返回401，约17MiB返回标准JSON 413/payload_too_large，原16MiB网关限制仍生效。本轮未修改Nginx。日志为 `.artifacts/production-svg-public-health-2026-10-09.log`。
- 发布后CLI回读目标正文2306字符、updated_at仍为 `2026-10-09 02:40:20`，四个引用ID仍为189、193、194、192。本轮未执行业务写操作；与此前2301字符读数存在差异，未验证正文逐字节一致，因此不作该断言。

目标页面无Web登录态仍303跳转登录页，候选agent-browser会话20秒内未响应。公网健康和静态制品核验不等于正式四图展示验收，T007继续保持未完成。本次仅补充发布记录，不需重新构建部署。
