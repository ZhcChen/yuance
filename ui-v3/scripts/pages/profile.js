/*
 * 元策 UI v3 · 个人中心
 */

import { h, icon, panel, badge, avatar, status, iconTile } from '../ui.js';
import { currentUser, personalAnalysis } from '../mock/data.js';

export function renderProfile() {
  const profile = h(
    'div',
    { class: 'cluster', style: { gap: '16px', alignItems: 'center' } },
    avatar(currentUser.display_name, 'success'),
    h(
      'div',
      null,
      h('h1', { class: 'page-head__title' }, currentUser.display_name, badge('超级管理员', 'brand')),
      h('p', { class: 'page-head__desc' }, `${currentUser.username} · ${currentUser.department} · ${currentUser.email}`),
    ),
  );

  const metrics = h(
    'div',
    { class: 'metrics' },
    h('div', { class: 'metric' }, iconTile('i-inbox', 'brand'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的需求'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.requirement)))),
    h('div', { class: 'metric' }, iconTile('i-task', 'info'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的任务'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.task)))),
    h('div', { class: 'metric' }, iconTile('i-bug', 'danger'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '我的 Bug'), h('div', { class: 'metric__value' }, String(personalAnalysis.mine.bug)))),
    h('div', { class: 'metric' }, iconTile('i-calendar', 'violet'), h('div', { class: 'metric__body' }, h('div', { class: 'metric__label' }, '当前迭代'), h('div', { class: 'metric__value', style: { fontSize: 'var(--fs-16)' } }, personalAnalysis.cycle))),
  );

  const account = h(
    'div',
    { class: 'props' },
    h('span', { class: 'props__label' }, '用户名'),
    h('span', { class: 'u-mono' }, currentUser.username),
    h('span', { class: 'props__label' }, '角色'),
    h('span', null, currentUser.role),
    h('span', { class: 'props__label' }, '部门'),
    h('span', null, currentUser.department),
    h('span', { class: 'props__label' }, '账号状态'),
    status('正常', 'success'),
  );

  const preferences = h(
    'div',
    { class: 'stack stack--sm' },
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '登录后默认进入工作台'),
      h('span', { class: 'list-row__side' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'true' })),
    ),
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '表格默认显示已关闭的工作项'),
      h('span', { class: 'list-row__side' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false' })),
    ),
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '接收邮件摘要（每日 09:00）'),
      h('span', { class: 'list-row__side' }, h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'true' })),
    ),
  );

  const myProjects = h(
    'div',
    { class: 'stack stack--sm' },
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '零售系统'),
      h('span', { class: 'list-row__side' }, badge(`我的待处理 ${personalAnalysis.mine.requirement + personalAnalysis.mine.task + personalAnalysis.mine.bug}`, 'brand')),
    ),
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '元策（项目管理）'),
      h('span', { class: 'list-row__side' }, badge('我的待处理 12', 'plain')),
    ),
    h(
      'div',
      { class: 'list-row', style: { borderBottom: '0' } },
      h('span', { class: 'list-row__main' }, '社区团购（SaaS 版本）'),
      h('span', { class: 'list-row__side' }, badge('我的待处理 8', 'plain')),
    ),
  );

  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'page-head' }, h('div', { class: 'page-head__text' }, profile)),
    metrics,
    h(
      'div',
      { class: 'grid grid--2' },
      panel({ title: '账号信息', body: account }),
      panel({ title: '我的项目', desc: '按待处理数量排序', body: myProjects }),
    ),
    panel({ title: '偏好设置', body: preferences }),
  );
}
