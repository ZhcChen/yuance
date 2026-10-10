---
title: 阿里云 OSS 手工验证
type: runbook
status: active
date: 2026-06-30
---

# 阿里云 OSS 手工验证

本手册用于生产或预发布环境接入真实阿里云 OSS 后的人工验收。自动化测试默认只覆盖 `memory://yuance-tests`，真实 OSS 验证需要使用受控测试 Bucket 和最小权限 AccessKey。

## 前置条件

- 已完成数据库迁移。
- 已设置稳定的 `YUANCE_SECURITY_MASTER_KEY`。
- 当前登录用户具备：
  - `system.storage.manage`
  - `project.manage`
  - `work_item.manage`
- 阿里云 OSS Bucket 已创建，AccessKey 具备该 Bucket 的对象读写权限。
- 使用专门测试目录或空测试 Bucket，避免混入正式业务文件。
- 测试 Bucket 必须关闭对象版本控制；阿里云 OSS 在版本控制开启或暂停时不保证 `x-oss-forbid-overwrite` 防覆盖语义。
- 资料附件、评论附件和系统发行资产物理清理依赖 Bucket 关闭版本控制；开启版本控制时 `DeleteObject` 可能只创建删除标记，清理任务的 `completed` 只代表删除请求成功，不代表历史对象版本已物理清除。应用不会枚举或删除历史版本。
- Docker Compose 正式环境中已保持 `YUANCE_SECURITY_MASTER_KEY` 稳定；该值来自服务器 `.env`，不要重新生成覆盖。

## 配置验证

1. 访问 `/web/system/storage`。
2. 打开对象存储配置弹窗。
3. 填写：
   - Endpoint，默认 `https://oss-cn-hangzhou.aliyuncs.com`
   - Region，默认 `oss-cn-hangzhou`
   - Bucket，默认 `yuance-files`
   - AccessKey ID
   - AccessKey Secret
4. 点击保存并激活。
5. 在“桶状态”区域点击“检测桶状态”。
6. 如果提示“需要初始化”，点击“初始化桶”。
7. 再次点击“检测桶状态”。

期望结果：

- 页面显示配置已保存并处于可用状态。
- 配置版本列表新增一条版本记录。
- “桶状态”显示当前 Bucket 运行就绪。
- OSS Bucket 中能看到初始化标记对象 `yuance-system/.initialized`。
- 检测过程能完成临时对象写入、读取元数据和清理。
- 页面只展示 AccessKey ID hint，不展示完整 AccessKey ID 或 Secret。
- 服务日志和审计日志不包含 AccessKey Secret 明文。

注意：

- Endpoint、Region 和签名 TTL 默认值兼容参考项目 qfy-sc；Bucket 使用元策自己的 `yuance-files`，不沿用 `qfy-sc-private`。
- 点击“初始化桶”会按需创建私有 Bucket、补齐浏览器直传 CORS，并写入 `yuance-system/.initialized`。

## 项目附件直传验证

1. 访问一个 `not_started`、`in_progress` 或 `acceptance` 项目详情页。
2. 打开“上传项目附件”。
3. 选择一个小文件，例如 `oss-project-smoke.txt`。
4. 等待页面提示上传完成并刷新。
5. 在项目附件列表点击下载。

期望结果：

- 附件状态变为 `uploaded`。
- 下载链接能打开真实文件内容。
- OSS Bucket 中能看到对应 object key。
- 归档附件后，页面不再提供下载入口。
- 归档后请求下载签名应失败。

## 工作项附件直传验证

1. 在同一项目中新建或打开一个工作项。
2. 打开“上传附件”。
3. 选择 `oss-work-item-smoke.txt`。
4. 等待上传完成并刷新。
5. 下载附件。

期望结果同项目附件。

## 评论附件直传验证

1. 在工作项详情添加一条评论。
2. 对该评论上传 `oss-comment-smoke.txt`。
3. 等待上传完成。
4. 下载评论附件。

期望结果同项目附件。

## 权限和状态验证

- 将项目状态改为 `completed`、`on_hold`、`cancelled`、`archived` 任一禁止写入状态，确认项目详情页不展示：
  - 新建工作项
  - 添加成员
  - 调整成员角色
  - 上传项目附件
- 禁止写入状态的项目仍应保留“编辑项目”入口，用于按项目状态机恢复状态。
- 普通 viewer 成员不应看到上传、编辑、删除等写入口。

## 失败排查

- `OSS 配置无效`：优先确认 Endpoint、Bucket、AccessKey 权限和网络连通性。
- “需要初始化”：点击“初始化桶”，确认 `yuance-system/.initialized` 标记对象能写入。
- “无法写入临时探测对象”：确认 Bucket 已创建，AccessKey 具备 `PutObject` 权限。
- “无法读取探测对象元数据”：确认 AccessKey 具备 `GetObject` / 元数据读取权限。
- “清理探测对象失败”：确认 AccessKey 具备 `DeleteObject` 权限，并手工清理 `yuance-system/probes/` 下遗留对象。
- 上传后标记失败：确认对象实际存在、大小一致、Content-Type 一致。
- 下载失败：确认附件状态为 `uploaded`，且对象未被外部删除。
- 密钥解密失败：确认 `YUANCE_SECURITY_MASTER_KEY` 与保存配置时一致。

## PUT 防覆盖与资料附件回收

1. 上传一个专用测试附件，检查 `upload-url` 返回的所有签名 Header 中包含防覆盖条件。
2. 使用同一签名 PUT 写入后，再重放相同 PUT；第二次必须失败，OSS 中对象内容保持第一次上传的字节。
3. 分别使用专用测试资料附件、评论附件、评论草稿附件和草稿发行资产验证删除/取消/保留裁剪：确认 API/页面关系已移除或状态变为 deleted，但 OSS 对象暂时仍存在；上传 URL 到期后不能新发起 PUT；若 PUT 在 URL 到期前已开始，确认 OSS 允许其继续完成，并确认统一清理任务窗口覆盖该请求。项目附件只归档，不应创建物理删除任务。
4. 等待任务报告的安全窗口到期后先执行 `files cleanup-deleted --dry-run`，确认任务到期，再执行清理并检查原 Bucket 中对象已不存在且无历史版本残留。正常窗口至少 65 分钟；若上传签名在删除前刚发出，任务不早于该签名到期后 4 小时 5 分钟执行，以覆盖 OSS 对单次 PutObject 的最长请求时限及余量。参考 [预签名上传说明](https://help.aliyun.com/zh/oss/developer-reference/upload-an-object-using-a-signed-url-generated-with-oss-sdk-for-python-v2) 与 [PutObject 上传超时说明](https://help.aliyun.com/zh/oss/user-guide/0017-00000703)。
5. 配置切换到另一个 Bucket 后，重复验证任务仍清理原 Bucket 对象，不能因新 Bucket 中对象不存在而误报完成。

这些手工步骤应使用隔离的测试 Bucket 和专用测试资料，不使用真实业务附件。自动化测试只覆盖 memory 存储，不能证明阿里云 Bucket 版本控制配置或真实 OSS 的覆盖行为。

## 清理

验证结束后：

- 归档页面中的测试附件。
- 在 OSS 控制台确认测试 object 是否需要手工删除。
- 执行 pending dry-run，确认没有异常遗留：

```bash
cargo run -p yuance-api -- files cleanup-pending --older-than-hours 24 --dry-run
```

pending 清理也会等待最后一张上传 URL 到期后 4 小时 5 分钟；此窗口用于覆盖 URL 到期时仍在进行的 PUT，防止上传完成后无法登记。正式环境 Compose 部署使用：

```bash
cd /srv/yuance/easy-deploy/production/backend
docker compose --env-file .env -f compose.yaml exec -T api ./yuance-api files cleanup-pending --older-than-hours 24 --dry-run
```

项目附件归档仍是数据库软删除，不会主动删除 OSS 对象；资料附件、评论附件和系统发行资产删除会登记延迟清理任务，由 `files cleanup-deleted` 重试清理。历史已删除附件不会因迁移自动补建物理清理任务。
