/*
 * 元策 UI v3 · 系统管理（总览 + 各子页）
 */

import { h, icon, dataTable, panel, badge, status, emptyState, select } from '../ui.js';
import {
  systemUsers,
  systemRoles,
  systemPermissions,
  systemStorage,
  systemAudit,
  systemReleases,
  systemDatabaseStats,
} from '../mock/data.js';

const SUB_PAGES = [
  { id: 'dashboard', label: '总览', href: '#/system' },
  { id: 'users', label: '用户管理', href: '#/system/users' },
  { id: 'roles', label: '角色权限', href: '#/system/roles' },
  { id: 'permissions', label: '权限目录', href: '#/system/permissions' },
  { id: 'storage', label: '对象存储', href: '#/system/storage' },
  { id: 'audit', label: '审计日志', href: '#/system/audit' },
  { id: 'releases', label: '发布记录', href: '#/system/releases' },
  { id: 'database-stats', label: '数据库统计', href: '#/system/database-stats' },
];

const AUDIT_ACTIONS = ['创建工作项', '更新工作项', '加入项目', '上传附件', '修改角色'];

/** 审计页筛选写入 URL，保持可分享与刷新可还原。 */
function applySystemFilter(patch) {
  const raw = window.location.hash.replace(/^#/, '') || '/system/audit';
  const [pathname, search = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  Object.assign(query, patch);

  for (const [key, value] of Object.entries(query)) {
    if (!value) delete query[key];
  }

  const next = Object.keys(query).length ? `${pathname}?${new URLSearchParams(query).toString()}` : pathname;
  window.location.hash = `#${next}`;
}

export function renderSystem(subPage, params, query) {
  const active = subPage || 'dashboard';
  const actionFilter = (query.action || '').trim();
  const targetTypeFilter = (query.target_type || '').trim();

  const nav = h(
    'div',
    { class: 'tabs' },
    SUB_PAGES.map((item) =>
      h(
        'a',
        {
          class: 'tab',
          href: item.href,
          'aria-selected': item.id === active ? 'true' : 'false',
          style: { textDecoration: 'none' },
        },
        item.label,
      ),
    ),
  );

  let content;

  if (active === 'users') {
    content = panel({
      title: '用户列表',
      desc: `共 ${systemUsers.length} 个账号`,
      actions: h('button', { class: 'btn btn--sm btn--primary', type: 'button' }, icon('i-plus'), '新建用户'),
      body: dataTable(
        [
          { key: 'username', label: '用户名', cellClass: 'table__key' },
          { key: 'display_name', label: '姓名' },
          { key: 'role', label: '角色', render: (row) => badge(row.role, row.role === '超级管理员' ? 'brand' : 'plain') },
          { key: 'department', label: '部门', cellClass: 'table__muted' },
          { key: 'status', label: '状态', render: (row) => status(row.status, row.status === '启用' ? 'success' : 'neutral') },
          { key: 'last_login', label: '最近登录', cellClass: 'table__muted' },
          {
            key: 'action',
            label: '操作',
            align: 'right',
            render: () => h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, icon('i-more')),
          },
        ],
        systemUsers,
      ),
      flush: true,
    });
  } else if (active === 'roles') {
    content = panel({
      title: '角色列表',
      desc: '角色决定成员在项目内的可见范围与操作权限',
      actions: h('button', { class: 'btn btn--sm btn--primary', type: 'button' }, icon('i-plus'), '新建角色'),
      body: dataTable(
        [
          { key: 'name', label: '角色' },
          { key: 'description', label: '说明', cellClass: 'table__muted' },
          { key: 'scope', label: '生效范围', render: (row) => badge(row.scope, row.scope === '全局' ? 'brand' : 'plain') },
          { key: 'members', label: '成员数', align: 'right' },
          {
            key: 'action',
            label: '操作',
            align: 'right',
            render: () => h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, '配置权限'),
          },
        ],
        systemRoles,
      ),
      flush: true,
    });
  } else if (active === 'permissions') {
    content = panel({
      title: '权限目录',
      desc: '权限点由后端定义，前端只做展示与角色关联',
      body: dataTable(
        [
          { key: 'code', label: '权限标识', cellClass: 'table__key' },
          { key: 'name', label: '权限名称' },
          { key: 'scope', label: '生效范围', render: (row) => badge(row.scope, row.scope === '全局' ? 'brand' : 'plain') },
        ],
        systemPermissions,
      ),
      flush: true,
    });
  } else if (active === 'storage') {
    content = panel({
      title: '对象存储',
      desc: '附件与导出文件按前缀分片存放',
      body: dataTable(
        [
          { key: 'key', label: '存储前缀', cellClass: 'table__key' },
          { key: 'objects', label: '对象数', align: 'right' },
          { key: 'size', label: '占用', align: 'right' },
          { key: 'updated_at', label: '最近更新', cellClass: 'table__muted' },
        ],
        systemStorage,
      ),
      flush: true,
    });
  } else if (active === 'audit') {
    const auditRows = systemAudit.filter((entry) => {
      if (actionFilter && entry.action !== actionFilter) return false;
      if (targetTypeFilter && entry.target_type !== targetTypeFilter) return false;
      return true;
    });

    content = h(
      'div',
      { class: 'stack' },
      panel({
        title: '筛选条件',
        desc: '按操作人、动作与对象类型定位记录',
        clip: false,
        body: h(
          'div',
          { class: 'filter-bar' },
          h(
            'div',
            { class: 'field field--wide' },
            h('span', { class: 'field__label' }, '操作人'),
            h('input', { class: 'input', type: 'search', placeholder: '按用户名筛选', 'aria-label': '按用户名筛选' }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field__label' }, '动作'),
            select({
              value: actionFilter,
              ariaLabel: '按动作筛选',
              items: [{ value: '', label: '全部动作' }, ...AUDIT_ACTIONS.map((action) => ({ value: action, label: action }))],
              onChange: (value) => applySystemFilter({ action: value }),
            }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field__label' }, '对象类型'),
            select({
              value: targetTypeFilter,
              ariaLabel: '按对象类型筛选',
              items: [
                { value: '', label: '全部类型' },
                { value: 'requirement', label: '需求' },
                { value: 'work_item', label: '工作项' },
                { value: 'project', label: '项目' },
                { value: 'role', label: '角色' },
              ],
              onChange: (value) => applySystemFilter({ target_type: value }),
            }),
          ),
          h(
            'div',
            { class: 'filter-bar__actions' },
            h(
              'button',
              { class: 'btn btn--secondary', type: 'button', onclick: () => applySystemFilter({ action: '', target_type: '' }) },
              icon('i-refresh'),
              '重置',
            ),
          ),
        ),
      }),
      panel({
        title: '审计记录',
        desc: `共 ${auditRows.length} 条`,
        body: dataTable(
          [
            { key: 'actor', label: '操作人' },
            { key: 'action', label: '动作', render: (row) => badge(row.action, 'plain') },
            { key: 'target_type', label: '对象类型', cellClass: 'table__muted' },
            { key: 'target_id', label: '对象', cellClass: 'table__key' },
            { key: 'ip', label: '来源 IP', cellClass: 'table__muted' },
            { key: 'created_at', label: '时间', cellClass: 'table__muted' },
          ],
          auditRows,
        ),
        flush: true,
      }),
    );
  } else if (active === 'releases') {
    content = panel({
      title: '发布记录',
      desc: '桌面端安装包与预览版本',
      body: dataTable(
        [
          { key: 'version', label: '版本', cellClass: 'table__key' },
          { key: 'channel', label: '通道', render: (row) => badge(row.channel, row.channel === '正式' ? 'brand' : 'sand') },
          { key: 'status', label: '状态', render: (row) => status(row.status, row.status === '已发布' ? 'success' : 'warning') },
          { key: 'note', label: '说明' },
          { key: 'size', label: '大小', align: 'right', cellClass: 'table__muted' },
          { key: 'published_at', label: '发布时间', cellClass: 'table__muted' },
          {
            key: 'action',
            label: '操作',
            align: 'right',
            render: () => h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, icon('i-download'), '下载'),
          },
        ],
        systemReleases,
      ),
      flush: true,
    });
  } else if (active === 'database-stats') {
    content = panel({
      title: '数据库统计',
      desc: '只读统计，不提供在线编辑',
      body: dataTable(
        [
          { key: 'name', label: '数据表', cellClass: 'table__key' },
          { key: 'rows', label: '记录数', align: 'right' },
          { key: 'size', label: '占用', align: 'right', cellClass: 'table__muted' },
        ],
        systemDatabaseStats,
      ),
      flush: true,
    });
  } else {
    content = h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'metrics' },
        h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '用户总数'), h('div', { class: 'metric__value' }, String(systemUsers.length)))),
        h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '角色数'), h('div', { class: 'metric__value' }, String(systemRoles.length)))),
        h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '权限点'), h('div', { class: 'metric__value' }, String(systemPermissions.length)))),
        h('div', { class: 'metric' }, h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '对象存储'), h('div', { class: 'metric__value', style: { fontSize: 'var(--fs-16)' } }, '7.3 GB'))),
      ),
      h(
        'div',
        { class: 'grid grid--2' },
        panel({
          title: '最近审计',
          desc: '最近 5 条',
          actions: h('a', { class: 'btn btn--sm btn--ghost', href: '#/system/audit' }, '全部'),
          body: h(
            'div',
            { class: 'stack stack--sm' },
            systemAudit.slice(0, 5).map((entry) =>
              h(
                'div',
                { class: 'list-row', style: { padding: '6px 0', borderBottom: '0' } },
                h('span', { class: 'list-row__main' }, entry.action, h('span', { class: 'table__muted' }, ` · ${entry.target_id}`)),
                h('span', { class: 'list-row__side table__muted' }, entry.created_at),
              ),
            ),
          ),
        }),
        panel({
          title: '发布状态',
          body: h(
            'div',
            { class: 'stack stack--sm' },
            systemReleases.map((release) =>
              h(
                'div',
                { class: 'list-row', style: { padding: '6px 0', borderBottom: '0' } },
                h('span', { class: 'list-row__main' }, release.version, h('span', { class: 'table__muted' }, ` · ${release.note}`)),
                h('span', { class: 'list-row__side' }, badge(release.status, release.status === '已发布' ? 'success' : 'warning')),
              ),
            ),
          ),
        }),
      ),
    );
  }

  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h('h1', { class: 'page-head__title' }, '系统管理'),
        h('p', { class: 'page-head__desc' }, '用户、角色、对象存储、审计与发布的统一入口。'),
      ),
    ),
    nav,
    content,
  );
}
