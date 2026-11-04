/*
 * 元策 UI v3 · 工作项详情
 */

import { h, icon, panel, status, priority, badge, avatar, emptyState } from '../ui.js';
import { workItemDetail, workItemComments, workItemAttachments } from '../mock/data.js';

const STATUS_VARIANT = {
  待处理: 'warning',
  进行中: 'info',
  待确认: 'progress',
  已完成: 'success',
  已关闭: 'neutral',
};

const PRIORITY_VARIANT = { 高: 'high', 中: 'medium', 低: 'low' };

const TYPE_LABEL = { requirement: '需求', task: '任务', bug: 'Bug' };

export function renderWorkItemDetail(params) {
  const item = workItemDetail;

  const comments = h(
    'div',
    null,
    workItemComments.map((comment) =>
      h(
        'article',
        { class: 'comment' },
        avatar(comment.author, comment.author === '超级管理员' ? 'violet' : ''),
        h(
          'div',
          null,
          h(
            'div',
            { class: 'comment__head' },
            h('span', { class: 'comment__author' }, comment.author),
            h('span', { class: 'comment__time' }, comment.created_at),
          ),
          h('div', { class: 'comment__text' }, comment.body),
          h(
            'div',
            { class: 'comment__actions' },
            h('button', { class: 'comment__action', type: 'button' }, '回复'),
            h('button', { class: 'comment__action', type: 'button' }, '编辑'),
          ),
        ),
      ),
    ),
  );

  const composer = h(
    'div',
    { class: 'stack stack--sm' },
    h('textarea', { class: 'textarea', placeholder: '写下你的评论，支持 Markdown…', 'aria-label': '评论输入框' }),
    h(
      'div',
      { class: 'cluster cluster--end' },
      h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, icon('i-upload'), '附件'),
      h('button', { class: 'btn btn--sm btn--primary', type: 'button' }, '发表评论'),
    ),
  );

  const attachments = h(
    'div',
    { class: 'stack stack--sm' },
    workItemAttachments.map((attachment) =>
      h(
        'div',
        { class: 'attachment' },
        h('span', { class: 'attachment__icon' }, icon('i-file')),
        h(
          'div',
          { class: 'attachment__name' },
          h('div', null, attachment.filename),
          h('div', { class: 'table__muted' }, `${attachment.created_by} · ${attachment.created_at}`),
        ),
        h('span', { class: 'attachment__size' }, `${Math.round(attachment.byte_size / 1024)} KB`),
        h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': `下载 ${attachment.filename}` }, icon('i-download')),
      ),
    ),
  );

  const properties = h(
    'div',
    { class: 'props' },
    h('span', { class: 'props__label' }, '状态'),
    status(item.status, STATUS_VARIANT[item.status] || 'neutral'),
    h('span', { class: 'props__label' }, '优先级'),
    priority(item.priority, PRIORITY_VARIANT[item.priority] || 'low'),
    h('span', { class: 'props__label' }, '负责人'),
    h(
      'span',
      { class: 'cluster', style: { gap: '6px' } },
      avatar(item.assignee),
      h('span', null, item.assignee),
    ),
    h('span', { class: 'props__label' }, '报告人'),
    h('span', null, item.reporter),
    h('span', { class: 'props__label' }, '所属项目'),
    h('a', { href: `#/projects/${item.project_key}` }, item.project_name),
    h('span', { class: 'props__label' }, '截止日期'),
    h('span', null, item.due_date || '—'),
    h('span', { class: 'props__label' }, '创建时间'),
    h('span', { class: 'table__muted' }, item.created_at),
    h('span', { class: 'props__label' }, '最近更新'),
    h('span', { class: 'table__muted' }, item.updated_at),
  );

  return h(
    'div',
    { class: 'stack' },
    h(
      'nav',
      { class: 'breadcrumb', 'aria-label': '面包屑' },
      h('a', { href: '#/' }, '工作台'),
      h('span', { class: 'breadcrumb__sep' }, '/'),
      h('a', { href: '#/projects/P261102793662' }, item.project_name),
      h('span', { class: 'breadcrumb__sep' }, '/'),
      h('span', null, TYPE_LABEL[item.item_type] || '工作项'),
    ),
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h(
          'h1',
          { class: 'page-head__title' },
          item.title,
          badge(TYPE_LABEL[item.item_type] || '工作项', 'brand'),
        ),
        h('p', { class: 'page-head__desc' }, h('code', null, item.key), ' · 更新于 ', item.updated_at),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-edit'), '编辑'),
        h('button', { class: 'btn btn--primary', type: 'button' }, '流转状态'),
        h('button', { class: 'btn btn--icon btn--ghost', type: 'button', 'aria-label': '更多操作' }, icon('i-more')),
      ),
    ),
    h(
      'div',
      { class: 'split split--wide' },
      h(
        'div',
        { class: 'stack' },
        panel({
          title: '描述',
          body: h('div', { class: 'description', html: item.description }),
        }),
        panel({
          title: '讨论',
          desc: `${workItemComments.length} 条评论`,
          body: h('div', { class: 'stack' }, composer, comments),
        }),
        panel({
          title: '附件',
          desc: `${workItemAttachments.length} 个文件`,
          actions: h('button', { class: 'btn btn--sm btn--secondary', type: 'button' }, icon('i-upload'), '上传'),
          body: attachments,
        }),
      ),
      h(
        'aside',
        { class: 'split__aside' },
        panel({ title: '属性', body: properties }),
        panel({
          title: '关联工作项',
          body: h(
            'div',
            { class: 'stack stack--sm' },
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-TASK-24' }, icon('i-task'), '调拨单审批流状态机重构'),
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-BUG-11' }, icon('i-bug'), '跨门店核销后会员余额未实时刷新'),
          ),
        }),
      ),
    ),
  );
}
