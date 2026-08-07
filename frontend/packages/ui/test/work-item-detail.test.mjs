import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkItemDetail } from '@yuance/frontend-ui';

const item = {
  key: 'YCE-TASK-2',
  item_type: 'task',
  title: '共享前端',
  description: '提取共享 UI',
  status: 'in_progress',
  priority: 'P1',
  project_key: 'YCE',
  project_name: '元策',
  parent_item_key: 'YCE-REQ-1',
  parent_title: '前端架构',
  assignee_username: 'alice',
  assignee: 'Alice',
  reporter: 'Bob',
  due_date: '2026-08-10',
  created_at: '2026-08-01',
  updated_at: '2026-08-01',
  deleted_at: '',
};

function renderDetail(overrides = {}) {
  return renderToStaticMarkup(createElement(WorkItemDetail, {
    item,
    primaryPost: null,
    primaryPostAttachments: [],
    editForm: { title: item.title, description: item.description, status: item.status, priority: item.priority, assigneeUsername: 'alice', dueDate: item.due_date, parentItemKey: item.parent_item_key },
    handoffForm: { status: 'pending_confirmation', assigneeUsername: 'bob', body: '请确认' },
    statusOptions: [{ value: 'in_progress', label: '处理中' }, { value: 'pending_confirmation', label: '待确认' }],
    assigneeOptions: [{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }],
    parentOptions: [{ key: 'YCE-REQ-1', title: '前端架构' }],
    priorityOptions: ['P0', 'P1'],
    statusLabel: (status) => status === 'in_progress' ? '处理中' : '待确认',
    mutationBusy: false,
    editSubmitting: false,
    handoffSubmitting: false,
    error: '',
    canManageWorkItems: true,
    canEditPrimaryPost: true,
    canCloseWorkItem: true,
    canReopenWorkItem: false,
    canRestoreWorkItem: false,
    cycleLabel: 'Sprint 1',
    navigation: { previous: { item_key: 'YCE-TASK-1', title: '前一任务' }, next: { item_key: 'YCE-TASK-3', title: '后一任务' } },
    flowHistory: { items: [{ source_kind: 'flow', actor: 'Alice', created_at: '2026-08-01', summary: '状态：待处理 → 进行中' }], pagination: { total_items: 1 } },
    buildDetailHref: (itemKey) => `/web/app/work-items/${itemKey}`,
    onOpenDetail: () => {},
    parentHref: '/web/app/work-items/YCE-REQ-1',
    onOpenParent: () => {},
    onChangeEdit: () => {},
    onChangeDescription: () => {},
    onChangeHandoff: () => {},
    onSubmitEdit: () => {},
    onSubmitHandoff: () => {},
    onRequestLifecycleAction: () => {},
    onRequestDeletePrimaryPostAttachment: () => {},
    ...overrides,
  }));
}

test('work item detail renders metadata and both mutation forms', () => {
  const html = renderDetail();

  assert.match(html, /提取共享 UI/);
  assert.match(html, /处理中/);
  assert.match(html, /YCE-REQ-1/);
  assert.match(html, /编辑工作项/);
  assert.match(html, /推进并指派/);
  assert.match(html, /父级需求/);
  assert.match(html, /Sprint 1/);
  assert.match(html, /上一项 · 前一任务/);
  assert.match(html, /状态：待处理 → 进行中/);
  assert.match(html, /关闭工作项/);
  assert.match(html, /yc-rich-text-content/);
  assert.match(html, /aria-label="主内容"/);
});

test('work item detail prefers the canonical HTML primary post over the legacy summary', () => {
  const primaryBody = '<h2>共享主帖</h2><p>富文本正文</p><a data-yuance-attachment-id="7">附件</a>';
  const html = renderDetail({
    primaryPost: { id: 91, body: primaryBody, body_format: 'html' },
    editForm: { title: item.title, description: primaryBody, status: item.status, priority: item.priority, assigneeUsername: 'alice', dueDate: item.due_date, parentItemKey: item.parent_item_key },
    primaryPostAttachments: [{ id: 7, filename: 'primary.txt', contentType: 'text/plain', url: '/web/work-items/YCE-TASK-2/comments/91/attachments/7/download' }],
  });

  assert.match(html, /yc-rich-text-content/);
  assert.doesNotMatch(html, />提取共享 UI</);
  assert.match(html, /primary\.txt[\s\S]*移除引用/);
});

test('work item detail keeps handoff available while hiding author-only primary post editing', () => {
  const html = renderDetail({ canEditPrimaryPost: false });

  assert.doesNotMatch(html, /编辑工作项/);
  assert.match(html, /推进并指派/);
  assert.doesNotMatch(html, /aria-label="主内容"/);
});

test('work item detail hides mutations for read-only users', () => {
  const html = renderDetail({ canManageWorkItems: false, canEditPrimaryPost: false });

  assert.doesNotMatch(html, /编辑工作项/);
  assert.doesNotMatch(html, /推进并指派/);
  assert.match(html, /当前项目权限为只读/);
});

test('work item detail hides mutations until a deleted item is restored', () => {
  const html = renderDetail({ item: { ...item, deleted_at: '2026-08-07T12:00:00Z' }, canCloseWorkItem: false, canRestoreWorkItem: true });

  assert.doesNotMatch(html, /工作项写入操作/);
  assert.doesNotMatch(html, /推进并指派/);
  assert.match(html, /该工作项已删除，恢复前不可编辑/);
  assert.match(html, /恢复工作项/);
});

test('work item detail exposes reopen only when the server permits it', () => {
  const html = renderDetail({ canCloseWorkItem: false, canReopenWorkItem: true });

  assert.match(html, /重新打开/);
  assert.doesNotMatch(html, /关闭工作项/);
});

test('work item detail renders busy and error states', () => {
  const html = renderDetail({ mutationBusy: true, editSubmitting: true, error: '保存失败。' });

  assert.match(html, /保存中…/);
  assert.match(html, /role="alert"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-disabled="true"/);
});
