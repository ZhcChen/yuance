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
    editForm: { title: item.title, description: item.description, status: item.status, priority: item.priority, assigneeUsername: 'alice', dueDate: item.due_date, parentItemKey: item.parent_item_key },
    handoffForm: { status: 'pending_confirmation', assigneeUsername: 'bob', body: '请确认' },
    statusOptions: ['in_progress', 'pending_confirmation'],
    priorityOptions: ['P0', 'P1'],
    statusLabel: (status) => status === 'in_progress' ? '处理中' : '待确认',
    mutationBusy: false,
    editSubmitting: false,
    handoffSubmitting: false,
    error: '',
    parentHref: '/web/app/work-items/YCE-REQ-1',
    onOpenParent: () => {},
    onChangeEdit: () => {},
    onChangeHandoff: () => {},
    onSubmitEdit: () => {},
    onSubmitHandoff: () => {},
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
  assert.match(html, /父级工作项 Key/);
});

test('work item detail renders busy and error states', () => {
  const html = renderDetail({ mutationBusy: true, editSubmitting: true, error: '保存失败。' });

  assert.match(html, /保存中…/);
  assert.match(html, /role="alert"/);
  assert.match(html, /disabled=""/);
});
