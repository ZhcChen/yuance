---
title: Web/API 正式环境部署复核（docx 预览引擎升级与悬挂编号兼容补丁）
type: review
status: completed
date: 2026-08-12
---

# Web/API 正式环境部署复核（docx 预览引擎升级与悬挂编号兼容补丁）

## 结论

通过。docx 预览已升级到 `@silurus/ooxml` 0.78.0，并携带悬挂编号负数
`bodyOffsetPt` 本地补丁发布到正式环境；公网健康检查、迁移、seed、文件对象审计
均正常，线上静态资产已确认包含补丁标记。

## 部署内容

- 发布源：正式 WSL `/srv/yuance/release-source`，HEAD = `77229ed`。
- 发布方式：本地生成离线 bundle `/tmp/yuance-production-77229ed.bundle`，scp 到
  WSL 后切换 origin 引用并 ff-only 同步（`e21f774..77229ed`），随后执行
  `./scripts/deploy-production.sh`。
- 相对上次发布 `e21f774` 的内容：升级 `@silurus/ooxml` 0.73.2 -> 0.78.0，兼容
  新版错误提示；对 vendored 0.78.0 增加悬挂编号负数 `bodyOffsetPt` 钳制补丁
  （主线程与 worker host 两处）；记录 `PATCHES.md`、solution 与引擎对比复核文档。

## 发布结果

- 镜像：`yuance-api:latest`，镜像 ID
  `sha256:fdf97fe3e94daefe02b35afc376c78ee1686ed713318c5358a46f36aa7bf9d9`。
- 容器：`yuance-api` running/healthy，与最新镜像一致。
- 迁移：`migrate status` = applied 30/total 30；`migrate up`、`seed core` 幂等
  执行成功。
- 文件对象审计：total=64 attached=64 orphan=0。
- 回滚保护：
  - `/srv/yuance/releases/yuance-api-linux-amd64.before-20260812152609.tar`
  - SQLite 备份 `/srv/yuance/backend/backups/20260812072609`

## 正式环境验证

- `https://yuance.quanxinfu.com/api/healthz`：200，status ok，version 0.1.0。
- `https://yuance.quanxinfu.com/api/readyz`：200，status ready，
  environment production，SQLite connected。
- `/web`：303 跳转登录页。
- 正式静态资产：
  - `/static/vendor/ooxml/document-pull-client-xsdVDuVD.js` 已包含
    `Number.isFinite(d) && d >= 0` 钳制逻辑。
  - `/static/vendor/ooxml/render-worker-host-CBjWHxMb.js` 已包含
    `Number.isFinite(d)&&d>=0?d:0` 钳制逻辑。
- 本地全页渲染复核（发布前）：`平安银行银企直连接口（通用）.docx` 40 页、
  `平安银行银企直连_单位移动支付_接口（通用）-20251027.docx` 39 页全部渲染成功，
  不再报 `numbering.bodyOffsetPt must be finite and non-negative`。

## 验收步骤

1. 登录 `https://yuance.quanxinfu.com` 后打开资料库中
   《平安银行银企直连接口（通用）.docx》，确认不再报错且可渲染全部页面。
2. 打开《平安银行银企直连_单位移动支付_接口（通用）-20251027.docx》，确认同样
   可完整渲染。
3. 抽查普通 docx/pptx 预览，确认升级与补丁无回归。

## 后续

- `Paragraph source boundaries must align with retained lines` 仍待触发文件；
  若触发且当前补丁无法覆盖，再按对比复核结论做 `docx-editor` 只读模式 POC。
- 升级上游 `@silurus/ooxml` 后需重新评估本地补丁是否仍需要。
