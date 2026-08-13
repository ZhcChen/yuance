import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Badge, Button, ContentTab, ContentTabs, DataTable, ErrorToast, Feedback, Field, FilterBar, FilterField, Modal, Pagination, PriorityBadge, Select, Skeleton, TextArea, TextInput } from '@yuance/frontend-ui';

test('button exposes loading and disabled semantics', () => {
  const html = renderToStaticMarkup(createElement(Button, { loading: true, form: 'editor' }, '保存'));
  assert.match(html, /disabled=""/u);
  assert.match(html, /aria-busy="true"/u);
  assert.match(html, /form="editor"/u);
  assert.match(html, /处理中/u);
});

test('button supports compact size and extra classes', () => {
  const html = renderToStaticMarkup(createElement(Button, { size: 'sm', className: 'row-action', onClick() {} }, '打开'));
  assert.match(html, /class="yc-button yc-button-primary yc-button-sm row-action"/u);
});

test('text input and textarea keep native form semantics', () => {
  const input = renderToStaticMarkup(createElement(TextInput, { name: 'q', defaultValue: 'bug', placeholder: '搜索' }));
  assert.match(input, /class="yc-text-input"/u);
  assert.match(input, /name="q"/u);
  assert.match(input, /value="bug"/u);
  const textarea = renderToStaticMarkup(createElement(TextArea, { name: 'notes', rows: 4, defaultValue: '说明' }));
  assert.match(textarea, /class="yc-textarea"/u);
  assert.match(textarea, /name="notes"/u);
  assert.match(textarea, /rows="4"/u);
  assert.match(textarea, /说明/u);
});

test('error toast exposes an assertive, dismissible global failure notice', () => {
  const html = renderToStaticMarkup(createElement(ErrorToast, { open: true, message: '请求失败。', onClose() {} }));
  assert.match(html, /role="alert"/u);
  assert.match(html, /请求失败。/u);
  assert.match(html, /aria-label="关闭提示"/u);
});

test('field binds labels, hints and validation errors', () => {
  const html = renderToStaticMarkup(createElement(Field, { id: 'title', label: '标题', error: '请输入标题', required: true }, createElement('input')));
  assert.match(html, /for="title"/u);
  assert.match(html, /aria-invalid="true"/u);
  assert.match(html, /role="alert"/u);
});

test('select preserves native form semantics inside the shared control', () => {
  const html = renderToStaticMarkup(createElement(Select, { name: 'status', defaultValue: 'open', required: true },
    createElement('option', { value: 'open' }, '待处理'),
    createElement('option', { value: 'done' }, '已完成')));
  assert.match(html, /class="yc-select"/u);
  assert.match(html, /class="yc-select-native"[^>]*name="status" required=""/u);
  assert.match(html, /aria-haspopup="listbox"/u);
  assert.match(html, /aria-expanded="false"/u);
  assert.match(html, /class="yc-select-menu" role="listbox"/u);
  assert.match(html, /class="yc-select-caret" aria-hidden="true"/u);
  assert.match(html, /value="open" selected=""/u);

  const fieldHtml = renderToStaticMarkup(createElement(Field, { id: 'priority', label: '优先级', error: '请选择优先级', required: true },
    createElement(Select, null, createElement('option', { value: '' }, '请选择'))));
  assert.match(fieldHtml, /<select[^>]*id="priority-native"[^>]*required=""/u);
  assert.match(fieldHtml, /<button id="priority"[^>]*aria-describedby="priority-description" aria-invalid="true"/u);
});

test('filter bar and filter field compose compact filter forms', () => {
  const html = renderToStaticMarkup(createElement(FilterBar, { ariaLabel: '筛选工作项', actions: createElement(Button, { type: 'submit' }, '筛选') },
    createElement(FilterField, { id: 'keyword', label: '关键词' }, createElement(TextInput, { name: 'q' }))));
  assert.match(html, /<form class="yc-filter-bar"/u);
  assert.match(html, /aria-label="筛选工作项"/u);
  assert.match(html, /class="yc-filter-actions"/u);
  assert.match(html, /for="keyword"/u);
  assert.match(html, /id="keyword"/u);
  assert.match(html, /class="yc-text-input"/u);
  assert.match(html, /筛选/u);
});

test('feedback and modal expose bounded semantic states', () => {
  assert.match(renderToStaticMarkup(createElement(Feedback, { tone: 'danger', title: '保存失败' })), /role="alert"/u);
  const modal = renderToStaticMarkup(createElement(Modal, { open: false, title: '确认删除', onClose() {} }, '不可撤销'));
  assert.match(modal, /<dialog/u);
  assert.match(modal, /aria-label="关闭"/u);
  const labelledBy = modal.match(/aria-labelledby="([^"]+)"/u)?.[1];
  assert.ok(labelledBy);
  assert.match(modal, new RegExp(`<h2 id="${labelledBy}">确认删除</h2>`, 'u'));
  assert.match(renderToStaticMarkup(createElement(Modal, { open: false, wide: true, title: '新建资料', onClose() {} })), /class="yc-modal yc-modal-wide"/u);
});

test('badge and tabs expose the main Web primitive structure', () => {
  assert.match(renderToStaticMarkup(createElement(Badge, { tone: 'warning' }, '高优先级')), /yc-badge-warning/u);
  const tabs = renderToStaticMarkup(createElement(ContentTabs, { ariaLabel: '类型导航' },
    createElement(ContentTab, { href: '/tasks', active: true, badge: 108 }, '任务')));
  assert.match(tabs, /aria-label="类型导航"/u);
  assert.match(tabs, /aria-current="page"/u);
  assert.match(tabs, /99\+/u);
});

test('priority badge uses red-orange-violet-sand hierarchy', () => {
  const html = {
    P0: renderToStaticMarkup(createElement(PriorityBadge, { priority: 'P0' })),
    P1: renderToStaticMarkup(createElement(PriorityBadge, { priority: 'P1' })),
    P2: renderToStaticMarkup(createElement(PriorityBadge, { priority: 'P2' })),
    P3: renderToStaticMarkup(createElement(PriorityBadge, { priority: 'P3' })),
  };
  assert.match(html.P0, /yc-badge-danger/u);
  assert.match(html.P1, /yc-badge-warning/u);
  assert.match(html.P2, /yc-badge-violet/u);
  assert.match(html.P3, /yc-badge-sand/u);
  assert.match(html.P2, /yc-priority-P2/u);
  assert.match(html.P3, /yc-priority-P3/u);
  const unknown = renderToStaticMarkup(createElement(PriorityBadge, { priority: '未设置' }));
  assert.match(unknown, /yc-badge-neutral/u);
  assert.match(unknown, /未设置/u);
});

test('content tabs retain the sliding indicator transition after resize observation', async () => {
  const source = await readFile(new URL('../src/primitives.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /new ResizeObserver\(\(\) => syncIndicator\(true\)\)/u);
  assert.match(styles, /\.yc-content-tabs-indicator \{[^}]*transition: width 360ms[^;]*, transform 360ms/u);
});

test('wide modal fills 90% of the viewport width and height', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.yc-modal-wide\s*\{[^}]*width:\s*90vw/u);
  assert.match(styles, /\.yc-modal-wide\s*\{[^}]*height:\s*90vh/u);
  assert.match(styles, /\.yc-modal-wide \.work-item-action-form \{[^}]*height: 100%/u);
  assert.match(styles, /\.yc-modal-wide \.yc-rich-field \.yc-rich-text-input \{[^}]*min-height: 0/u);
});

test('table, pagination and skeleton cover empty and boundary states', () => {
  const table = renderToStaticMarkup(createElement(DataTable, { caption: '成员列表', columns: [{ key: 'name', label: '成员', render: (row) => /** @type {{ name: string }} */ (row).name }], rows: [], rowKey: (row) => /** @type {{ name: string }} */ (row).name }));
  assert.match(table, /暂无数据/u);
  assert.match(table, /scope="col"/u);
  const pagination = renderToStaticMarkup(createElement(Pagination, { page: 1, totalPages: 1, totalItems: 0, onPageChange() {} }));
  assert.equal((pagination.match(/disabled=""/gu) || []).length, 2);
  assert.match(pagination, /aria-label="上一页"/u);
  assert.match(pagination, /aria-label="下一页"/u);
  const sizedPagination = renderToStaticMarkup(createElement(Pagination, { page: 1, totalPages: 1, totalItems: 6, itemLabel: '个用户', rangeLabel: '当前显示 1-6', pageSize: 10, pageSizes: [10, 20, 50, 100], onPageChange() {}, onPageSizeChange() {} }));
  assert.match(sizedPagination, /共 <strong>6<\/strong> 个用户/u);
  assert.match(sizedPagination, /当前显示 1-6/u);
  assert.match(sizedPagination, /<option value="100">100<\/option>/u);
  const skeleton = renderToStaticMarkup(createElement(Skeleton, { lines: 20 }));
  assert.equal((skeleton.match(/<span/gu) || []).length, 12);
  assert.match(skeleton, /role="status"/u);
});
