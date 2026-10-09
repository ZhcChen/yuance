# 资料正文受控 SVG 展示方案

规格：`specs/005-resource-inline-svg/spec.md`。当前main实施，不创建分支。

## 证据和决策

共享RichTextContent只识别附件容器的后代媒体，裸img自身ID未识别。Web files平台无Desktop attachments能力，资料详情因此不注入resolver；标准figure也直接请求download。Web download对SVG返回安全下载响应而非inline图片，这是现有安全边界，不扩大其白名单。

复用已有资料preview API、Web previewSourceResolver及密文校验/解密，得到正确MIME的Blob，以img展示。Desktop继续优先走既有能力。兼容裸img/video自身ID，仍推荐编辑器标准figure格式。不会更改正文保存协议、数据库、API、CLI命令或HTML安全白名单。

## 文件与实施顺序

1. `frontend/packages/ui/src/rich-text.jsx`：两处媒体查找统一覆盖容器后代及自身ID；在DOM挂载前移除受控媒体原始src，避免先发download。
2. `frontend/packages/app-shell/src/app.jsx`：资料inline resolver加入Web分支，检查启用且为媒体预览，再调用注入的previewSourceResolver，返回release；详情页始终提供resolver。
3. `web/e2e/resource-inline-svg.spec.mjs`：真实登录本机页面，覆盖标准/裸图片、客户端解密协议、历史明文、失败及Blob释放，确保无download请求。
4. `skills/yuance-agent/SKILL.md`、`references/workflows.md`、`references/commands.md`以及OpenAPI/安装Runbook：维护AI的准确HTML，说明download是持久化占位地址，不自行拼preview URL/密钥；同步本机已安装说明。

## 生命周期与安全

RichMediaImage已处理异步卸载后的release和组件清理；Web release仅撤销本次创建的blob源，Desktop仍释放capability。预览API仍负责权限/附件归属，浏览器不从正文任意URL获取内容。禁用/错误预览抛错显示既有失败状态，不降级到download。SVG继续作为img图像执行，不使用innerHTML/object/iframe。

## 验证

先新增可复现的本机浏览器测试再修复；执行共享UI/Web检查、既有加密协议测试、资料章节E2E及新增SVG测试，做独立正确性与安全复核。正式页面验收需获得Web登录态和正式发布授权；目前仅只读查询正式资料，未更改内容。验收记录保存实际网络状态、MIME、自然尺寸、控制台与发布范围。

## 规范与宪章核对

复用既有预览与加密契约、无数据库变更、不扩大安全清洗、保留正式资料、显式规格目录、独立审查和真实测试，符合项目宪章。无额外数据模型或辅助研究文档需求。

## 运行与恢复

正式发布仍按production Runbook且需要授权；CLI仅说明更新，不需新二进制版本。代码回滚恢复旧渲染行为，不回滚或改动正式正文。
