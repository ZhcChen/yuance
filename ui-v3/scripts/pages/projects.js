/*
 * 元策 UI v3 · 项目列表与项目详情
 */

import { h, icon, dataTable, panel, status, badge, avatar, emptyState } from '../ui.js';
import { projects, projectOverview, personalAnalysis } from '../mock/data.js';

export function renderProjects() {
  const table = dataTable(
    [
      { key: 'project_key', label: '编号', cellClass: 'table__key' },
      {
        key: 'name',
        label: '项目',
        render: (row) => h('a', { class: 'table__title', href: `#/projects/${row.project_key}` }, row.name),
      },
      { key: 'owner', label: '项目负责人', cellClass: 'table__muted' },
      {
        key: 'pending',
        label: '我的待处理',
        render: (row) => {
          const total = row.pending.requirement + row.pending.task + row.pending.bug;
          return h(
            'span',
            { class: 'cluster', style: { gap: '4px' } },
            badge(`需求 ${row.pending.requirement}`, row.pending.requirement ? 'brand' : 'plain'),
            badge(`任务 ${row.pending.task}`, 'plain'),
            badge(`Bug ${row.pending.bug}`, row.pending.bug ? 'danger' : 'plain'),
          );
        },
      },
      { key: 'status', label: '状态', render: (row) => status(row.status, 'success') },
      { key: 'updated_at', label: '更新', cellClass: 'table__muted' },
      {
        key: 'action',
        label: '操作',
        align: 'right',
        render: (row) => h('a', { class: 'btn btn--sm btn--ghost', href: `#/projects/${row.project_key}` }, '查看'),
      },
    ],
    projects,
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
        h('h1', { class: 'page-head__title' }, '项目'),
        h('p', { class: 'page-head__desc' }, '共 11 个进行中项目，含我的待处理数量与最近更新时间。'),
      ),
      h('div', { class: 'page-head__actions' }, h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-plus'), '新建项目')),
    ),
    panel({ body: table, flush: true }),
  );
}

const TABS = [
  { id: 'info', label: '概览' },
  { id: 'library', label: '资料库' },
  { id: 'cycles', label: '迭代' },
  { id: 'analysis', label: '个人分析' },
];

export function renderProjectDetail(params) {
  const overview = projectOverview;

  const tabPanel = (id) => {
    if (id === 'info') {
      return h(
        'div',
        { class: 'tab-panel' },
        h(
          'div',
          { class: 'grid grid--2' },
          panel({
            title: '项目信息',
            body: h(
              'div',
              { class: 'stack' },
              h(
                'div',
                { class: 'props' },
                h('span', { class: 'props__label' }, '编号'),
                h('span', { class: 'u-mono' }, overview.project_key),
                h('span', { class: 'props__label' }, '状态'),
                status(overview.status, 'success'),
                h('span', { class: 'props__label' }, '负责人'),
                h('span', null, overview.owner),
                h('span', { class: 'props__label' }, '创建时间'),
                h('span', { class: 'table__muted' }, overview.created_at),
                h('span', { class: 'props__label' }, '最近更新'),
                h('span', { class: 'table__muted' }, overview.updated_at),
              ),
              h('p', { class: 'description' }, overview.description),
            ),
          }),
          panel({
            title: '项目成员',
            desc: `${overview.members.length} 人`,
            body: h(
              'div',
              { class: 'stack stack--sm' },
              overview.members.map((member) =>
                h(
                  'div',
                  { class: 'list-row', style: { padding: '6px 0', borderBottom: '0' } },
                  avatar(member.display_name, member.role === '负责人' ? 'success' : ''),
                  h(
                    'div',
                    { class: 'list-row__main' },
                    h('span', { class: 'list-row__title' }, member.display_name),
                    h('div', { class: 'list-row__meta' }, h('span', null, member.role)),
                  ),
                  h('div', { class: 'list-row__side' }, h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, '移除')),
                ),
              ),
            ),
          }),
        ),
      );
    }

    if (id === 'library') {
      return h(
        'div',
        { class: 'tab-panel' },
        panel({
          title: '项目资料库',
          desc: '与工作项双向关联',
          actions: h('button', { class: 'btn btn--sm btn--primary', type: 'button' }, icon('i-upload'), '上传'),
          body: h(
            'div',
            { class: 'stack stack--sm' },
            h(
              'div',
              { class: 'cluster cluster--between' },
              h('span', null, '零售系统产品手册'),
              badge('4 个关联工作项', 'brand'),
            ),
            h('div', { class: 'cluster' }, badge('文档', 'plain'), h('span', { class: 'table__muted' }, '12 章节 · 4.2 MB')),
          ),
          flush: false,
        }),
      );
    }

    if (id === 'cycles') {
      const rows = overview.cycles.map((cycle) => ({
        ...cycle,
        progressText: `${cycle.progress}%`,
      }));

      return h(
        'div',
        { class: 'tab-panel' },
        panel({
          body: dataTable(
            [
              { key: 'name', label: '迭代名称' },
              { key: 'start_date', label: '开始', cellClass: 'table__muted' },
              { key: 'end_date', label: '结束', cellClass: 'table__muted' },
              {
                key: 'progressText',
                label: '进度',
                render: (row) =>
                  h(
                    'span',
                    { class: 'cluster', style: { gap: '8px', flexWrap: 'nowrap' } },
                    h(
                      'span',
                      {
                        style: {
                          display: 'block',
                          width: '72px',
                          height: '6px',
                          borderRadius: '999px',
                          background: 'var(--surface-sunken)',
                          overflow: 'hidden',
                        },
                      },
                      h('span', {
                        style: {
                          display: 'block',
                          width: `${row.progress}%`,
                          height: '100%',
                          background: row.progress === 100 ? 'var(--success)' : 'var(--brand)',
                        },
                      }),
                    ),
                    h('span', { class: 'table__muted' }, row.progressText),
                  ),
              },
              { key: 'state', label: '状态', render: (row) => status(row.state, row.state === '进行中' ? 'info' : 'neutral') },
            ],
            rows,
          ),
          flush: true,
        }),
      );
    }

    return h(
      'div',
      { class: 'tab-panel' },
      h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'metrics' },
          h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的需求'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.requirement)))),
          h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的任务'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.task)))),
          h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的 Bug'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.bug)))),
          h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '当前迭代'), h('div', { class: 'metric__value', style: { fontSize: 'var(--fs-16)' } }, personalAnalysis.cycle))),
        ),
        panel({
          title: '近 12 周完成趋势',
          body: h(
            'div',
            { class: 'cluster', style: { alignItems: 'flex-end', gap: '4px', height: '120px' } },
            personalAnalysis.throughput.map((value, index) =>
              h(
                'span',
                {
                  title: `第 ${index + 1} 周：${value}`,
                  style: {
                    display: 'block',
                    width: '18px',
                    height: `${Math.max(8, value * 8)}px`,
                    borderRadius: '3px 3px 0 0',
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-line)',
                    borderBottom: '0',
                  },
                },
              ),
            ),
          ),
        }),
      ),
    );
  };

  const tabButtons = TABS.map((tab) =>
    h(
      'button',
      {
        class: 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': tab.id === 'info' ? 'true' : 'false',
        dataset: { tab: tab.id },
        onclick: (event) => {
          const group = event.currentTarget.closest('[role="tablist"]');
          group.querySelectorAll('.tab').forEach((node) => node.setAttribute('aria-selected', 'false'));
          event.currentTarget.setAttribute('aria-selected', 'true');
          const host = document.getElementById('project-tab-panel');
          host.replaceChildren(tabPanel(tab.id));
        },
      },
      tab.label,
    ),
  );

  return h(
    'div',
    { class: 'stack' },
    h(
      'nav',
      { class: 'breadcrumb', 'aria-label': '面包屑' },
      h('a', { href: '#/' }, '工作台'),
      h('span', { class: 'breadcrumb__sep' }, '/'),
      h('a', { href: '#/projects' }, '项目'),
      h('span', { class: 'breadcrumb__sep' }, '/'),
      h('span', null, overview.name),
    ),
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h('h1', { class: 'page-head__title' }, overview.name, status(overview.status, 'success')),
        h('p', { class: 'page-head__desc' }, h('code', null, overview.project_key), ' · 负责人 ', overview.owner, ' · 更新于 ', overview.updated_at),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-users'), '成员'),
        h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-plus'), '新建工作项'),
      ),
    ),
    h('div', { role: 'tablist', class: 'tabs' }, ...tabButtons),
    h('div', { id: 'project-tab-panel', class: 'tab-panel' }, tabPanel('info')),
  );
}
