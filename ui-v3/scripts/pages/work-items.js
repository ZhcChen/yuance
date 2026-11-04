/*
 * 元策 UI v3 · 工作项列表（需求 / 任务 / Bug 共用一套模板）
 */

import { h, icon, dataTable, panel, status, priority, badge, pagination, emptyState, iconTile, select } from '../ui.js';
import { workItems } from '../mock/data.js';

const TYPES = {
  requirement: { label: '需求', singular: '需求', icon: 'i-inbox', create: '新建需求' },
  task: { label: '任务', singular: '任务', icon: 'i-task', create: '新建任务' },
  bug: { label: 'Bug', singular: 'Bug', icon: 'i-bug', create: '新建 Bug' },
};

const STATUS_VARIANT = {
  待处理: 'warning',
  进行中: 'info',
  待确认: 'progress',
  已完成: 'success',
  已关闭: 'neutral',
};

const PRIORITY_VARIANT = { 高: 'high', 中: 'medium', 低: 'low' };

const STATUS_OPTIONS = ['全部状态', '待处理', '进行中', '待确认', '已完成', '已关闭'];
const PRIORITY_OPTIONS = ['全部优先级', '高', '中', '低'];

export function renderWorkItems(itemType, params, query) {
  const config = TYPES[itemType] || TYPES.requirement;

  const all = workItems.filter((item) => item.item_type === itemType);
  const keyword = (query.q || '').trim();
  const statusFilter = query.status || '';
  const priorityFilter = query.priority || '';

  const filtered = all.filter((item) => {
    if (keyword && !item.title.includes(keyword) && !item.key.includes(keyword)) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (priorityFilter && item.priority !== priorityFilter) return false;
    return true;
  });

  const metrics = h(
    'div',
    { class: 'metrics' },
    h(
      'div',
      { class: 'metric' },
      iconTile('i-layers', 'brand'),
      h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, `全部${config.label}`), h('div', { class: 'metric__value' }, String(all.length))),
    ),
    h(
      'div',
      { class: 'metric' },
      iconTile('i-activity', 'warning'),
      h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '待处理 / 进行中 / 待确认'), h('div', { class: 'metric__value' }, String(all.filter((item) => ['待处理', '进行中', '待确认'].includes(item.status)).length))),
    ),
    h(
      'div',
      { class: 'metric' },
      iconTile('i-alert', 'danger'),
      h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '高优先级'), h('div', { class: 'metric__value' }, String(all.filter((item) => item.priority === '高').length))),
    ),
    h(
      'div',
      { class: 'metric' },
      iconTile('i-check', 'success'),
      h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '已完成'), h('div', { class: 'metric__value' }, String(all.filter((item) => item.status === '已完成').length))),
    ),
  );

  const selected = new Set();

  const bulkBar = h(
    'div',
    { class: 'bulk-bar', hidden: true, id: 'bulk-bar' },
    h('span', { id: 'bulk-count' }, '已选择 0 项'),
    h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, '批量指派'),
    h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, '批量流转状态'),
    h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => clearSelection() }, '取消选择'),
  );

  const syncSelection = () => {
    bulkBar.hidden = selected.size === 0;
    document.getElementById('bulk-count').textContent = `已选择 ${selected.size} 项`;
  };

  const clearSelection = () => {
    selected.clear();
    document.querySelectorAll('.js-row-check').forEach((node) => {
      node.checked = false;
    });
    syncSelection();
  };

  const checkCell = (row) => {
    const box = h('input', {
      class: 'checkbox js-row-check',
      type: 'checkbox',
      'aria-label': `选择 ${row.title}`,
      onchange: (event) => {
        if (event.target.checked) selected.add(row.key);
        else selected.delete(row.key);
        syncSelection();
      },
    });
    return h('td', { class: 'table__check' }, box);
  };

  const columns = [
    {
      key: 'select',
      label: '',
      width: '36px',
      render: (row) => checkCell(row),
    },
    { key: 'key', label: '编号', cellClass: 'table__key', render: (row) => h('code', null, row.key) },
    {
      key: 'title',
      label: '标题',
      render: (row) => h('a', { class: 'table__title', href: `#/work-items/${row.key}` }, row.title),
    },
    { key: 'status', label: '状态', render: (row) => status(row.status, STATUS_VARIANT[row.status] || 'neutral') },
    { key: 'priority', label: '优先级', render: (row) => priority(row.priority, PRIORITY_VARIANT[row.priority] || 'low') },
    { key: 'assignee', label: '负责人', cellClass: 'table__muted', render: (row) => row.assignee || h('span', { class: 'table__muted' }, '未指派') },
    { key: 'due_date', label: '截止', cellClass: 'table__muted' },
    { key: 'updated_at', label: '更新', cellClass: 'table__muted' },
    {
      key: 'action',
      label: '操作',
      align: 'right',
      render: () => h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': '更多操作' }, icon('i-more')),
    },
  ];

  const body = h(
    'div',
    null,
    bulkBar,
    filtered.length
      ? dataTable(columns, filtered)
      : emptyState('i-inbox', '暂无需求', '当前筛选条件下没有匹配的工作项，可以调整筛选条件或新建需求。'),
  );

  const filterBar = h(
    'div',
    { class: 'filter-bar' },
    h(
      'label',
      { class: 'field field--wide' },
      h('span', { class: 'field__label' }, '关键词'),
      h('input', {
        class: 'input',
        type: 'search',
        placeholder: `搜索${config.singular}标题或编号`,
        value: keyword,
        onchange: (event) => {
          applyFilters({ q: event.target.value });
        },
      }),
    ),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, '状态'),
      select({
        value: statusFilter,
        ariaLabel: '按状态筛选',
        items: STATUS_OPTIONS.map((option) => ({ value: option === '全部状态' ? '' : option, label: option })),
        onChange: (value) => applyFilters({ status: value }),
      }),
    ),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, '优先级'),
      select({
        value: priorityFilter,
        ariaLabel: '按优先级筛选',
        items: PRIORITY_OPTIONS.map((option) => ({ value: option === '全部优先级' ? '' : option, label: option })),
        onChange: (value) => applyFilters({ priority: value }),
      }),
    ),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field__label' }, '项目'),
      select({
        value: '',
        ariaLabel: '按项目筛选',
        items: [
          { value: '', label: '全部项目' },
          { value: 'P261102793662', label: '零售系统', hint: 'P261102793662' },
        ],
      }),
    ),
    h(
      'div',
      { class: 'filter-bar__actions' },
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => applyFilters({ q: '', status: '', priority: '' }) }, icon('i-refresh'), '重置'),
    ),
  );

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h('h1', { class: 'page-head__title' }, config.label),
        h('p', { class: 'page-head__desc' }, '组合筛选、优先级、负责人和截止日期，以最快速度定位目标工作项。'),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-filter'), '高级筛选'),
        h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-plus'), config.create),
      ),
    ),
    metrics,
    panel({ title: '筛选条件', desc: '当前项目：零售系统', body: filterBar }),
    panel({
      title: `${config.label}列表`,
      desc: `共 ${filtered.length} 条`,
      actions: h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, icon('i-download'), '导出'),
      body,
      flush: true,
      foot: pagination(filtered.length, 1, 20, () => {}),
    }),
  );
}

function applyFilters(patch) {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathname, search = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  Object.assign(query, patch);

  for (const [key, value] of Object.entries(query)) {
    if (!value) delete query[key];
  }

  const next = Object.keys(query).length ? `${pathname}?${new URLSearchParams(query).toString()}` : pathname;
  window.location.hash = `#${next}`;
}
