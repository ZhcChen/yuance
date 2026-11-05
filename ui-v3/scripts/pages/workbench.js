/*
 * 元策 UI v3 · 工作台
 * 与现网保持同样的信息项，压缩为指标条 + 双栏主体。
 */

import { h, icon, dataTable, panel, metric, status, badge, avatar, emptyState, iconTile } from '../ui.js';
import { projects, workItems, messages, recentActivities, currentProject } from '../mock/data.js';

const STATUS_VARIANT = {
  待处理: 'warning',
  进行中: 'info',
  待确认: 'progress',
  已完成: 'success',
  已关闭: 'neutral',
};

export function renderWorkbench() {
  const mine = workItems.filter((item) => item.assignee === '超级管理员');
  const openCount = workItems.filter((item) => item.status === '待处理' || item.status === '进行中').length;

  const metrics = h(
    'div',
    { class: 'metrics' },
    metric({ label: '进行中项目', value: String(projects.length), delta: '较上周 +1', iconId: 'i-folder', variant: 'brand' }),
    metric({ label: '我的待处理', value: String(mine.length), delta: `全部工作项 ${openCount} 项`, iconId: 'i-inbox', variant: 'neutral' }),
    metric({ label: '本周完成', value: '12', delta: '较上周 +4', iconId: 'i-check', variant: 'neutral' }),
    metric({ label: '逾期工作项', value: '2', delta: '需要关注', iconId: 'i-alert', variant: 'danger' }),
  );

  const projectTable = dataTable(
    [
      {
        key: 'name',
        label: '项目',
        render: (row) =>
          h(
            'div',
            { class: 'cluster', style: { gap: '10px', flexWrap: 'nowrap' } },
            h('span', { class: 'project-card__mark', style: { width: '28px', height: '28px', borderRadius: '8px', fontSize: '12px' } }, row.name.charAt(0)),
            h(
              'div',
              { style: { minWidth: '0' } },
              h('a', { class: 'table__title', href: `#/projects/${row.project_key}` }, row.name),
              h('div', { class: 'table__key' }, row.project_key),
            ),
          ),
      },
      { key: 'owner', label: '负责人', cellClass: 'table__muted' },
      {
        key: 'pending',
        label: '我的待处理',
        align: 'right',
        render: (row) => {
          const total = row.pending.requirement + row.pending.task + row.pending.bug;
          return total
            ? h('span', { class: 'mini-stat' }, h('span', { class: 'mini-stat__value' }, String(total)))
            : h('span', { class: 'table__muted' }, '—');
        },
      },
      {
        key: 'breakdown',
        label: '需求 / 任务 / Bug',
        render: (row) =>
          h(
            'span',
            { class: 'cluster', style: { gap: '6px', flexWrap: 'nowrap' } },
            badge(`需 ${row.pending.requirement}`, row.pending.requirement ? 'brand' : 'plain'),
            badge(`任 ${row.pending.task}`, 'plain'),
            badge(`Bug ${row.pending.bug}`, row.pending.bug ? 'danger' : 'plain'),
          ),
      },
      { key: 'status', label: '状态', render: (row) => status(row.status, 'success') },
      { key: 'updated_at', label: '更新', cellClass: 'table__muted' },
      {
        key: 'action',
        label: '',
        align: 'right',
        render: (row) => h('a', { class: 'btn btn--sm btn--ghost', href: `#/projects/${row.project_key}` }, '查看'),
      },
    ],
    projects.slice(0, 8),
  );

  const myQueue = h(
    'div',
    null,
    workItems.slice(0, 6).map((item) =>
      h(
        'a',
        { class: 'list-row', href: `#/work-items/${item.key}`, style: { textDecoration: 'none' } },
        h('span', { class: 'status__dot', style: { background: 'var(--brand)', width: '7px', height: '7px' } }),
        h(
          'div',
          { class: 'list-row__main' },
          h('span', { class: 'list-row__title' }, item.title),
          h(
            'div',
            { class: 'list-row__meta' },
            h('code', null, item.key),
            h('span', null, item.project_name),
          ),
        ),
        h('div', { class: 'list-row__side' }, status(item.status, STATUS_VARIANT[item.status] || 'neutral')),
      ),
    ),
  );

  const discussions = h(
    'div',
    null,
    messages.slice(0, 3).map((message) =>
      h(
        'a',
        { class: 'list-row', href: `#/work-items/${message.item_key}`, style: { textDecoration: 'none' } },
        avatar(message.author, 'violet'),
        h(
          'div',
          { class: 'list-row__main' },
          h('span', { class: 'list-row__title' }, message.title),
          h('div', { class: 'list-row__meta' }, h('span', null, message.author), h('span', null, message.created_at)),
        ),
        message.unread ? badge('未读', 'brand') : null,
      ),
    ),
  );

  const activities = h(
    'div',
    { class: 'timeline' },
    recentActivities.map((activity) =>
      h(
        'div',
        { class: 'timeline__item' },
        avatar(activity.user, 'info'),
        h(
          'div',
          { class: 'timeline__body' },
          h('p', { class: 'timeline__title' }, activity.text),
          h('div', { class: 'timeline__meta' }, h('span', null, activity.user), h('span', null, activity.time)),
        ),
      ),
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
        h('h1', { class: 'page-head__title' }, '工作台'),
        h('p', { class: 'page-head__desc' }, `当前项目「${currentProject.name}」，按最近更新排序展示全部可见项目的待处理与进行中情况。`),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-refresh'), '刷新'),
        h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-plus'), '新建项目'),
      ),
    ),
    metrics,
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        { class: 'stack' },
        panel({
          title: '项目推进',
          desc: `共 ${projects.length} 个进行中项目`,
          actions: h('a', { class: 'btn btn--sm btn--ghost', href: '#/projects' }, '全部项目'),
          body: projectTable,
          flush: true,
        }),
        panel({
          title: '我的待处理',
          desc: '按最近更新排序',
          actions: h('a', { class: 'btn btn--sm btn--ghost', href: '#/requirements' }, '查看全部'),
          body: myQueue,
          flush: true,
        }),
      ),
      h(
        'aside',
        { class: 'split__aside' },
        panel({
          title: '待我处理讨论',
          desc: `${messages.filter((message) => message.unread).length} 条未读`,
          actions: h('a', { class: 'btn btn--sm btn--ghost', href: '#/messages' }, '消息中心'),
          body: discussions,
          flush: true,
        }),
        panel({ title: '最近动态', body: activities }),
      ),
    ),
  );
}
