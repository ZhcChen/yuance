// @ts-check

export const SECTION_ATTRIBUTE = 'data-yuance-section-id';
const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const legacyHeadingIds = new WeakMap();

/** @param {string} value */
export function isRichTextSectionId(value) {
  return /^yuance-section-[A-Za-z0-9_-]{1,80}$/u.test(value);
}

/** @param {string} href */
export function richTextSectionFragment(href) {
  if (!href.startsWith('#')) return null;
  try { return decodeURIComponent(href.slice(1)); } catch { return ''; }
}

/** @param {string} label @param {number} index */
export function richTextHeadingId(label, index) {
  const slug = label.trim().toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64);
  return `resource-heading-${index + 1}-${slug || 'section'}`;
}

/** @param {HTMLElement} root @param {boolean} [persist] @param {Crypto} [crypto] */
export function normalizeRichTextSections(root, persist = false, crypto = root.ownerDocument.defaultView?.crypto) {
  const nodes = [...root.querySelectorAll(HEADINGS)];
  const reserved = new Set(nodes.map((node) => node.getAttribute(SECTION_ATTRIBUTE) || '').filter(isRichTextSectionId));
  const used = new Set();
  const legacy = new Map();
  const sections = nodes.map((node, index) => {
    let id = node.getAttribute(SECTION_ATTRIBUTE) || '';
    const wasLegacy = !isRichTextSectionId(id);
    if (!isRichTextSectionId(id) || used.has(id)) {
      if (persist && !crypto) throw new Error('章节标识生成需要当前编辑器的 Crypto 能力。');
      const base = `yuance-section-legacy-${index + 1}`;
      id = persist ? `yuance-section-${crypto?.randomUUID()}` : base;
      let collision = 1;
      while (reserved.has(id) || used.has(id)) id = persist ? `yuance-section-${crypto?.randomUUID()}` : `${base}-${collision++}`;
      node.setAttribute(SECTION_ATTRIBUTE, id);
    }
    used.add(id);
    const label = node.textContent?.trim() || `章节 ${index + 1}`;
    if (wasLegacy) legacy.set(richTextHeadingId(label, index), id);
    if (wasLegacy && !persist) legacyHeadingIds.set(node, richTextHeadingId(label, index));
    if (persist) legacyHeadingIds.delete(node);
    return { id, level: Number(node.tagName.slice(1)), label };
  });
  if (persist) for (const link of root.querySelectorAll('a[href^="#"]')) {
    const id = legacy.get(richTextSectionFragment(link.getAttribute('href') || ''));
    if (id) link.setAttribute('href', `#${id}`);
  }
  return sections;
}

/** @param {HTMLElement} root @param {string} id */
export function findRichTextSection(root, id) {
  const nodes = [...root.querySelectorAll(HEADINGS)];
  return nodes.find((node) => node.getAttribute(SECTION_ATTRIBUTE) === id)
    || nodes.find((node) => legacyHeadingIds.get(node) === id)
    || null;
}

/** @param {HTMLDivElement} content @param {string} id */
export function scrollToRichTextSection(content, id) {
  const target = findRichTextSection(content, id);
  if (!target) return false;
  const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 24;
  content.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  return true;
}
