/*
 * 元策 UI v3 · 消息中心
 */

import { h, icon, panel, badge, avatar, emptyState, iconTile } from '../ui.js';
import { messages } from '../mock/data.js';

const TYPE_META = {
  mention: { label: '提及我', icon: 'i-user', variant: 'brand' },
  reply: { label: '回复我', icon: 'i-message', variant: 'violet' },
  handoff: { label: '转交给我', icon: 'i-task', variant: 'teal' },
  comment: { label: '评论', icon: 'i-message', variant: 'info' },
};

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'unread', label: '未读' },
  { id: 'mention', label: '提及我' },
  { id: 'reply', label: '回复我' },
  { id: 'handoff', label: '转交给我' },
];

export function renderMessages(params, query) {
  const active = query.filter || 'all';

  const filtered = messages.filter((message) => {
    if (active === 'all') return true;
    if (active === 'unread') return message.unread;
    return message.type === active;
  });

  const filterButtons = FILTERS.map((filter) =>
    h(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': filter.id === active ? 'true' : 'false',
        onclick: () => {
          const next = filter.id === 'all' ? '#/messages' : `#/messages?filter=${filter.id}`;
          window.location.hash = next;
        },
      },
      filter.label,
      filter.id === 'unread' ? ' 2' : '',
    ),
  );

  const list = filtered.length
    ? h(
        'div',
        null,
        filtered.map((message) => {
          const meta = TYPE_META[message.type] || TYPE_META.comment;
          return h(
            'div',
            { class: 'list-row' },
            iconTile(meta.icon, meta.variant, 'sm'),
            h(
              'div',
              { class: 'list-row__main' },
              h(
                'div',
                { class: 'cluster', style: { gap: '8px' } },
                h('a', { class: 'list-row__title', href: `#/work-items/${message.item_key}` }, message.title),
                message.unread ? badge('未读', 'brand') : null,
              ),
              h(
                'div',
                { class: 'list-row__meta' },
                h('span', null, message.author),
                h('span', null, message.created_at),
                h('code', null, message.item_key),
              ),
            ),
            h('div', { class: 'list-row__side' }, badge(meta.label, meta.variant)),
          );
        }),
      )
    : emptyState('i-message', '暂无消息', '当前筛选条件下没有消息。');

  const unreadCount = messages.filter((message) => message.unread).length;
  const metrics = h(
    'div',
    { class: 'metrics' },
    h('div', { class: 'metric' }, iconTile('i-bell', 'brand'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '未读消息'), h('div', { class: 'metric__value' }, String(unreadCount)))),
    h('div', { class: 'metric' }, iconTile('i-user', 'violet'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '提及我'), h('div', { class: 'metric__value' }, String(messages.filter((message) => message.type === 'mention').length)))),
    h('div', { class: 'metric' }, iconTile('i-message', 'info'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '回复我'), h('div', { class: 'metric__value' }, String(messages.filter((message) => message.type === 'reply').length)))),
    h('div', { class: 'metric' }, iconTile('i-task', 'teal'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '转交给我'), h('div', { class: 'metric__value' }, String(messages.filter((message) => message.type === 'handoff').length)))),
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
        h('h1', { class: 'page-head__title' }, '消息中心'),
        h('p', { class: 'page-head__desc' }, '优先查看被提及和被回复的最新讨论，未读状态同时用文字与强调色标注。'),
      ),
      h('div', { class: 'page-head__actions' }, h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-check'), '全部标为已读')),
    ),
    metrics,
    h('div', { role: 'tablist', class: 'tabs' }, ...filterButtons),
    panel({ title: '消息列表', desc: `共 ${filtered.length} 条`, body: list, flush: true }),
  );
}
