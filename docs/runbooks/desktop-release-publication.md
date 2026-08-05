# 桌面端版本发布

本手册说明如何将 GitHub Release 中的 Electron 安装包发布到元策的系统版本管理，并由 Web 下载页提供下载入口。当前发行渠道为 `internal`，属于 `G-DIST-DEV` 开发制品，不是生产可信发行。

## 信任边界

- macOS 安装包只使用 ad-hoc 签名，不使用 Apple Developer ID、notarization、stapling、Keychain 或 Electron `safeStorage`。
- Windows 安装包不使用 Authenticode。
- Linux 不做 OS 级签名。
- 六个平台/架构安装包统一使用 minisign detached signature 校验项目来源与字节完整性。minisign 不是 Apple、Windows 或 Linux 的系统签名。
- macOS Gatekeeper 和 Windows SmartScreen 仍可能提示来源未知；不得把本渠道描述为“生产可信”或“已通过系统签名”。

生产 `G-DIST` 和自动更新 `G-UPDATE` 仍是独立的后续 Gate。

## 发布模型

1. 推送 `desktop-v<版本号>` 标签，例如 `desktop-v0.1.0`。
2. GitHub Actions 构建六个安装包：
   - macOS `x64` / `arm64`：`.dmg`
   - Windows `x64` / `arm64`：`.exe`
   - Linux `x64` / `arm64`：`.AppImage`
3. 汇总 job 校验六目标矩阵，生成 SHA-256、minisign、CycloneDX SBOM、provenance 和 `release-manifest.json`，然后创建 GitHub draft Release。
4. 发布 job 回读并验证完整证据集后公开 GitHub Release。
5. 在可信发布环境执行 `scripts/publish-desktop-release.mjs`，脚本必须在系统或 OSS 副作用前验证同一证据集。
6. 脚本通过 system OpenAPI 创建草稿、申请 OSS 直传地址、上传资产、确认上传并发布版本。
7. `/web/downloads` 自动展示最新含桌面安装包的已发布版本。

GitHub Release 与系统版本管理是两层独立发布：GitHub Token 只用于读取构建产物，system token 只用于写入元策版本管理。

## Manifest 与密钥

- manifest schema：`desktop/release/release-manifest.schema.json`
- minisign 公钥：`desktop/release/minisign.pub`（创建 protected Environment 与发布密钥时提交）
- minisign 版本：`0.12`
- Syft 版本：`v1.50.0`
- GitHub protected Environment：`desktop-internal-release`
- Environment secret：`YUANCE_MINISIGN_PRIVATE_KEY`

发布私钥不得提交到仓库、GitHub artifact、Release、日志或 runner cache，也不得在 CI 临时生成。build job 不得引用该 secret；只有受保护的 assemble/sign job 可读取。公钥文件必须来自同一持久私钥，并记录 16 位大写 key ID。工具二进制下载必须验证发布者 checksum，第三方 Action 必须固定审核后的 commit SHA。

密钥尚未配置或公钥缺失时，发行 Gate 必须保持阻塞，不能生成临时密钥绕过。

## 环境变量

| 变量 | 是否必填 | 说明 |
| --- | --- | --- |
| `YUANCE_DESKTOP_VERSION` | 是 | 不带 `v` 的 semver，例如 `0.1.0`。也可作为脚本第一个位置参数传入。 |
| `YUANCE_API_BASE_URL` | 正式发布必填 | 元策 API 根地址，例如 `https://yuance.quanxinfu.com`。 |
| `YUANCE_SYSTEM_API_TOKEN` | 正式发布必填 | 系统管理中创建的 system token，必须含 `system_release:read` 与 `system_release:write` scope。 |
| `YUANCE_GITHUB_REPOSITORY` | GitHub Release 来源时必填 | `owner/repository`，例如 `ZhcChen/yuance`。未设置时复用 `GITHUB_REPOSITORY`。 |
| `YUANCE_GITHUB_TOKEN` | 建议 | 读取私有 GitHub Release 的 token；也可使用 `GH_TOKEN` 或本机 `gh auth login`。 |
| `YUANCE_DESKTOP_RELEASE_TAG` | 否 | GitHub Release 标签，默认 `desktop-v$YUANCE_DESKTOP_VERSION`。 |
| `YUANCE_DESKTOP_ASSET_DIR` | 否 | 本地构建产物目录。设置后跳过 GitHub Release 下载。 |
| `YUANCE_RELEASE_TITLE` | 否 | 系统版本标题，默认 `元策桌面端 v<版本号>`。 |
| `YUANCE_RELEASE_NOTES` | 否 | 系统版本说明。 |
| `YUANCE_RELEASE_NOTES_FILE` | 否 | 版本说明文件路径，优先级高于 `YUANCE_RELEASE_NOTES`。 |
| `YUANCE_DRY_RUN` | 否 | 设为 `1` 时仅验证并列出六个安装包，不调用 system OpenAPI。 |

system token 请在 `/web/system/openapi` 创建，不要使用普通用户 API token，也不要把 token 写入仓库、构建日志或 GitHub Release 说明。

## 从 GitHub Release 发布

```bash
export YUANCE_DESKTOP_VERSION=0.1.0
export YUANCE_API_BASE_URL=https://yuance.quanxinfu.com
export YUANCE_SYSTEM_API_TOKEN='system-token-value'
export YUANCE_GITHUB_REPOSITORY=ZhcChen/yuance
export YUANCE_GITHUB_TOKEN='github-token-value'
export YUANCE_RELEASE_NOTES='首个 Electron 桌面端版本。'

node scripts/publish-desktop-release.mjs
```

脚本会下载 `desktop-v0.1.0` 对应 GitHub Release 的资产，并严格校验六个 `平台 + 架构` 组合。缺少包、包名不匹配、存在重复目标或版本号不一致时都会在写入系统版本前失败。

## 从本地构建目录发布

```bash
export YUANCE_DESKTOP_VERSION=0.1.0
export YUANCE_DESKTOP_ASSET_DIR="$PWD/desktop/dist"
export YUANCE_API_BASE_URL=https://yuance.quanxinfu.com
export YUANCE_SYSTEM_API_TOKEN='system-token-value'

node scripts/publish-desktop-release.mjs
```

先做无副作用校验：

```bash
YUANCE_DESKTOP_VERSION=0.1.0 \
YUANCE_DESKTOP_ASSET_DIR="$PWD/desktop/dist" \
YUANCE_DRY_RUN=1 \
node scripts/publish-desktop-release.mjs
```

## 重试与恢复

- 上传或发布中断后，脚本会保留系统中的草稿版本。
- 对于文件名、平台、架构、大小都一致且状态为 `uploaded` 的资产，重试会复用已有资产。
- 草稿中存在同目标但未完成或大小不匹配的资产时，脚本会停止，避免重复或错误发布；先在系统版本管理页清理该草稿资产再重试。
- 已发布版本不可由脚本覆盖。需要修正时发布新的版本号。

## 验收

发布完成后验证：

```bash
curl -fsS "$YUANCE_API_BASE_URL/api/healthz"
curl -fsSI "$YUANCE_API_BASE_URL/web/downloads"
```

然后打开 `/web/downloads`，确认 macOS、Windows、Linux 的 `x64` 与 `ARM64` 下载入口均指向对应安装包。
