/*
 * 元策 UI v3 · 项目列表与项目详情
 */

import { h, icon, dataTable, panel, status, badge, avatar, emptyState, progressBar, iconTile } from '../ui.js';
import { projects, projectOverview, personalAnalysis, workItems, currentUser } from '../mock/data.js';

const MEMBER_VARIANTS = ['success', 'violet', 'teal', 'info', 'sand'];

function projectCard(project) {
  const total = project.pending.requirement + project.pending.task + project.pending.bug;

  return h(
    'a',
    { class: 'project-card v3-enter', href: `#/projects/${project.project_key}` },
    h(
      'div',
      { class: 'project-card__top' },
      h('span', { class: 'project-card__mark' }, project.name.charAt(0)),
      h(
        'div',
        { style: { minWidth: '0' } },
        h('div', { class: 'project-card__name' }, project.name),
        h('div', { class: 'project-card__key' }, project.project_key),
      ),
      h('span', { style: { marginLeft: 'auto' } }, status(project.status, 'success')),
    ),
    h(
      'div',
      { class: 'project-card__stats' },
      badge(`需求 ${project.pending.requirement}`, project.pending.requirement ? 'brand' : 'plain'),
      badge(`任务 ${project.pending.task}`, 'plain'),
      badge(`Bug ${project.pending.bug}`, project.pending.bug ? 'danger' : 'plain'),
    ),
    h(
      'div',
      { class: 'project-card__foot' },
      h('span', null, '负责人 ', project.owner),
      h('span', null, '·'),
      h('span', null, project.updated_at.slice(5, 10)),
      h(
        'span',
        { class: 'avatar-stack' },
        project.members.map((member, index) =>
          avatar(member === 'admin' ? '超' : member.charAt(0).toUpperCase(), MEMBER_VARIANTS[index % MEMBER_VARIANTS.length]),
        ),
      ),
      total
        ? h(
            'span',
            { class: 'mini-stat' },
            h('span', { class: 'mini-stat__value' }, String(total)),
            h('span', { class: 'mini-stat__label' }, '待处理'),
          )
        : null,
    ),
  );
}

const PROJECT_SCOPES = [
  { id: 'all', label: '全部项目' },
  { id: 'owned', label: '我负责的' },
  { id: 'joined', label: '我参与的' },
  { id: 'archived', label: '已归档' },
];

/** 项目页筛选写入 URL，保持可分享与刷新可还原。 */
function applyProjectFilter(patch) {
  const raw = window.location.hash.replace(/^#/, '') || '/projects';
  const [pathname, search = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  Object.assign(query, patch);

  for (const [key, value] of Object.entries(query)) {
    if (!value) delete query[key];
  }

  const next = Object.keys(query).length ? `${pathname}?${new URLSearchParams(query).toString()}` : pathname;
  window.location.hash = `#${next}`;
}

export function renderProjects(params, query) {
  const scope = query.scope || 'all';
  const keyword = (query.q || '').trim();

  const scoped = projects.filter((project) => {
    if (scope === 'owned') return project.owner === currentUser.display_name;
    if (scope === 'joined') return project.members.includes(currentUser.username);
    if (scope === 'archived') return project.status === '已归档';
    return true;
  });

  const visible = scoped.filter((project) => {
    if (!keyword) return true;
    return project.name.includes(keyword) || project.project_key.includes(keyword);
  });

  const cardGrid = visible.length
    ? h('div', { class: 'card-grid' }, visible.map((project) => projectCard(project)))
    : emptyState(
        'i-folder',
        '没有匹配的项目',
        keyword ? `没有名称或编号包含「${keyword}」的项目。` : '当前范围内没有项目，可以切换筛选范围。',
      );

  // 统计口径按「范围」而不是「关键词」：搜索只是检索，不该把统计清零
  const pendingTotal = scoped.reduce(
    (sum, project) => sum + project.pending.requirement + project.pending.task + project.pending.bug,
    0,
  );
  const memberTotal = scoped.reduce((sum, project) => sum + project.members.length, 0);

  const metrics = h(
    'div',
    { class: 'metrics' },
    h('div', { class: 'metric' }, iconTile('i-folder', 'brand'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '进行中项目'), h('div', { class: 'metric__value' }, String(projects.filter((project) => project.status !== '已归档').length)), h('div', { class: 'metric__delta' }, '较上月 +1'))),
    h('div', { class: 'metric' }, iconTile('i-user', 'info'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我负责的'), h('div', { class: 'metric__value' }, String(projects.filter((project) => project.owner === currentUser.display_name).length)))),
    h('div', { class: 'metric' }, iconTile('i-inbox', 'warning'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '待处理工作项'), h('div', { class: 'metric__value' }, String(pendingTotal)), h('div', { class: 'metric__delta' }, '需求 / 任务 / Bug 合计'))),
    h('div', { class: 'metric' }, iconTile('i-users', 'violet'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '项目成员'), h('div', { class: 'metric__value' }, String(memberTotal)), h('div', { class: 'metric__delta' }, '去重前'))),
  );

  const recentItems = h(
    'div',
    null,
    workItems.slice(0, 5).map((item) =>
      h(
        'a',
        { class: 'list-row', href: `#/work-items/${item.key}`, style: { textDecoration: 'none' } },
        h(
          'div',
          { class: 'list-row__main' },
          h('span', { class: 'list-row__title' }, item.title),
          h('div', { class: 'list-row__meta' }, h('code', null, item.key), h('span', null, item.project_name)),
        ),
        h('div', { class: 'list-row__side' }, h('span', { class: 'table__muted' }, item.updated_at)),
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
        h('h1', { class: 'page-head__title' }, '项目'),
        h(
          'p',
          { class: 'page-head__desc' },
          `共 ${projects.filter((project) => project.status !== '已归档').length} 个进行中项目，当前显示 ${visible.length} 个，按最近更新排序。`,
        ),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-filter'), '筛选'),
        h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-plus'), '新建项目'),
      ),
    ),
    metrics,
    h(
      'div',
      { class: 'cluster cluster--between' },
      h(
        'div',
        { class: 'btn-group' },
        PROJECT_SCOPES.map((item) =>
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              'aria-pressed': item.id === scope ? 'true' : 'false',
              onclick: () => applyProjectFilter({ scope: item.id === 'all' ? '' : item.id }),
            },
            item.label,
          ),
        ),
      ),
      h(
        'div',
        { class: 'field', style: { width: 'min(240px, 100%)' } },
        h('input', {
          class: 'input input--search',
          type: 'search',
          placeholder: '搜索项目名称或编号',
          value: keyword,
          'aria-label': '搜索项目',
          onchange: (event) => applyProjectFilter({ q: event.target.value }),
        }),
      ),
    ),
    cardGrid,
    panel({
      title: '最近更新的工作项',
      desc: '跨项目',
      actions: h('a', { class: 'btn btn--sm btn--ghost', href: '#/requirements' }, '查看全部'),
      body: recentItems,
      flush: true,
    }),
  );
}

const TABS = [
  { id: 'info', label: '概览' },
  { id: 'library', label: '资料库' },
  { id: 'cycles', label: '迭代' },
  { id: 'analysis', label: '个人分析' },
];

export function renderProjectDetail(params) {
  // 详情页按路由参数取项目，避免所有项目都显示「零售系统」
  const matched = projects.find((project) => project.project_key === params.projectKey);
  const overview = {
    ...projectOverview,
    project_key: matched ? matched.project_key : projectOverview.project_key,
    name: matched ? matched.name : projectOverview.name,
    owner: matched ? matched.owner : projectOverview.owner,
    status: matched ? matched.status : projectOverview.status,
    updated_at: matched ? matched.updated_at : projectOverview.updated_at,
  };

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
            actions: h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, icon('i-plus'), '添加'),
            body: h(
              'div',
              { class: 'stack stack--sm' },
              overview.members.map((member, index) =>
                h(
                  'div',
                  { class: 'list-row', style: { padding: '8px 0', borderBottom: '0' } },
                  avatar(member.display_name, MEMBER_VARIANTS[index % MEMBER_VARIANTS.length]),
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
              h('span', { class: 'list-row__title' }, '零售系统产品手册'),
              badge('4 个关联工作项', 'brand'),
            ),
            h('div', { class: 'cluster' }, badge('文档', 'plain'), h('span', { class: 'table__muted' }, '12 章节 · 4.2 MB')),
          ),
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
                render: (row) => progressBar(row.progress, { done: row.progress === 100, label: row.progressText }),
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
          desc: '单位：工作项数',
          body: h(
            'div',
            { class: 'cluster', style: { alignItems: 'flex-end', gap: '6px', height: '140px' } },
            personalAnalysis.throughput.map((value, index) =>
              h(
                'span',
                {
                  title: `第 ${index + 1} 周：${value}`,
                  style: {
                    display: 'block',
                    width: '20px',
                    height: `${Math.max(10, value * 8)}px`,
                    borderRadius: '5px 5px 2px 2px',
                    background: 'var(--brand-gradient)',
                    opacity: String(0.45 + value / 30),
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
