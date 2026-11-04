/*
 * 元策 UI v3 · DOM 构建原语
 * 无框架依赖。用 h() 拼装节点，用 icon() 引用 SVG 符号表。
 */

/**
 * 创建元素。
 * @param {string} tag 标签名
 * @param {object|null} props 属性；class/dataset/style/on* 有特殊处理
 * @param {...any} children 子节点（元素、数组、字符串、null）
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);

  if (props && typeof props === 'object' && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;

      if (key === 'class') {
        node.className = value;
      } else if (key === 'dataset') {
        Object.assign(node.dataset, value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key === 'ref' && typeof value === 'function') {
        value(node);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  } else if (props !== undefined && props !== null) {
    children.unshift(props);
  }

  appendAll(node, children);
  return node;
}

function appendAll(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * 引用 SVG 符号表中的图标。
 * @param {string} id 符号 id，形如 "i-home"
 * @param {string} [extraClass] 附加类名
 * @returns {SVGSVGElement}
 */
export function icon(id, extraClass = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', extraClass ? `icon ${extraClass}` : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `assets/icons.svg#${id}`);
  svg.appendChild(use);
  return svg;
}

/** 清空并返回节点。 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 把节点渲染进容器。 */
export function mount(container, node) {
  clear(container);
  container.appendChild(node);
  return container;
}

/* ===================== 常用小部件 ===================== */

export function badge(label, variant = 'neutral') {
  return h('span', { class: `badge badge--${variant}` }, label);
}

/**
 * 状态点 + 文字。颜色只是辅助，语义由文字承担。
 * @param {string} label 状态文字
 * @param {string} [variant] success / warning / danger / info / progress / neutral
 */
export function status(label, variant = 'neutral') {
  return h('span', { class: `status status--${variant}` }, h('span', { class: 'status__dot' }), label);
}

/**
 * 优先级标记。形状区分高低，不单靠颜色。
 * @param {string} label 优先级文字
 * @param {string} [variant] high / medium / low
 */
export function priority(label, variant = 'low') {
  return h('span', { class: `priority priority--${variant}` }, h('span', { class: 'priority__mark' }), label);
}

export function avatar(name, variant = '') {
  const initial = (name || '?').trim().charAt(0);
  return h('span', { class: `avatar${variant ? ` avatar--${variant}` : ''}`, title: name }, initial);
}

/** 空态。 */
export function emptyState(iconId, title, desc) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconId)),
    h('p', { class: 'empty__title' }, title),
    desc ? h('p', { class: 'empty__desc' }, desc) : null,
  );
}

/** 面板容器。 */
export function panel({ title, desc, actions, body, flush = false, foot = null }) {
  return h(
    'section',
    { class: 'panel' },
    title
      ? h(
          'header',
          { class: 'panel__head' },
          h('h2', { class: 'panel__title' }, title),
          desc ? h('span', { class: 'panel__desc' }, desc) : null,
          actions ? h('div', { class: 'panel__actions' }, actions) : null,
        )
      : null,
    h('div', { class: `panel__body${flush ? ' panel__body--flush' : ''}` }, body),
    foot ? h('footer', { class: 'panel__foot' }, foot) : null,
  );
}

/** 指标条中的一项。 */
export function metric({ label, value, delta, iconId, variant = '' }) {
  return h(
    'div',
    { class: `metric${variant ? ` metric--${variant}` : ''}` },
    h('span', { class: 'metric__icon' }, icon(iconId)),
    h(
      'div',
      { class: 'metric__body' },
      h('div', { class: 'metric__label' }, label),
      h('div', { class: 'metric__value' }, value),
      delta ? h('div', { class: 'metric__delta' }, delta) : null,
    ),
  );
}

/**
 * 构造数据表格。
 * @param {{key:string,label:string,align?:string,width?:string}[]} columns 列定义
 * @param {object[]} rows 行数据
 * @param {{empty?:object, onRowClick?:Function, rowKey?:Function}} [options]
 */
export function dataTable(columns, rows, options = {}) {
  const { empty, onRowClick } = options;

  if (!rows.length && empty) {
    return emptyState(empty.icon || 'i-inbox', empty.title || '暂无数据', empty.desc || '');
  }

  const head = h(
    'thead',
    null,
    h(
      'tr',
      null,
      columns.map((column) =>
        h('th', { class: column.align === 'right' ? 'table__num' : '', style: column.width ? { width: column.width } : null }, column.label),
      ),
    ),
  );

  const body = h(
    'tbody',
    null,
    rows.map((row, index) => {
      const tr = h(
        'tr',
        { dataset: { index: String(index) } },
        columns.map((column) => {
          const value = column.render ? column.render(row, index) : row[column.key];
          return h(
            'td',
            { class: column.align === 'right' ? 'table__num' : (column.cellClass || '') },
            value === null || value === undefined ? '' : value,
          );
        }),
      );
      if (onRowClick) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (event) => {
          if (event.target.closest('a, button, input, select, textarea')) return;
          onRowClick(row, index);
        });
      }
      return tr;
    }),
  );

  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, head, body));
}

/** 分页条。 */
export function pagination(total, page, pageSize, onChange) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const items = [];

  for (let i = 1; i <= pages; i += 1) {
    items.push(
      h(
        'button',
        {
          class: 'pagination__page',
          type: 'button',
          'aria-current': i === page ? 'page' : null,
          onclick: () => onChange(i),
        },
        String(i),
      ),
    );
  }

  return h(
    'div',
    { class: 'cluster cluster--between' },
    h(
      'span',
      null,
      `共 ${total} 条 · 第 ${page} / ${pages} 页`,
    ),
    h('div', { class: 'pagination' }, items),
  );
}
