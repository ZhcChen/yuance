/*
 * 元策 UI v3 · 全局搜索
 */

import { h, icon, panel, badge, emptyState, select } from '../ui.js';
import { searchResults } from '../mock/data.js';

const KIND_META = {
  requirement: { label: '需求', icon: 'i-inbox' },
  task: { label: '任务', icon: 'i-task' },
  bug: { label: 'Bug', icon: 'i-bug' },
  resource: { label: '资料', icon: 'i-book' },
};

export function renderSearch(params, query) {
  const keyword = (query.q || '').trim();

  const grouped = new Map();
  for (const result of searchResults) {
    if (!grouped.has(result.kind)) grouped.set(result.kind, []);
    grouped.get(result.kind).push(result);
  }

  const groups = [...grouped.entries()].map(([kind, results]) => {
    const meta = KIND_META[kind] || KIND_META.resource;
    return panel({
      title: meta.label,
      desc: `${results.length} 条`,
      body: h(
        'div',
        null,
        results.map((result) =>
          h(
            'div',
            { class: 'list-row' },
            h('span', { class: 'attachment__icon' }, icon(meta.icon)),
            h(
              'div',
              { class: 'list-row__main' },
              h('a', { class: 'list-row__title', href: `#/work-items/${result.key}` }, result.title),
              h('div', { class: 'list-row__meta' }, h('code', null, result.key), h('span', null, result.project)),
            ),
            h('div', { class: 'list-row__side' }, h('span', { class: 'table__muted' }, result.updated_at)),
          ),
        ),
      ),
      flush: true,
    });
  });

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h('h1', { class: 'page-head__title' }, '全局搜索'),
        h('p', { class: 'page-head__desc' }, keyword ? `「${keyword}」的搜索结果，按类型分组。` : '输入关键词后搜索项目、需求、任务、Bug 与资料库。'),
      ),
    ),
    h(
      'div',
      { class: 'filter-bar' },
      h(
        'label',
        { class: 'field field--wide' },
        h('span', { class: 'field__label' }, '关键词'),
        h('input', {
          class: 'input input--search',
          type: 'search',
          value: keyword,
          placeholder: '搜索项目、需求、任务、Bug、资料库',
          onchange: (event) => {
            window.location.hash = event.target.value.trim() ? `#/search?q=${encodeURIComponent(event.target.value.trim())}` : '#/search';
          },
        }),
      ),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field__label' }, '范围'),
        select({
          value: '',
          ariaLabel: '按类型限定搜索范围',
          items: [
            { value: '', label: '全部类型' },
            { value: 'requirement', label: '需求' },
            { value: 'task', label: '任务' },
            { value: 'bug', label: 'Bug' },
            { value: 'resource', label: '资料' },
          ],
        }),
      ),
      h('div', { class: 'filter-bar__actions' }, h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-search'), '搜索')),
    ),
    keyword
      ? h('div', { class: 'stack' }, ...groups)
      : emptyState('i-search', '输入关键词开始搜索', '支持按工作项编号、标题与项目名称检索。'),
  );
}
