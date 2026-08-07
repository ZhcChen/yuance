import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button, DataTable, Feedback, Field, Modal, Pagination, Skeleton } from '@yuance/frontend-ui';

test('button exposes loading and disabled semantics', () => {
  const html = renderToStaticMarkup(createElement(Button, { loading: true }, '保存'));
  assert.match(html, /disabled=""/u);
  assert.match(html, /aria-busy="true"/u);
  assert.match(html, /处理中/u);
});

test('field binds labels, hints and validation errors', () => {
  const html = renderToStaticMarkup(createElement(Field, { id: 'title', label: '标题', error: '请输入标题', required: true }, createElement('input')));
  assert.match(html, /for="title"/u);
  assert.match(html, /aria-invalid="true"/u);
  assert.match(html, /role="alert"/u);
});

test('feedback and modal expose bounded semantic states', () => {
  assert.match(renderToStaticMarkup(createElement(Feedback, { tone: 'danger', title: '保存失败' })), /role="alert"/u);
  const modal = renderToStaticMarkup(createElement(Modal, { open: false, title: '确认删除', onClose() {} }, '不可撤销'));
  assert.match(modal, /<dialog/u);
  assert.match(modal, /aria-label="关闭"/u);
  assert.match(modal, /aria-labelledby="yc-modal-title"/u);
});

test('table, pagination and skeleton cover empty and boundary states', () => {
  const table = renderToStaticMarkup(createElement(DataTable, { caption: '成员列表', columns: [{ key: 'name', label: '成员', render: (row) => /** @type {{ name: string }} */ (row).name }], rows: [], rowKey: (row) => /** @type {{ name: string }} */ (row).name }));
  assert.match(table, /暂无数据/u);
  assert.match(table, /scope="col"/u);
  const pagination = renderToStaticMarkup(createElement(Pagination, { page: 1, totalPages: 1, totalItems: 0, onPageChange() {} }));
  assert.equal((pagination.match(/disabled=""/gu) || []).length, 2);
  const skeleton = renderToStaticMarkup(createElement(Skeleton, { lines: 20 }));
  assert.equal((skeleton.match(/<span/gu) || []).length, 12);
  assert.match(skeleton, /role="status"/u);
});
