---
title: 工作项主帖指针迁移期间兼容历史正文关联
date: 2026-09-12
module: 工作项与资料库关联
problem_type: logic_error
component: api_layer
symptoms:
  - "历史工作项已有正文和评论，但资料库链接状态返回不可管理"
  - "直接创建资料库关联时提示工作项没有可链接的主发布内容"
root_cause: data_integrity
resolution_type: code_fix
severity: medium
tags: [work-item, primary-post, resource-library, legacy-data]
---

# 工作项主帖指针迁移期间兼容历史正文关联

## Problem

主发布内容模型从 `work_items.description` 逐步迁移到 `work_item_comments` 后，历史工作项可能同时拥有正文和普通评论，但没有 `primary_post_comment_id`。只按评论主帖判断时，这些工作项无法链接到资料库。

## Symptoms

- 工作项详情不显示“链接到资料库”。
- 链接接口拒绝历史工作项，即使正文非空且工作项未删除。
- 已建立的历史关联在资料库列表中因找不到评论主帖而被丢弃。

## What Didn't Work

- 只放宽前端显示条件：服务端状态接口和写入接口仍会拒绝，且资料库列表仍没有摘要来源。
- 只从普通评论中猜测主帖：历史评论可能是 plain 格式，且不一定与旧正文摘要相同，不能可靠回填指针。

## Solution

保留规范数据的评论主帖优先级，并增加明确的历史兼容分支：

```text
存在可见 primary_post_comment_id -> 使用评论主帖
没有主帖指针且 description 非空 -> 使用当前 description，不创建评论、不回填指针
显式主帖指针失效或 description 为空 -> 拒绝链接/隐藏无效关联
```

关联列表对历史正文即时生成摘要，富文本正文先按既有清洗规则转成纯文本；链接表仍只保存项目、工作项和审计字段，不保存正文、摘要或附件。

## Why This Works

兼容逻辑以“没有主帖指针 + 正文非空”为边界，不会覆盖显式主帖的草稿/删除校验，也不会把历史正文复制成重复评论。规范主帖追加普通评论时，原有 `primary_post_comment_id` 不变，仍走原始路径。

## Prevention

- 主帖模型迁移期间，读取、状态、写入和列表接口必须共同定义旧数据回退规则。
- 为“规范主帖追加评论”和“历史正文 + 普通评论”分别保留 API 回归测试。
- 完成历史主帖回填后，再评估删除兼容分支和关联列表的低频回退查询。

## Related Issues

- [工作项历史正文关联资料库兼容修复复核](../reviews/2026-09-12-work-item-post-resource-library-legacy-link-review.md)
- [工作项主发布内容关联资料库计划](../plans/2026-09-11-1701-feat-link-work-item-posts-to-resource-library-plan.md)
