# Desktop 内部版本撤回与 N-1 回退

本文档用于 `internal` Desktop 版本的撤回、GitHub Release 处置和 N-1 回退演练。撤回目标是立即停止签发新的系统下载能力；撤回前已经签发的 URL 最长仍可能存活 5 分钟。

## 前置条件

- System token 具有 `system_release:read` 与 `system_release:write` scope。
- `gh` 已针对目标仓库认证，且操作者有编辑 GitHub Release 的权限。
- 已记录目标 `release_id`、`source_tag`、manifest SHA-256 和撤回原因。
- 已确认最近的 N-1 是 `internal + verified + published + 未撤回`，并保留完整 22 文件证据集。

## 撤回顺序

记录开始时间 `T0`，首先撤回系统版本。此步骤成功后 latest、公开下载入口、管理下载和 System OpenAPI 回读都不得再签发新 URL。

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $YUANCE_SYSTEM_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$YUANCE_API_BASE_URL/api/v1/system/releases/$RELEASE_ID/withdraw" \
  -d '{"reason":"<撤回原因>","github_withdrawal_status":"pending"}'
```

随后将同一 tag 的 GitHub Release 转为 draft，禁止删除或覆盖证据文件：

```bash
GH_TOKEN="$YUANCE_GITHUB_TOKEN" \
gh release edit "$SOURCE_TAG" --repo "$YUANCE_GITHUB_REPOSITORY" --draft
```

GitHub 操作成功后回写：

```bash
curl -fsS -X PATCH \
  -H "Authorization: Bearer $YUANCE_SYSTEM_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$YUANCE_API_BASE_URL/api/v1/system/releases/$RELEASE_ID/withdrawal" \
  -d '{"github_withdrawal_status":"succeeded"}'
```

GitHub 操作失败时必须回写 `failed`，保留系统版本的 withdrawn 状态并持续告警。

```bash
curl -fsS -X PATCH \
  -H "Authorization: Bearer $YUANCE_SYSTEM_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$YUANCE_API_BASE_URL/api/v1/system/releases/$RELEASE_ID/withdrawal" \
  -d '{"github_withdrawal_status":"failed"}'
```

## 验证与 SLO

1. 撤回响应成功后立即刷新 `/web/downloads`，目标版本不得再成为 latest。
2. 对目标版本重新请求公开下载、管理下载和 `/download-url`，必须返回拒绝或不存在。
3. 撤回前保存的 URL 可以在剩余 TTL 内继续工作；不得宣称即时撤销。
4. 在 `T0 + 5 分钟` 后再次请求旧 URL，必须失效。记录最后一次成功和第一次失败的时间。
5. 检查版本详情中的 `withdrawn_at`、`withdrawal_reason` 与 `github_withdrawal_status`。
6. 保存 curl 输出摘要、GitHub Release 状态、审计记录和时间线，不保存 token 或预签名 URL。

## N-1 回退

系统 retention 会同时保留全局配置数量内的版本，以及最近两个 verified、未撤回的 internal 版本。当前版本撤回后，latest 查询会自动选择最近的 N-1。

回退时必须复核：

- N-1 的 manifest SHA-256、signing key ID、source commit/tag 与原发布记录一致。
- 六安装包、六 minisign、六 SBOM、manifest/签名、`SHA256SUMS`/签名共 22 个对象仍可回读且 digest 一致。
- N-1 未处于 withdrawn 或 verification failed。
- 下载页只显示 N-1 的六个 installer，不把证据文件显示为安装包。

不得通过改写旧版本、覆盖同名对象或恢复 withdrawn 版本实现回退。

## 密钥泄漏

1. 立即停止新的签名和发布审批。
2. 按上述流程撤回受影响版本，并将 GitHub Release 转 draft。
3. 保存泄漏窗口、受影响 key ID、版本和审计证据。
4. 按密钥轮换契约提交新公钥并执行 canary；不得删除仍用于验证未受影响 N-1 的旧公钥。
5. 不得生成临时密钥绕过 protected Environment，也不得使用 macOS Keychain。
