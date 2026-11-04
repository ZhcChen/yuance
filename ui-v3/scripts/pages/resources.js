/*
 * 元策 UI v3 · 资料库与资料详情
 */

import { h, icon, dataTable, panel, badge, avatar, emptyState } from '../ui.js';
import { resources, resourceDetail } from '../mock/data.js';

export function renderResources() {
  const table = dataTable(
    [
      { key: 'title', label: '名称', render: (row) => h('a', { class: 'table__title', href: `#/resources/${row.id}` }, row.title) },
      { key: 'type', label: '类型', render: (row) => badge(row.type, row.type === '原型' ? 'violet' : 'plain') },
      { key: 'author', label: '作者', cellClass: 'table__muted' },
      { key: 'chapters', label: '章节', align: 'right' },
      { key: 'size', label: '大小', align: 'right', cellClass: 'table__muted' },
      { key: 'updated_at', label: '更新', cellClass: 'table__muted' },
      {
        key: 'action',
        label: '操作',
        align: 'right',
        render: () => h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, icon('i-more')),
      },
    ],
    resources,
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
        h('h1', { class: 'page-head__title' }, '资料库'),
        h('p', { class: 'page-head__desc' }, '当前项目「零售系统」下的全部资料，可与工作项双向关联。'),
      ),
      h('div', { class: 'page-head__actions' }, h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-upload'), '上传资料')),
    ),
    h(
      'div',
      { class: 'split' },
      panel({ title: '资料目录', desc: `${resources.length} 份资料`, body: table, flush: true }),
      h(
        'aside',
        { class: 'split__aside' },
        panel({
          title: '资料类型',
          body: h(
            'div',
            { class: 'stack stack--sm' },
            h('div', { class: 'list-row', style: { padding: '4px 0', borderBottom: '0' } }, h('span', { class: 'list-row__main' }, '文档'), h('span', { class: 'list-row__side' }, '3')),
            h('div', { class: 'list-row', style: { padding: '4px 0', borderBottom: '0' } }, h('span', { class: 'list-row__main' }, '原型'), h('span', { class: 'list-row__side' }, '1')),
            h('div', { class: 'list-row', style: { padding: '4px 0', borderBottom: '0' } }, h('span', { class: 'list-row__main' }, '附件'), h('span', { class: 'list-row__side' }, '1')),
          ),
        }),
        panel({
          title: '最近关联',
          body: h(
            'div',
            { class: 'stack stack--sm' },
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-REQ-8' }, icon('i-inbox'), '门店会员储值卡支持跨门店核销'),
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-REQ-7' }, icon('i-inbox'), '多门店库存调拨单支持二次审批'),
          ),
        }),
      ),
    ),
  );
}

export function renderResourceDetail(params) {
  const detail = resourceDetail;

  const toc = h(
    'nav',
    { class: 'stack stack--sm', 'aria-label': '目录' },
    detail.chapters.map((chapter) =>
      h(
        'a',
        {
          class: 'dropdown__item',
          href: `#chapter-${chapter.id}`,
          style: chapter.level === 2 ? { paddingLeft: '20px', fontSize: 'var(--fs-12)' } : null,
        },
        chapter.title,
      ),
    ),
  );

  const body = h(
    'div',
    { class: 'stack' },
    h('h2', { id: 'chapter-1' }, '一、产品概述'),
    h(
      'p',
      { class: 'description' },
      '零售系统面向连锁门店的日常经营，涵盖商品、库存、收银与会员四个核心域。本文档描述各域的业务边界、关键流程与口径约定，作为研发与验收的共同依据。',
    ),
    h('h3', { id: 'chapter-2' }, '1.1 目标用户'),
    h(
      'p',
      { class: 'description' },
      '门店店长负责日常运营与库存核对，收银员处理前台交易，区域经理负责跨店调拨与业绩复盘，总部运营负责商品与会员策略配置。',
    ),
    h('h3', { id: 'chapter-3' }, '1.2 核心场景'),
    h(
      'ul',
      { class: 'description' },
      h('li', null, '开业前：商品档案初始化、门店库存导入'),
      h('li', null, '营业中：收银结算、会员核销、临时调拨'),
      h('li', null, '闭店后：日报核对、异常订单复核'),
    ),
    h('h2', { id: 'chapter-7' }, '三、会员域'),
    h(
      'p',
      { class: 'description' },
      '会员域包含储值卡、积分与等级三部分。储值卡余额在全连锁门店实时可用，核销后会员中心余额即时刷新，延迟不超过 1 秒。',
    ),
    h('h2', { id: 'chapter-10' }, '四、库存与调拨'),
    h(
      'p',
      { class: 'description' },
      '调拨单支持二次审批，驳回后库存快照需同步刷新，避免门店按过期库存继续拣货。',
    ),
  );

  return h(
    'div',
    { class: 'stack' },
    h(
      'nav',
      { class: 'breadcrumb', 'aria-label': '面包屑' },
      h('a', { href: '#/resources' }, '资料库'),
      h('span', { class: 'breadcrumb__sep' }, '/'),
      h('span', null, detail.title),
    ),
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'page-head__text' },
        h('h1', { class: 'page-head__title' }, detail.title, badge(detail.type, 'violet')),
        h('p', { class: 'page-head__desc' }, `${detail.author} · 更新于 ${detail.updated_at} · ${detail.chapters.length} 章节`),
      ),
      h(
        'div',
        { class: 'page-head__actions' },
        h('button', { class: 'btn btn--secondary', type: 'button' }, icon('i-link'), '关联工作项'),
        h('button', { class: 'btn btn--primary', type: 'button' }, icon('i-download'), '下载'),
      ),
    ),
    h(
      'div',
      { class: 'split split--wide' },
      panel({ body }),
      h(
        'aside',
        { class: 'split__aside' },
        panel({ title: '目录', body: toc }),
        panel({
          title: '关联工作项',
          body: h(
            'div',
            { class: 'stack stack--sm' },
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-REQ-8' }, icon('i-inbox'), '门店会员储值卡支持跨门店核销'),
            h('a', { class: 'dropdown__item', href: '#/work-items/P260709472030-REQ-7' }, icon('i-inbox'), '多门店库存调拨单支持二次审批'),
          ),
        }),
      ),
    ),
  );
}
