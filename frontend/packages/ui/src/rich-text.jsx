// @ts-check
/* global setTimeout, clearTimeout */

import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { AttachmentImage } from './attachment-image.jsx';

const EDITOR_TAGS = ['a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'source', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'video'];
const EDITOR_ATTRIBUTES = ['alt', 'contenteditable', 'controls', 'data-yuance-align', 'data-yuance-attachment-id', 'data-yuance-attachment-kind', 'data-yuance-file-ext', 'data-yuance-file-kind', 'data-yuance-mention-display-name', 'data-yuance-mention-username', 'href', 'loading', 'playsinline', 'preload', 'src', 'style', 'title'];
const CONTENT_TAGS = EDITOR_TAGS;
const CONTENT_ATTRIBUTES = EDITOR_ATTRIBUTES.filter((attribute) => attribute !== 'contenteditable');
const RICH_TEXT_CSS_PROPERTIES = ['color', 'font-size'];
const RICH_TEXT_COLORS = [
  { label: '深红', value: '#d92d20' },
  { label: '朱红', value: '#e5484d' },
  { label: '珊瑚', value: '#f97066' },
  { label: '粉红', value: '#ee46bc' },
  { label: '玫红', value: '#c11574' },
  { label: '橙色', value: '#f76808' },
  { label: '琥珀', value: '#f79009' },
  { label: '金黄', value: '#fdb022' },
  { label: '柠檬', value: '#fec84b' },
  { label: '棕橙', value: '#b54708' },
  { label: '草绿', value: '#66c61a' },
  { label: '绿色', value: '#12b76a' },
  { label: '深绿', value: '#0e7a3d' },
  { label: '翠绿', value: '#039855' },
  { label: '墨绿', value: '#027a48' },
  { label: '青色', value: '#06aed4' },
  { label: '青绿', value: '#0e9384' },
  { label: '天蓝', value: '#2e90fa' },
  { label: '蓝色', value: '#1570ef' },
  { label: '深蓝', value: '#175cd3' },
  { label: '藏蓝', value: '#194185' },
  { label: '靛蓝', value: '#6172f3' },
  { label: '紫蓝', value: '#3538cd' },
  { label: '紫色', value: '#a060f6' },
  { label: '紫罗兰', value: '#7a5af8' },
  { label: '深紫', value: '#6941c6' },
  { label: '浅灰', value: '#98a2b3' },
  { label: '中灰', value: '#667085' },
  { label: '灰色', value: '#475467' },
  { label: '墨灰', value: '#344054' },
  { label: '炭灰', value: '#1d2939' },
  { label: '黑色', value: '#101828' },
];
const RICH_TEXT_BLOCK_OPTIONS = [
  { value: 'p', label: '正文' },
  { value: 'h1', label: '标题 1' },
  { value: 'h2', label: '标题 2' },
  { value: 'h3', label: '标题 3' },
];
const RICH_TEXT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '正常' },
  { value: 'large', label: '大' },
  { value: 'x-large', label: '特大' },
];
const DOCUMENT_FILE_TYPES = ['doc', 'txt', 'log', 'md', 'json', 'xml', 'yaml', 'yml', 'csv', 'xls', 'xlsx', 'ods', 'ppt', 'docx', 'pptx', 'pdf'];

/** @typedef {{ source: string, release?: () => void | Promise<void> }} RichTextResolvedSource */

/**
 * 正文内图片的异步预览源容器，复用统一 AttachmentImage 三态显示。
 *
 * @param {{
 *   attachmentId: number,
 *   alt?: string,
 *   initialSrc?: string,
 *   resolve?: ((attachmentId: number) => Promise<RichTextResolvedSource>) | null,
 * }} props
 */
function RichMediaImage({ attachmentId, alt = '', initialSrc = '', resolve = null }) {
  const [source, setSource] = useState(initialSrc);
  const [failed, setFailed] = useState(false);
  const releaseRef = useRef(/** @type {(() => void | Promise<void>) | null} */ (null));

  useEffect(() => {
    if (!resolve) return undefined;
    let active = true;
    setFailed(false);
    setSource(initialSrc);
    void resolve(attachmentId).then((resolved) => {
      if (!active) { releaseResolvedSource(resolved); return; }
      releaseRef.current = resolved.release || null;
      setSource(resolved.source);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (releaseRef.current) {
        const release = releaseRef.current;
        releaseRef.current = null;
        releaseResolvedSource({ source: '', release });
      }
    };
  }, [attachmentId, initialSrc, resolve]);

  return (
    <AttachmentImage
      className="yc-rich-media-root"
      src={failed ? '' : source}
      alt={alt}
      fit="contain"
      loading="eager"
      placeholder="图片加载中…"
      errorText="图片加载失败"
      error={failed}
    />
  );
}

/**
 * @param {{
 *   html: string,
 *   format?: string,
 *   emptyText?: string,
 *   onAttachmentActivate?: (attachmentId: number) => void,
 *   onFileAttachmentActivate?: (attachmentId: number, file: { href: string, title: string, fileExt: string, fileKind: string, x: number, y: number }) => void,
 *   resolveAttachmentSource?: (attachmentId: number) => Promise<RichTextResolvedSource>,
 * }} props
 *
 * 附件交互约定：左键附件统一走 onAttachmentActivate（文件附件直接预览）；
 * onFileAttachmentActivate 仅在右键文件附件时触发，用于打开操作菜单。
 */
export function RichTextContent({ html, format = 'html', emptyText = '暂无正文。', onAttachmentActivate, onFileAttachmentActivate, resolveAttachmentSource }) {
  const contentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const activateRef = useRef(onAttachmentActivate);
  const fileActivateRef = useRef(onFileAttachmentActivate);
  const resolveRef = useRef(resolveAttachmentSource);
  activateRef.current = onAttachmentActivate;
  fileActivateRef.current = onFileAttachmentActivate;
  resolveRef.current = resolveAttachmentSource;
  useEffect(() => {
    const content = contentRef.current;
    const view = content?.ownerDocument.defaultView;
    if (!content || !view || format !== 'html') return undefined;
    const sanitized = filterRichTextStyle(createDOMPurify(view).sanitize(html, { ALLOWED_TAGS: CONTENT_TAGS, ALLOWED_ATTR: CONTENT_ATTRIBUTES }), view);
    const staging = content.ownerDocument.createElement('div');
    staging.innerHTML = sanitized;
    const mediaReferences = [...staging.querySelectorAll('[data-yuance-attachment-id] img, [data-yuance-attachment-id] video')];
    if (resolveRef.current) for (const media of mediaReferences) media.removeAttribute('src');
    content.replaceChildren(...staging.childNodes);
    normalizeRichTextAttachmentFigures(content);
    for (const file of content.querySelectorAll('a[data-yuance-attachment-kind="file"]')) {
      if (!file.hasAttribute('data-yuance-file-kind') || !file.hasAttribute('data-yuance-file-ext')) {
        const filename = file.getAttribute('title') || file.textContent || '';
        file.setAttribute('data-yuance-file-kind', richFileVisualKind(filename, ''));
        file.setAttribute('data-yuance-file-ext', richFileVisualBadge(filename, ''));
      }
    }
    let active = true;
    const releases = [];
    const roots = [];
    for (const media of [...content.querySelectorAll('[data-yuance-attachment-id] img, [data-yuance-attachment-id] video')]) {
      const owner = media.closest('[data-yuance-attachment-id]');
      const attachmentId = Number(owner?.getAttribute('data-yuance-attachment-id'));
      if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) continue;
      if (media.matches('img')) {
        const rootContainer = content.ownerDocument.createElement('span');
        media.replaceWith(rootContainer);
        const root = createRoot(rootContainer);
        roots.push(root);
        root.render(React.createElement(RichMediaImage, {
          attachmentId,
          alt: media.getAttribute('alt') || '',
          initialSrc: media.getAttribute('src') || '',
          resolve: resolveRef.current || null,
        }));
        continue;
      }
      const mediaElement = /** @type {HTMLMediaElement} */ (media);
      mediaElement.dataset.state = 'loading';
      const onLoaded = () => {
        if (mediaElement.isConnected) mediaElement.dataset.state = 'ready';
      };
      const onError = () => {
        if (mediaElement.isConnected) mediaElement.dataset.state = 'error';
      };
      mediaElement.addEventListener('loadeddata', onLoaded);
      mediaElement.addEventListener('error', onError);
      if (mediaElement.readyState >= 2) onLoaded();
      if (resolveRef.current) {
        void resolveRef.current(attachmentId).then((resolved) => {
          if (!active) { releaseResolvedSource(resolved); return; }
          mediaElement.setAttribute('src', resolved.source);
          if (resolved.release) releases.push(resolved.release);
        }).catch(() => { if (mediaElement.isConnected) mediaElement.dataset.state = 'error'; });
      }
    }
    const activate = (event) => {
      const target = event.target instanceof view.Element ? event.target.closest('[data-yuance-attachment-id]') : null;
      const attachmentId = Number(target?.getAttribute('data-yuance-attachment-id'));
      if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) return;
      if (target?.matches('a[data-yuance-attachment-kind="file"]') && fileActivateRef.current && !activateRef.current) {
        event.preventDefault();
        fileActivateRef.current(attachmentId, {
          href: target.getAttribute('href') || '',
          title: target.getAttribute('title') || target.textContent || '',
          fileExt: target.getAttribute('data-yuance-file-ext') || '',
          fileKind: target.getAttribute('data-yuance-file-kind') || '',
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }
      if (!activateRef.current) return;
      event.preventDefault();
      activateRef.current(attachmentId);
    };
    const openFileMenu = (event) => {
      const target = event.target instanceof view.Element ? event.target.closest('[data-yuance-attachment-id]') : null;
      const attachmentId = Number(target?.getAttribute('data-yuance-attachment-id'));
      if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) return;
      if (!target?.matches('a[data-yuance-attachment-kind="file"]') || !fileActivateRef.current) return;
      event.preventDefault();
      fileActivateRef.current(attachmentId, {
        href: target.getAttribute('href') || '',
        title: target.getAttribute('title') || target.textContent || '',
        fileExt: target.getAttribute('data-yuance-file-ext') || '',
        fileKind: target.getAttribute('data-yuance-file-kind') || '',
        x: event.clientX,
        y: event.clientY,
      });
    };
    content.addEventListener('click', activate);
    content.addEventListener('contextmenu', openFileMenu);
    return () => {
      active = false;
      content.removeEventListener('click', activate);
      content.removeEventListener('contextmenu', openFileMenu);
      for (const root of roots) root.unmount();
      for (const release of releases) releaseResolvedSource({ source: '', release });
    };
  }, [format, html, Boolean(resolveAttachmentSource)]);
  if (!html) return <p className="yc-rich-text-empty">{emptyText}</p>;
  if (format !== 'html') return <div className="yc-rich-text-content yc-rich-text-plain">{html}</div>;
  return <div ref={contentRef} className="yc-rich-text-content" />;
}

/** @param {RichTextResolvedSource} resolved */
function releaseResolvedSource(resolved) {
  if (!resolved.release) return;
  try { void Promise.resolve(resolved.release()).catch(() => {}); } catch { /* Host capability cleanup is best-effort. */ }
}

/** @param {string} value */
export function plainTextToRichHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .split(/\r?\n/u)
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
}

/** @param {string} value */
export function richTextHasContent(value) {
  return /<(?:hr|img|video)\b/iu.test(value) || value.replace(/<[^>]*>/gu, '').replaceAll('&nbsp;', ' ').trim().length > 0;
}

/** @param {string} value */
export function richTextAttachmentIds(value) {
  const ids = new Set();
  for (const match of value.matchAll(/\bdata-yuance-attachment-id\s*=\s*["']([1-9][0-9]*)["']/giu)) ids.add(Number(match[1]));
  return [...ids];
}

/** @param {RichTextAttachmentOption} attachment */
export function richTextAttachmentHtml(attachment) {
  const mediaKind = attachment.contentType.startsWith('image/') ? 'image' : attachment.contentType.startsWith('video/') ? 'video' : 'file';
  const id = String(attachment.id);
  const url = escapeAttribute(attachment.url);
  const filename = escapeAttribute(attachment.filename);
  if (mediaKind === 'file') {
    const fileKind = richFileVisualKind(attachment.filename, attachment.contentType);
    const fileExt = richFileVisualBadge(attachment.filename, attachment.contentType);
    return `<a data-yuance-attachment-id="${id}" data-yuance-attachment-kind="file" data-yuance-file-kind="${fileKind}" data-yuance-file-ext="${fileExt}" data-yuance-align="left" href="${url}" title="${filename}">${escapeText(attachment.filename)}</a>`;
  }
  if (mediaKind === 'image') return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="${url}" alt="${filename}" loading="lazy"></figure>`;
  return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="video" data-yuance-align="left"><video src="${url}" controls preload="metadata" playsinline title="${filename}"></video></figure>`;
}

/** @typedef {{ id: number, filename: string, contentType: string, url: string }} RichTextAttachmentOption */
/** @typedef {{ username: string, displayName: string }} RichTextMentionOption */

/** @param {string} filename @returns {string} */
function normalizedFileExtension(filename) {
  const index = filename.lastIndexOf('.');
  if (index <= 0 || index === filename.length - 1) return '';
  return filename.slice(index + 1).trim().toLowerCase();
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function previewableDocumentFileType(filename, contentType) {
  const extension = normalizedFileExtension(filename);
  if (DOCUMENT_FILE_TYPES.includes(extension)) return extension;
  switch ((contentType || '').trim().toLowerCase()) {
    case 'application/pdf': return 'pdf';
    case 'application/msword': return 'doc';
    case 'text/plain': return 'txt';
    case 'text/markdown': return 'md';
    case 'text/csv': return 'csv';
    case 'application/vnd.ms-excel': return 'xls';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx';
    case 'application/vnd.oasis.opendocument.spreadsheet': return 'ods';
    case 'application/vnd.ms-powerpoint':
    case 'application/powerpoint':
    case 'application/x-mspowerpoint': return 'ppt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx';
    case 'application/json': return 'json';
    case 'application/xml':
    case 'text/xml': return 'xml';
    case 'application/yaml':
    case 'application/x-yaml':
    case 'text/yaml':
    case 'text/x-yaml': return 'yaml';
    default: return '';
  }
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function richFileVisualKind(filename, contentType) {
  const extension = previewableDocumentFileType(filename, contentType) || normalizedFileExtension(filename);
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'sheet';
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'slide';
  if (extension === 'pdf') return 'pdf';
  if (['txt', 'log'].includes(extension)) return 'text';
  if (['md', 'json', 'xml', 'yaml', 'yml'].includes(extension)) return 'code';
  if (['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)) return 'archive';
  return 'file';
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function richFileVisualBadge(filename, contentType) {
  const extension = previewableDocumentFileType(filename, contentType) || normalizedFileExtension(filename);
  if (extension) return extension.slice(0, 5).toUpperCase();
  const kind = richFileVisualKind(filename, contentType);
  return { word: 'DOC', sheet: 'XLS', slide: 'PPT', pdf: 'PDF', code: 'CODE', archive: 'ZIP' }[kind] || 'FILE';
}

/** @param {string} filename @param {string} contentType @returns {boolean} */
export function isPreviewableDocumentFile(filename, contentType) {
  return Boolean(previewableDocumentFileType(filename, contentType));
}

export const DEFER_RICH_TEXT_PASTE = 'defer';

/** @typedef {{ onProgress?: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void, onError?: (message: string) => void, onDeferred?: (message: string) => void, isCurrent?: () => boolean }} RichTextPasteOptions */

/** @param {{ id: string, value: string, onChange(value: string): void, disabled?: boolean, required?: boolean, label?: string, mentionOptions?: RichTextMentionOption[], onPasteFile?: (file: File, options?: RichTextPasteOptions) => Promise<RichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE> | RichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE, onFocus?: () => void, onInputActivity?: () => void, onBlur?: () => void }} props */
export function RichTextEditor({ id, value, onChange, disabled = false, required = false, label = '资料正文', mentionOptions = [], onPasteFile, onFocus, onInputActivity, onBlur }) {
  const inputRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const mentionRangeRef = useRef(/** @type {Range | null} */ (null));
  const pasteRangeRef = useRef(/** @type {Range | null} */ (null));
  const pendingUploadsRef = useRef(/** @type {Map<string, { node: HTMLElement, file: File, cancelled: boolean, objectUrl: string, deferRetryCount: number, deferMessage: string }>} */ (new Map()));
  const pendingUploadSequenceRef = useRef(0);
  const moreTriggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const moreMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const paragraphTriggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const paragraphMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const sizeTriggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const sizeMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const colorTriggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const colorMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const toolbarRangeRef = useRef(/** @type {Range | null} */ (null));
  const moreHoverCloseTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const paragraphCloseRef = useRef(/** @type {(() => void) | null} */ (null));
  const sizeCloseRef = useRef(/** @type {(() => void) | null} */ (null));
  const colorCloseRef = useRef(/** @type {(() => void) | null} */ (null));
  const [mentionQuery, setMentionQuery] = useState(/** @type {string | null} */ (null));
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [formatState, setFormatState] = useState({ bold: false, italic: false, strikeThrough: false, unorderedList: false, orderedList: false, block: 'p', fontSize: /** @type {string | null} */ (null), color: /** @type {string | null} */ (null), align: /** @type {string | null} */ (null) });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ left: 0, top: 0, maxHeight: 480 });
  const [toolbarMenuRoot, setToolbarMenuRoot] = useState(/** @type {HTMLDivElement | null} */ (null));
  const filteredMentions = mentionQuery === null ? [] : mentionOptions
    .filter((option) => {
      const query = mentionQuery.toLocaleLowerCase();
      return option.username.toLocaleLowerCase().includes(query) || option.displayName.toLocaleLowerCase().includes(query);
    })
    .slice(0, 8);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const pendingNodes = [...input.querySelectorAll('[data-rich-pending-upload]')];
    if (pendingNodes.length) {
      // 保留上传中节点的原始位置；value 由同一编辑器发布，无需重建 DOM。
      return;
    }
    for (const node of pendingNodes) node.remove();
    const sanitized = sanitizeEditorHtml(input, value);
    if (input.innerHTML !== sanitized) input.innerHTML = sanitized;
    for (const node of pendingNodes) input.appendChild(node);
    if (sanitized !== value) onChange(sanitized);
  }, [value]);

  useEffect(() => () => {
    for (const entry of pendingUploadsRef.current.values()) {
      if (!entry.objectUrl) continue;
      try { entry.node.ownerDocument.defaultView?.URL.revokeObjectURL(entry.objectUrl); } catch { /* 卸载时释放失败可忽略。 */ }
    }
    pendingUploadsRef.current.clear();
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!input || !view || disabled) return undefined;
    const sync = () => syncFormatState();
    view.document.addEventListener('selectionchange', sync);
    input.addEventListener('keyup', sync);
    input.addEventListener('mouseup', sync);
    input.addEventListener('input', sync);
    return () => {
      view.document.removeEventListener('selectionchange', sync);
      input.removeEventListener('keyup', sync);
      input.removeEventListener('mouseup', sync);
      input.removeEventListener('input', sync);
    };
  }, [disabled]);

  useEffect(() => {
    if (!moreMenuOpen) return undefined;
    const view = moreMenuRef.current?.ownerDocument.defaultView;
    if (!view) return undefined;
    const close = () => {
      setMoreMenuOpen(false);
      clearToolbarRange();
    };
    const closeOnOutsidePointer = (event) => {
      const target = event.target instanceof view.Node ? event.target : null;
      const menus = [moreMenuRef.current, paragraphMenuRef.current, sizeMenuRef.current, colorMenuRef.current];
      const triggers = [moreTriggerRef.current, paragraphTriggerRef.current, sizeTriggerRef.current, colorTriggerRef.current];
      if (target && (menus.some((menu) => menu?.contains(target)) || triggers.some((trigger) => trigger?.contains(target)))) return;
      close();
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        moreTriggerRef.current?.focus();
      }
    };
    view.addEventListener('pointerdown', closeOnOutsidePointer);
    view.addEventListener('keydown', closeOnEscape);
    view.addEventListener('scroll', close, true);
    view.addEventListener('resize', close);
    return () => {
      view.removeEventListener('pointerdown', closeOnOutsidePointer);
      view.removeEventListener('keydown', closeOnEscape);
      view.removeEventListener('scroll', close, true);
      view.removeEventListener('resize', close);
    };
  }, [moreMenuOpen]);

  function openToolbarDropdown(exceptRef) {
    if (moreMenuOpen) closeMoreMenu();
    for (const ref of [paragraphCloseRef, sizeCloseRef, colorCloseRef]) {
      if (ref !== exceptRef) ref.current?.();
    }
    captureToolbarRange();
  }

  /** @param {string} command @param {string | undefined} [argument] */
  function execute(command, argument) {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    input.ownerDocument.execCommand(command, false, argument);
    publish(input);
    syncFormatState();
  }

  /** @param {'left' | 'center' | 'right'} alignment */
  function align(alignment) {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    const block = currentBlock(input);
    if (!block || !input.contains(block)) return;
    block.setAttribute('data-yuance-align', alignment);
    publish(input);
    syncFormatState();
  }

  function createLink() {
    const input = inputRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!view) return;
    const raw = view.prompt('输入链接地址', 'https://')?.trim() || '';
    if (!raw || !isSafeLink(raw, view.URL)) return;
    execute('createLink', raw);
  }

  function convertMarkdown() {
    const input = inputRef.current;
    if (!input) return;
    const markdown = input.textContent || '';
    input.innerHTML = sanitizeEditorHtml(input, String(marked.parse(markdown, { async: false })));
    publish(input);
    syncFormatState();
  }

  function clearFormat() {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    input.ownerDocument.execCommand('removeFormat');
    publish(input);
    syncFormatState();
  }

  function openMoreMenu() {
    const trigger = moreTriggerRef.current;
    const view = trigger?.ownerDocument.defaultView;
    if (!trigger || !view || disabled) return;
    for (const ref of [paragraphCloseRef, sizeCloseRef, colorCloseRef]) ref.current?.();
    captureToolbarRange();
    const rect = trigger.getBoundingClientRect();
    const rootRect = toolbarMenuRoot?.getBoundingClientRect() || null;
    const menuWidth = 264;
    const availableRight = rootRect ? Math.min(rootRect.right, view.innerWidth) - rootRect.left : view.innerWidth;
    const left = Math.min(Math.max(8, rect.right - (rootRect?.left || 0) - menuWidth), Math.max(8, availableRight - menuWidth - 8));
    const top = (rootRect ? rect.bottom - rootRect.top + 12 : Math.min(rect.bottom + 12, Math.max(8, view.innerHeight - 420)));
    const maxHeight = Math.min(460, (rootRect ? view.innerHeight - rootRect.top : view.innerHeight) - top - 8);
    setMoreMenuPosition({ left, top, maxHeight: Math.max(120, maxHeight) });
    setMoreMenuOpen(true);
  }

  function closeMoreMenu() {
    setMoreMenuOpen(false);
    clearToolbarRange();
  }

  function scheduleMoreMenuClose() {
    if (moreHoverCloseTimerRef.current) clearTimeout(moreHoverCloseTimerRef.current);
    moreHoverCloseTimerRef.current = setTimeout(() => {
      moreHoverCloseTimerRef.current = null;
      closeMoreMenu();
    }, 160);
  }

  function cancelMoreMenuClose() {
    if (!moreHoverCloseTimerRef.current) return;
    clearTimeout(moreHoverCloseTimerRef.current);
    moreHoverCloseTimerRef.current = null;
  }

  /** @param {React.MouseEvent<HTMLElement>} event @param {{ current: HTMLElement | null }} otherRef @returns {boolean} */
  function relatedInside(event, otherRef) {
    const view = event.currentTarget.ownerDocument.defaultView;
    const related = event.relatedTarget;
    return Boolean(view && related instanceof view.Node && otherRef.current?.contains(related));
  }

  /** @param {'p' | 'h1' | 'h2' | 'h3'} tag */
  function applyBlock(tag) {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    input.ownerDocument.execCommand('formatBlock', false, tag);
    publish(input);
    syncFormatState();
    closeMoreMenu();
  }

  /** @param {() => void} action @param {() => void} [after] */
  function applyInlineStyle(action, after) {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    const doc = input.ownerDocument;
    try {
      doc.execCommand('styleWithCSS', false, 'true');
      action();
    } finally {
      try { doc.execCommand('styleWithCSS', false, 'false'); } catch { /* 恢复浏览器默认行内格式模式。 */ }
    }
    publish(input);
    syncFormatState();
    after?.();
  }

  /** @param {string} size */
  function applyFontSize(size) {
    applyInlineStyle(() => {
      const input = inputRef.current;
      if (!input) return;
      input.ownerDocument.execCommand('fontSize', false, size);
      if (!input.querySelector('span[style*="font-size"]')) wrapSelectionInStyledSpan(input, 'font-size', size);
      normalizeInlineStyles(input);
    }, closeMoreMenu);
  }

  /** @param {string} color */
  function applyColor(color) {
    applyInlineStyle(() => inputRef.current?.ownerDocument.execCommand('foreColor', false, color), closeMoreMenu);
  }

  function clearTextColor() {
    const input = inputRef.current;
    if (!input || disabled) return;
    restoreToolbarRange();
    input.focus();
    const selection = input.ownerDocument.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const anchor = selection?.anchorNode || null;
    const element = anchor?.nodeType === 1 ? /** @type {Element} */ (anchor) : anchor?.parentElement;
    const colored = element?.closest('span[style*="color"]');
    if (range && colored && input.contains(colored)) {
      const kept = [];
      const style = colored.getAttribute('style') || '';
      for (const declaration of style.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 1) continue;
        const name = declaration.slice(0, colon).trim().toLowerCase();
        if (name === 'color') continue;
        kept.push(declaration.trim());
      }
      if (kept.length) colored.setAttribute('style', kept.join(';'));
      else colored.removeAttribute('style');
      publish(input);
      syncFormatState();
    } else {
      applyInlineStyle(() => inputRef.current?.ownerDocument.execCommand('foreColor', false, ''), closeMoreMenu);
    }
    closeMoreMenu();
  }

  function openMentionPicker() {
    const input = inputRef.current;
    if (!input || disabled || mentionOptions.length === 0) return;
    input.focus();
    mentionRangeRef.current = currentInsertionRange(input);
    setMentionQuery('');
    setMentionActiveIndex(0);
  }

  /** @param {RichTextMentionOption} option */
  function insertMention(option) {
    const input = inputRef.current;
    const range = mentionRangeRef.current;
    if (!input || !range || disabled) return;
    const mention = input.ownerDocument.createElement('span');
    mention.setAttribute('data-yuance-mention-username', option.username);
    mention.setAttribute('data-yuance-mention-display-name', option.displayName);
    mention.setAttribute('contenteditable', 'false');
    mention.textContent = `@${option.displayName}`;
    range.deleteContents();
    range.insertNode(mention);
    const spacer = input.ownerDocument.createTextNode(' ');
    mention.after(spacer);
    const selection = input.ownerDocument.getSelection();
    range.setStartAfter(spacer);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    mentionRangeRef.current = null;
    setMentionQuery(null);
    publish(input);
    syncFormatState();
  }

  /** @param {HTMLDivElement} input @returns {Element | null} */
  function currentBlock(input) {
    const selection = input.ownerDocument.getSelection();
    const anchor = selection?.anchorNode || null;
    const element = anchor?.nodeType === 1 ? /** @type {Element} */ (anchor) : anchor?.parentElement;
    return element?.closest('p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li,[data-yuance-align]') || null;
  }

  function syncFormatState() {
    const input = inputRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!input || !view) return;
    const block = currentBlock(input);
    setFormatState({
      bold: queryCommandState(input, 'bold'),
      italic: queryCommandState(input, 'italic'),
      strikeThrough: queryCommandState(input, 'strikeThrough'),
      unorderedList: queryCommandState(input, 'insertUnorderedList'),
      orderedList: queryCommandState(input, 'insertOrderedList'),
      block: currentBlockName(input),
      fontSize: selectedInlineStyle(input, 'font-size'),
      color: selectedInlineStyle(input, 'color'),
      align: block?.getAttribute('data-yuance-align') || null,
    });
  }

  function restoreToolbarRange() {
    const input = inputRef.current;
    const range = toolbarRangeRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!input || !range || !view || !input.contains(range.startContainer) || !input.contains(range.endContainer)) return;
    const selection = view.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function captureToolbarRange() {
    const input = inputRef.current;
    if (!input) return;
    toolbarRangeRef.current = currentInsertionRange(input);
    syncFormatState();
  }

  function clearToolbarRange() {
    toolbarRangeRef.current = null;
  }

  /** @param {File} file @param {Range | null} [insertRange] */
  function startPasteUpload(file, insertRange = null) {
    const input = inputRef.current;
    if (!input || disabled) return;
    const uploadId = `yuance-paste-${++pendingUploadSequenceRef.current}`;
    const entry = createPendingUploadEntry(input.ownerDocument, file, uploadId);
    pendingUploadsRef.current.set(uploadId, entry);
    insertAtSelection(input, entry.node, insertRange || pasteRangeRef.current);
    void uploadPastedFile(uploadId);
  }

  /** @param {string} uploadId */
  async function uploadPastedFile(uploadId) {
    const entry = pendingUploadsRef.current.get(uploadId);
    if (!entry || entry.cancelled || !onPasteFile) return;
    setPendingUploadState(entry.node, 'uploading', entry.deferMessage || '正在上传');
    try {
      const attachment = await Promise.resolve(onPasteFile(entry.file, {
        onProgress: (stage) => {
          const current = pendingUploadsRef.current.get(uploadId);
          if (current && !current.cancelled) {
            setPendingUploadState(current.node, 'uploading', richTextPasteStageLabel(stage));
          }
        },
        onError: (message) => {
          const current = pendingUploadsRef.current.get(uploadId);
          if (current && !current.cancelled) {
            setPendingUploadState(current.node, 'error', message || '上传失败，请重试。');
          }
        },
        onDeferred: (message) => {
          const current = pendingUploadsRef.current.get(uploadId);
          if (current && !current.cancelled) current.deferMessage = message || '';
        },
        isCurrent: () => {
          const current = pendingUploadsRef.current.get(uploadId);
          return Boolean(current && !current.cancelled);
        },
      }));
      const current = pendingUploadsRef.current.get(uploadId);
      if (!current || current.cancelled) return;
      if (attachment === DEFER_RICH_TEXT_PASTE) {
        const entry = pendingUploadsRef.current.get(uploadId);
        if (!entry) return;
        if (entry.deferRetryCount >= 1500) {
          setPendingUploadState(current.node, 'error', '等待上传条件超时，请重试。');
          return;
        }
        entry.deferRetryCount += 1;
        setPendingUploadState(current.node, 'uploading', entry.deferMessage || '等待上传条件…');
        current.node.ownerDocument.defaultView?.setTimeout(() => {
          void uploadPastedFile(uploadId);
        }, 200);
        return;
      }
      if (!attachment) {
        const existingMessage = current.node.querySelector('[data-rich-pending-overlay-status]')?.textContent || '';
        setPendingUploadState(current.node, 'error', existingMessage || '上传失败，请重试。');
        return;
      }
      const input = inputRef.current;
      if (!input || !input.isConnected) return;
      const completedNode = createAttachmentNode(input.ownerDocument, attachment);
      current.node.replaceWith(completedNode);
      cleanupPendingUploadEntry(uploadId);
      publish(input);
    } catch (caught) {
      const current = pendingUploadsRef.current.get(uploadId);
      if (!current || current.cancelled) return;
      setPendingUploadState(current.node, 'error', errorMessageText(caught) || '上传失败，请重试。');
    }
  }

  /** @param {string} uploadId */
  function retryPendingUpload(uploadId) {
    const entry = pendingUploadsRef.current.get(uploadId);
    if (entry) {
      entry.deferRetryCount = 0;
      entry.deferMessage = '';
    }
    void uploadPastedFile(uploadId);
  }

  /** @param {string} uploadId */
  function removePendingUpload(uploadId) {
    const entry = pendingUploadsRef.current.get(uploadId);
    if (!entry) return;
    entry.cancelled = true;
    entry.node.remove();
    cleanupPendingUploadEntry(uploadId);
  }

  /** @param {string} uploadId */
  function cleanupPendingUploadEntry(uploadId) {
    const entry = pendingUploadsRef.current.get(uploadId);
    if (!entry) return;
    pendingUploadsRef.current.delete(uploadId);
    if (entry.objectUrl) {
      try { entry.node.ownerDocument.defaultView?.URL.revokeObjectURL(entry.objectUrl); } catch { /* 本地预览 URL 释放失败可忽略。 */ }
    }
  }

  /** @param {React.MouseEvent<HTMLDivElement>} event */
  function handlePendingUploadClick(event) {
    const view = event.currentTarget.ownerDocument.defaultView;
    const target = view && event.target instanceof view.Element ? event.target : null;
    if (!target) return;
    const node = target.closest('[data-rich-pending-upload]');
    if (!node || !event.currentTarget.contains(node)) return;
    const uploadId = node.getAttribute('data-rich-upload-id');
    if (!uploadId) return;
    if (target.closest('[data-rich-pending-retry]')) {
      event.preventDefault();
      retryPendingUpload(uploadId);
    } else if (target.closest('[data-rich-pending-remove]')) {
      event.preventDefault();
      removePendingUpload(uploadId);
    }
  }

  const currentColor = normalizeRichTextColor(formatState.color) || '#175cd3';
  return (
    <div className="yc-rich-text-root" ref={setToolbarMenuRoot}>
      <div className={`yc-rich-text-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="yc-rich-text-toolbar" role="toolbar" aria-label="富文本工具栏">
        <ToolbarDropdown
          label="段落格式"
          value={RICH_TEXT_BLOCK_OPTIONS.find((option) => option.value === formatState.block)?.label || '正文'}
          disabled={disabled}
          triggerRef={paragraphTriggerRef}
          menuRef={paragraphMenuRef}
          menuRoot={toolbarMenuRoot}
          closeRef={paragraphCloseRef}
          onOpen={() => openToolbarDropdown(paragraphCloseRef)}
          onClose={clearToolbarRange}
        >
          <div className="yc-rich-toolbar-popover-grid">
            {RICH_TEXT_BLOCK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className={`yc-rich-toolbar-popover-option${formatState.block === option.value ? ' is-active' : ''}`}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { restoreToolbarRange(); applyBlock(/** @type {'p' | 'h1' | 'h2' | 'h3'} */ (option.value)); paragraphCloseRef.current?.(); }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </ToolbarDropdown>
        <ToolbarDropdown
          label="字号"
          value={RICH_TEXT_SIZE_OPTIONS.find((option) => option.value === formatState.fontSize)?.label || '字号'}
          disabled={disabled}
          triggerRef={sizeTriggerRef}
          menuRef={sizeMenuRef}
          menuRoot={toolbarMenuRoot}
          closeRef={sizeCloseRef}
          onOpen={() => openToolbarDropdown(sizeCloseRef)}
          onClose={clearToolbarRange}
        >
          <div className="yc-rich-toolbar-popover-grid">
            {RICH_TEXT_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className={`yc-rich-toolbar-popover-option${formatState.fontSize === option.value ? ' is-active' : ''}`}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { restoreToolbarRange(); applyFontSize(option.value); sizeCloseRef.current?.(); }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </ToolbarDropdown>
        <ToolbarDropdown
          label="文字颜色"
          value=""
          disabled={disabled}
          triggerRef={colorTriggerRef}
          menuRef={colorMenuRef}
          menuRoot={toolbarMenuRoot}
          closeRef={colorCloseRef}
          onOpen={() => openToolbarDropdown(colorCloseRef)}
          onClose={clearToolbarRange}
          triggerClassName="yc-rich-toolbar-color-trigger"
          menuWidth={268}
          menuClassName="yc-rich-toolbar-color-popover"
          triggerExtra={<><svg className="yc-rich-toolbar-color-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.7C10.6 4.9 12.8 7.5 12.8 10a4.8 4.8 0 0 1-9.6 0C3.2 7.5 5.4 4.9 8 1.7Z" fill="currentColor" /></svg><span className="yc-rich-toolbar-color-mark" style={{ background: currentColor }} aria-hidden="true" /></>}
        >
          <div className="yc-rich-toolbar-color-menu">
            <section className="yc-rich-color-section" aria-label="当前颜色">
              <div className="yc-rich-color-current">
                <span className="yc-rich-color-current-swatch" style={{ background: currentColor }} aria-hidden="true" />
                <span className="yc-rich-color-current-value">{currentColor}</span>
                <button
                  type="button"
                  role="menuitem"
                  className={`yc-rich-color-default${formatState.color ? '' : ' is-active'}`}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { restoreToolbarRange(); clearTextColor(); colorCloseRef.current?.(); }}
                >
                  默认颜色
                </button>
              </div>
            </section>
            <section className="yc-rich-color-section" aria-label="预设颜色">
              <h3>预设颜色</h3>
              <div className="yc-rich-preset-colors">
                {RICH_TEXT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    role="menuitem"
                    className={`yc-rich-preset-color${normalizeRichTextColor(formatState.color) === color.value ? ' is-active' : ''}`}
                    aria-label={color.label}
                    title={color.label}
                    style={{ background: color.value }}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { restoreToolbarRange(); applyColor(color.value); colorCloseRef.current?.(); }}
                  />
                ))}
              </div>
            </section>
            <label className="yc-rich-color-custom">
              <input
                type="color"
                value={currentColor}
                disabled={disabled}
                aria-label="自定义文字颜色"
                onChange={(event) => { restoreToolbarRange(); applyColor(event.target.value); }}
              />
              <span className="yc-rich-color-custom-mark" aria-hidden="true" />
              <span>自定义颜色</span>
            </label>
          </div>
        </ToolbarDropdown>
        <span className="yc-rich-toolbar-sep" aria-hidden="true" />
        <div className="yc-rich-toolbar-group" role="group" aria-label="文本样式">
          <ToolbarButton active={formatState.bold} label="加粗" title="加粗" disabled={disabled} onClick={() => execute('bold')}><strong>B</strong></ToolbarButton>
          <ToolbarButton active={formatState.italic} label="斜体" title="斜体" disabled={disabled} onClick={() => execute('italic')}><em>I</em></ToolbarButton>
          <ToolbarButton active={formatState.strikeThrough} label="删除线" title="删除线" disabled={disabled} onClick={() => execute('strikeThrough')}><s>S</s></ToolbarButton>
        </div>
        <span className="yc-rich-toolbar-sep" aria-hidden="true" />
        <div className="yc-rich-toolbar-group" role="group" aria-label="列表">
          <ToolbarButton active={formatState.unorderedList} label="无序列表" title="无序列表" disabled={disabled} onClick={() => execute('insertUnorderedList')}>•</ToolbarButton>
          <ToolbarButton active={formatState.orderedList} label="有序列表" title="有序列表" disabled={disabled} onClick={() => execute('insertOrderedList')}>1.</ToolbarButton>
        </div>
        <span className="yc-rich-toolbar-sep" aria-hidden="true" />
        <div className="yc-rich-toolbar-group" role="group" aria-label="插入">
          <ToolbarButton label="插入链接" title="插入链接" disabled={disabled} onClick={createLink}>链接</ToolbarButton>
          <ToolbarButton label="提及成员" title="提及成员" disabled={disabled || mentionOptions.length === 0} onClick={openMentionPicker}>@</ToolbarButton>
        </div>
        <span className="yc-rich-toolbar-sep" aria-hidden="true" />
        <div className="yc-rich-toolbar-group" role="group" aria-label="对齐">
          <ToolbarButton active={formatState.align === 'left'} label="左对齐" title="左对齐" disabled={disabled} onClick={() => align('left')}>左</ToolbarButton>
          <ToolbarButton active={formatState.align === 'center'} label="居中对齐" title="居中对齐" disabled={disabled} onClick={() => align('center')}>中</ToolbarButton>
          <ToolbarButton active={formatState.align === 'right'} label="右对齐" title="右对齐" disabled={disabled} onClick={() => align('right')}>右</ToolbarButton>
        </div>
        <span className="yc-rich-toolbar-sep" aria-hidden="true" />
        <button
          ref={moreTriggerRef}
          type="button"
          className={`yc-rich-toolbar-button yc-rich-toolbar-more${moreMenuOpen ? ' is-active' : ''}`}
          aria-label="更多格式"
          title="更多格式"
          aria-haspopup="menu"
          aria-expanded={moreMenuOpen}
          disabled={disabled}
          onMouseEnter={() => { cancelMoreMenuClose(); openMoreMenu(); }}
          onMouseLeave={(event) => {
            if (relatedInside(event, moreMenuRef)) return;
            scheduleMoreMenuClose();
          }}
          onClick={() => { cancelMoreMenuClose(); openMoreMenu(); }}
        >
          更多
        </button>
      </div>
      <div
        id={id}
        ref={inputRef}
        className="yc-rich-text-input"
        contentEditable={!disabled}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        aria-required={required || undefined}
        aria-disabled={disabled || undefined}
        data-placeholder="请输入内容..."
        suppressContentEditableWarning
        onFocus={onFocus}
        onInput={(event) => {
          const context = mentionContext(event.currentTarget);
          mentionRangeRef.current = context?.range || null;
          setMentionQuery(context?.query ?? null);
          setMentionActiveIndex(0);
          publish(event.currentTarget);
          onInputActivity?.();
        }}
        onKeyDown={(event) => {
          if (mentionQuery === null) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            setMentionQuery(null);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setMentionActiveIndex((current) => filteredMentions.length ? (current + direction + filteredMentions.length) % filteredMentions.length : 0);
          } else if (event.key === 'Enter' && filteredMentions.length) {
            event.preventDefault();
            insertMention(filteredMentions[Math.min(mentionActiveIndex, filteredMentions.length - 1)]);
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            mentionRangeRef.current = null;
            setMentionQuery(null);
          }
          onBlur?.();
        }}
        onClick={handlePendingUploadClick}
        onPaste={(event) => {
          const files = pastedFiles(event.clipboardData);
          if (files.length && onPasteFile && !disabled) {
            event.preventDefault();
            const input = event.currentTarget;
            const pasteRange = currentInsertionRange(input);
            pasteRangeRef.current = pasteRange;
            void uniquePastedFilesByContent(files).then((uniqueFiles) => {
              if (input.isConnected && !disabled) {
                for (const file of uniqueFiles) startPasteUpload(file, pasteRange);
              }
              if (pasteRangeRef.current === pasteRange) pasteRangeRef.current = null;
            }).catch(() => {
              if (input.isConnected && !disabled) {
                for (const file of files) startPasteUpload(file, pasteRange);
              }
              if (pasteRangeRef.current === pasteRange) pasteRangeRef.current = null;
            });
            return;
          }
          event.preventDefault();
          if (files.length) {
            insertAtSelection(event.currentTarget, event.currentTarget.ownerDocument.createTextNode(files.map((file) => file.name).join(' ')));
          } else {
            event.currentTarget.ownerDocument.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
          }
          publish(event.currentTarget);
        }}
      />
      {mentionQuery !== null ? <div className="yc-rich-mention-panel" role="listbox" aria-label="提及候选">
        {filteredMentions.length ? filteredMentions.map((option, index) => (
          <button
            key={option.username}
            type="button"
            role="option"
            aria-selected={index === mentionActiveIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertMention(option)}
          >
            <strong>{option.displayName}</strong><span>@{option.username}</span>
          </button>
        )) : <p>没有匹配成员</p>}
      </div> : null}
      </div>
      {toolbarMenuRoot ? createPortal(moreMenuOpen ? <div ref={moreMenuRef} className="yc-rich-more-menu" role="menu" aria-label="更多格式" style={{ left: moreMenuPosition.left, top: moreMenuPosition.top, maxHeight: moreMenuPosition.maxHeight }}
        onMouseEnter={cancelMoreMenuClose}
        onMouseLeave={(event) => {
          if (relatedInside(event, moreTriggerRef)) return;
          scheduleMoreMenuClose();
        }}
      >
        <section className="yc-rich-more-section" aria-label="更多操作">
          <div className="yc-rich-more-grid yc-rich-more-actions">
            <button type="button" role="menuitem" className="yc-rich-more-option" disabled={disabled} onClick={() => { execute('formatBlock', 'blockquote'); closeMoreMenu(); }}>❝ 引用</button>
            <button type="button" role="menuitem" className="yc-rich-more-option" disabled={disabled} onClick={() => { execute('formatBlock', 'pre'); closeMoreMenu(); }}>&lt;/&gt; 代码块</button>
            <button type="button" role="menuitem" className="yc-rich-more-option" disabled={disabled} onClick={() => { convertMarkdown(); closeMoreMenu(); }}>MD 转换</button>
            <button type="button" role="menuitem" className="yc-rich-more-option" disabled={disabled} onClick={() => { clearFormat(); closeMoreMenu(); }}>清除格式</button>
          </div>
        </section>
      </div> : null, toolbarMenuRoot) : null}
    </div>
  );

  /** @param {HTMLDivElement} input */
  function publish(input) {
    const clone = /** @type {HTMLDivElement} */ (input.cloneNode(true));
    clone.querySelectorAll('[data-rich-pending-upload]').forEach((node) => node.remove());
    const sanitized = sanitizeEditorHtml(clone, clone.innerHTML);
    onChange(sanitized);
  }
}

/** @param {HTMLDivElement} input */
function currentInsertionRange(input) {
  const selection = input.ownerDocument.getSelection();
  if (selection?.rangeCount && selection.anchorNode && input.contains(selection.anchorNode)) return selection.getRangeAt(0).cloneRange();
  const range = input.ownerDocument.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  return range;
}

/** @param {HTMLDivElement} input */
function mentionContext(input) {
  const selection = input.ownerDocument.getSelection();
  const anchor = selection?.anchorNode;
  const view = input.ownerDocument.defaultView;
  if (!view || !selection?.isCollapsed || !(anchor instanceof view.Text) || !input.contains(anchor)) return null;
  const prefix = anchor.data.slice(0, selection.anchorOffset);
  const match = prefix.match(/(?:^|\s)@([\w.-]{0,64})$/u);
  if (!match) return null;
  const range = input.ownerDocument.createRange();
  range.setStart(anchor, selection.anchorOffset - match[1].length - 1);
  range.setEnd(anchor, selection.anchorOffset);
  return { query: match[1], range };
}

/** @param {Document} ownerDocument @param {RichTextAttachmentOption} attachment */
function createAttachmentNode(ownerDocument, attachment) {
  const mediaKind = attachment.contentType.startsWith('image/') ? 'image' : attachment.contentType.startsWith('video/') ? 'video' : 'file';
  const container = ownerDocument.createElement(mediaKind === 'file' ? 'a' : 'figure');
  container.setAttribute('data-yuance-attachment-id', String(attachment.id));
  container.setAttribute('data-yuance-attachment-kind', mediaKind);
  container.setAttribute('data-yuance-align', 'left');
  if (mediaKind === 'file') {
    container.setAttribute('href', attachment.url);
    container.setAttribute('title', attachment.filename);
    container.setAttribute('data-yuance-file-kind', richFileVisualKind(attachment.filename, attachment.contentType));
    container.setAttribute('data-yuance-file-ext', richFileVisualBadge(attachment.filename, attachment.contentType));
    container.textContent = attachment.filename;
    return container;
  }
  const media = ownerDocument.createElement(mediaKind === 'image' ? 'img' : 'video');
  media.setAttribute('src', attachment.url);
  if (mediaKind === 'image') { media.setAttribute('alt', attachment.filename); media.setAttribute('loading', 'lazy'); }
  else { media.setAttribute('controls', 'controls'); media.setAttribute('preload', 'metadata'); media.setAttribute('playsinline', 'playsinline'); media.setAttribute('title', attachment.filename); }
  container.appendChild(media);
  return container;
}

/** @param {string} value */
function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** @param {string} value */
function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** @param {HTMLDivElement} input @param {Element | Text} node @param {Range | null} [insertRange] */
function insertAtSelection(input, node, insertRange = null) {
  const selection = input.ownerDocument.getSelection();
  const currentRange = selection?.rangeCount && selection.anchorNode && input.contains(selection.anchorNode)
    ? selection.getRangeAt(0).cloneRange()
    : null;
  const range = insertRange || currentRange;
  if (!range || !input.contains(range.startContainer)) input.appendChild(node);
  else {
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  input.appendChild(input.ownerDocument.createElement('p')).appendChild(input.ownerDocument.createElement('br'));
}

/** @param {DataTransfer | null} clipboardData @returns {File[]} */
function pastedFiles(clipboardData) {
  if (!clipboardData) return [];
  const files = [];
  const seen = new Set();
  const addFile = (file) => {
    if (!file) return;
    // 真实剪贴板会在 items 与 files 中暴露同一张图片，lastModified 可能不一致。
    const fingerprint = `${file.type || ''}|${file.name || ''}|${file.size || 0}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    files.push(file);
  };
  const items = clipboardData.items;
  for (let index = 0; items && index < items.length; index += 1) {
    const item = items[index];
    if (item?.kind === 'file') {
      addFile(item.getAsFile());
    }
  }
  const dataFiles = clipboardData.files;
  for (let index = 0; dataFiles && index < dataFiles.length; index += 1) {
    addFile(dataFiles[index]);
  }
  return files;
}

/** @param {File} file @returns {Promise<string>} */
async function digestPastedFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv:${hash.toString(16)}`;
}

/**
 * 同一粘贴批次中，items/files 可能携带同一图片的多个包装对象；
 * 快速指纹无法覆盖不同文件名或时间戳，这里再按文件内容去重。
 *
 * @param {File[]} files
 * @returns {Promise<File[]>}
 */
async function uniquePastedFilesByContent(files) {
  if (files.length <= 1) return files;
  const seen = new Set();
  const uniqueFiles = [];
  for (const file of files) {
    let digest = '';
    try {
      digest = await digestPastedFile(file);
    } catch {
      digest = `${file.type || ''}|${file.name || ''}|${file.size || 0}`;
    }
    if (seen.has(digest)) continue;
    seen.add(digest);
    uniqueFiles.push(file);
  }
  return uniqueFiles;
}

/** @param {Document} ownerDocument @param {File} file @param {string} uploadId */
function createPendingUploadEntry(ownerDocument, file, uploadId) {
  const mediaKind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
  const node = ownerDocument.createElement(mediaKind === 'file' ? 'span' : 'figure');
  node.className = `yc-rich-pending-upload${mediaKind === 'file' ? ' yc-rich-pending-upload-file' : ' yc-rich-pending-upload-media'}`;
  node.setAttribute('data-rich-pending-upload', 'true');
  node.setAttribute('data-rich-upload-id', uploadId);
  node.setAttribute('data-upload-state', 'uploading');
  node.setAttribute('contenteditable', 'false');
  node.setAttribute('data-rich-filename', file.name);
  node.setAttribute('data-rich-content-type', file.type);
  node.setAttribute('data-rich-byte-size', String(file.size || 0));

  let objectUrl = '';
  if (mediaKind !== 'file') {
    try { objectUrl = ownerDocument.defaultView?.URL.createObjectURL(file) || ''; } catch { objectUrl = ''; }
    const media = ownerDocument.createElement(mediaKind === 'image' ? 'img' : 'video');
    media.className = 'yc-rich-pending-preview-media';
    if (objectUrl) media.setAttribute('src', objectUrl);
    if (mediaKind === 'image') {
      media.setAttribute('alt', file.name);
      media.setAttribute('loading', 'eager');
    } else {
      media.setAttribute('muted', 'muted');
      media.setAttribute('playsinline', 'playsinline');
      media.setAttribute('preload', 'metadata');
      media.setAttribute('title', file.name);
    }
    const preview = ownerDocument.createElement('span');
    preview.className = 'yc-rich-pending-preview';
    preview.appendChild(media);
    node.appendChild(preview);
  } else {
    const icon = ownerDocument.createElement('span');
    icon.className = 'yc-rich-pending-icon';
    icon.setAttribute('data-file-kind', richFileVisualKind(file.name, file.type));
    icon.textContent = richFileVisualBadge(file.name, file.type);
    node.appendChild(icon);
  }

  const main = ownerDocument.createElement('span');
  main.className = 'yc-rich-pending-main';
  const name = ownerDocument.createElement('strong');
  name.textContent = file.name;
  const status = ownerDocument.createElement('span');
  status.className = 'yc-rich-pending-status';
  status.setAttribute('data-rich-pending-status', '');
  status.textContent = '正在上传';
  main.append(name, status);
  if (mediaKind === 'file') node.appendChild(main);

  const remove = ownerDocument.createElement('button');
  remove.type = 'button';
  remove.className = 'yc-rich-pending-remove';
  remove.setAttribute('data-rich-pending-remove', '');
  remove.setAttribute('aria-label', `移除 ${file.name}`);
  remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  node.appendChild(remove);

  const overlay = ownerDocument.createElement('span');
  overlay.className = 'yc-rich-pending-overlay';
  const progress = ownerDocument.createElement('span');
  progress.className = 'yc-rich-pending-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '上传进度');
  progress.setAttribute('aria-valuetext', '正在上传');
  const overlayStatus = ownerDocument.createElement('span');
  overlayStatus.className = 'yc-rich-pending-overlay-status';
  overlayStatus.setAttribute('data-rich-pending-overlay-status', '');
  overlayStatus.textContent = '正在上传';
  const retry = ownerDocument.createElement('button');
  retry.type = 'button';
  retry.className = 'yc-rich-pending-retry';
  retry.setAttribute('data-rich-pending-retry', '');
  retry.hidden = true;
  retry.textContent = '重试';
  retry.setAttribute('aria-label', `重试上传 ${file.name}`);
  overlay.append(progress, overlayStatus, retry);
  node.appendChild(overlay);

  return { node, file, cancelled: false, objectUrl, deferRetryCount: 0, deferMessage: '' };
}

/** @param {HTMLElement} node @param {'uploading' | 'error'} state @param {string} message */
function setPendingUploadState(node, state, message) {
  node.setAttribute('data-upload-state', state);
  const status = node.querySelector('[data-rich-pending-status]');
  const overlayStatus = node.querySelector('[data-rich-pending-overlay-status]');
  const progress = node.querySelector('.yc-rich-pending-progress');
  const retry = /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-rich-pending-retry]'));
  if (status) status.textContent = message;
  if (overlayStatus) overlayStatus.textContent = message;
  if (progress) progress.setAttribute('aria-valuetext', message);
  if (retry) retry.hidden = state !== 'error';
}

/** @param {'registering' | 'signing' | 'uploading' | 'confirming'} stage */
function richTextPasteStageLabel(stage) {
  return {
    registering: '正在登记附件',
    signing: '正在获取上传签名',
    uploading: '正在上传到对象存储',
    confirming: '正在确认上传结果',
  }[stage] || '正在上传';
}

/** @param {unknown} error */
function errorMessageText(error) {
  return error instanceof Error && error.message ? error.message : '';
}

/** @param {{ active?: boolean, label: string, title: string, disabled?: boolean, onClick: React.MouseEventHandler<HTMLButtonElement>, children: React.ReactNode }} props */
function ToolbarButton({ active = false, label, title, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      className={`yc-rich-toolbar-button${active ? ' is-active' : ''}`}
      aria-label={label}
      title={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** @param {{ label: string, value?: string, disabled?: boolean, active?: boolean, triggerRef: React.Ref<HTMLButtonElement>, menuRef: React.Ref<HTMLDivElement>, menuRoot: HTMLDivElement | null, closeRef?: React.MutableRefObject<(() => void) | null>, onOpen?: () => void, onClose?: () => void, triggerClassName?: string, triggerExtra?: React.ReactNode, menuWidth?: number, menuClassName?: string, children: React.ReactNode }} props */
function ToolbarDropdown({ label, value = '', disabled = false, active = false, triggerRef, menuRef, menuRoot, closeRef, onOpen, onClose, triggerClassName = '', triggerExtra = null, menuWidth = 172, menuClassName = '', children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 480 });
  const localTriggerRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const localMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const hoverCloseTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  useEffect(() => {
    if (closeRef) closeRef.current = closeDropdown;
    return () => { if (closeRef) closeRef.current = null; };
  });

  useEffect(() => () => {
    if (!hoverCloseTimerRef.current) return;
    clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const view = localMenuRef.current?.ownerDocument.defaultView;
    if (!view) return undefined;
    const close = () => closeDropdown();
    const closeOnOutsidePointer = (event) => {
      const target = event.target instanceof view.Node ? event.target : null;
      if (target && (localMenuRef.current?.contains(target) || localTriggerRef.current?.contains(target))) return;
      close();
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      localTriggerRef.current?.focus();
    };
    view.addEventListener('pointerdown', closeOnOutsidePointer);
    view.addEventListener('keydown', closeOnEscape);
    view.addEventListener('scroll', close, true);
    view.addEventListener('resize', close);
    return () => {
      view.removeEventListener('pointerdown', closeOnOutsidePointer);
      view.removeEventListener('keydown', closeOnEscape);
      view.removeEventListener('scroll', close, true);
      view.removeEventListener('resize', close);
    };
  }, [open]);

  function openDropdown() {
    const trigger = localTriggerRef.current;
    const view = trigger?.ownerDocument.defaultView;
    if (!trigger || !view || disabled) return;
    const rect = trigger.getBoundingClientRect();
    const rootRect = menuRoot?.getBoundingClientRect() || null;
    const availableRight = rootRect ? Math.min(rootRect.right, view.innerWidth) - rootRect.left : view.innerWidth;
    const left = Math.min(Math.max(8, rect.left - (rootRect?.left || 0)), Math.max(8, availableRight - menuWidth - 8));
    const top = (rootRect ? rect.bottom - rootRect.top + 12 : Math.min(rect.bottom + 12, Math.max(8, view.innerHeight - 420)));
    const maxHeight = Math.min(460, (rootRect ? view.innerHeight - rootRect.top : view.innerHeight) - top - 8);
    setPosition({ left, top, maxHeight: Math.max(120, maxHeight) });
    onOpen?.();
    setOpen(true);
  }

  function closeDropdown() {
    if (!open) return;
    setOpen(false);
    onClose?.();
  }

  function scheduleCloseDropdown() {
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      closeDropdown();
    }, 160);
  }

  function cancelCloseDropdown() {
    if (!hoverCloseTimerRef.current) return;
    clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  }

  /** @param {React.MouseEvent<HTMLElement>} event @param {{ current: HTMLElement | null }} otherRef @returns {boolean} */
  function relatedInside(event, otherRef) {
    const view = event.currentTarget.ownerDocument.defaultView;
    const related = event.relatedTarget;
    return Boolean(view && related instanceof view.Node && otherRef.current?.contains(related));
  }

  return (
    <>
      <button
        ref={(node) => {
          localTriggerRef.current = node;
          if (typeof triggerRef === 'function') triggerRef(node);
          else /** @type {{ current: HTMLButtonElement | null }} */ (triggerRef).current = node;
        }}
        type="button"
        className={`yc-rich-toolbar-button yc-rich-toolbar-select${active ? ' is-active' : ''}${triggerClassName ? ` ${triggerClassName}` : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => { cancelCloseDropdown(); openDropdown(); }}
        onMouseLeave={(event) => {
          if (relatedInside(event, localMenuRef)) return;
          scheduleCloseDropdown();
        }}
        onClick={() => { cancelCloseDropdown(); openDropdown(); }}
      >
        {value ? <span className="yc-rich-toolbar-select-label">{value}</span> : null}
        {triggerExtra}
      </button>
      {open && menuRoot ? createPortal(<div
        ref={(node) => {
          if (typeof menuRef === 'function') menuRef(node);
          else /** @type {{ current: HTMLDivElement | null }} */ (menuRef).current = node;
        }}
        className={`yc-rich-toolbar-popover${menuClassName ? ` ${menuClassName}` : ''}`}
        role="menu"
        aria-label={label}
        style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }}
        onMouseEnter={cancelCloseDropdown}
        onMouseLeave={(event) => {
          if (relatedInside(event, localTriggerRef)) return;
          scheduleCloseDropdown();
        }}
      >
        {children}
      </div>, menuRoot) : null}
    </>
  );
}

/** @param {HTMLDivElement} input @param {string} command @returns {boolean} */
function queryCommandState(input, command) {
  try { return input.ownerDocument.queryCommandState(command); } catch { return false; }
}

/** @param {HTMLDivElement} input @returns {string} */
function currentBlockName(input) {
  try {
    const value = String(input.ownerDocument.queryCommandValue('formatBlock') || '').replace(/[<>]/g, '').toLowerCase();
    return value || 'p';
  } catch { return 'p'; }
}

/** @param {HTMLDivElement} input @param {string} property @returns {string | null} */
function selectedInlineStyle(input, property) {
  const selection = input.ownerDocument.getSelection();
  const anchor = selection?.anchorNode || null;
  const element = anchor?.nodeType === 1 ? /** @type {Element} */ (anchor) : anchor?.parentElement;
  const styled = element?.closest(`span[style*="${property}"]`);
  if (!styled || !input.contains(styled)) return null;
  const style = styled.getAttribute('style') || '';
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    if (declaration.slice(0, colon).trim().toLowerCase() !== property) continue;
    const value = declaration.slice(colon + 1).trim();
    return property === 'font-size' ? normalizeFontSizeValue(value) : value;
  }
  return null;
}

/** @param {string} value @returns {string | null} */
function normalizeFontSizeValue(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'x-small' || normalized === '1' || normalized === 'small') return 'small';
  if (normalized === 'medium' || normalized === '3') return 'medium';
  if (normalized === 'large' || normalized === '4') return 'large';
  if (normalized === 'x-large' || normalized === '5') return 'x-large';
  return normalized || null;
}

/** @param {string | null} value @returns {string | null} */
function normalizeRichTextColor(value) {
  if (!value) return null;
  const match = value.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/iu);
  if (!match) return value.trim().toLowerCase();
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

/** @param {HTMLDivElement} input */
function normalizeInlineStyles(input) {
  for (const element of [...input.querySelectorAll('font[size]')]) {
    const size = element.getAttribute('size') || '';
    const span = input.ownerDocument.createElement('span');
    if (['small', 'medium', 'large', 'x-large'].includes(size)) span.setAttribute('style', `font-size:${size}`);
    span.replaceChildren(...element.childNodes);
    element.replaceWith(span);
  }
  for (const element of [...input.querySelectorAll('span:not([style])')]) {
    if (!element.childElementCount) element.replaceWith(...element.childNodes);
  }
}

/** @param {HTMLDivElement} input @param {string} property @param {string} value */
function wrapSelectionInStyledSpan(input, property, value) {
  const view = input.ownerDocument.defaultView;
  const selection = input.ownerDocument.getSelection();
  if (!view || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.startContainer) || !input.contains(range.endContainer)) return;
  splitTextNodeAt(/** @type {Text} */ (range.startContainer), range.startOffset);
  if (range.endContainer === range.startContainer) splitTextNodeAt(/** @type {Text} */ (range.endContainer), range.endOffset - range.startOffset);
  else splitTextNodeAt(/** @type {Text} */ (range.endContainer), range.endOffset);
  const span = input.ownerDocument.createElement('span');
  span.setAttribute('style', `${property}:${value}`);
  try { range.surroundContents(span); } catch { return; }
  const collapsed = input.ownerDocument.createRange();
  collapsed.setStartAfter(span);
  collapsed.collapse(true);
  selection.removeAllRanges();
  selection.addRange(collapsed);
}

/** @param {Text} node @param {number} offset */
function splitTextNodeAt(node, offset) {
  if (offset <= 0 || offset >= node.data.length) return;
  node.splitText(offset);
}

/** @param {string} html @param {Window} view @returns {string} */
function filterRichTextStyle(html, view) {
  if (!html.includes('style=')) return html;
  const doc = view.document.implementation.createHTMLDocument('');
  const container = doc.createElement('div');
  container.innerHTML = html;
  for (const element of container.querySelectorAll('[style]')) {
    if (element.tagName.toLowerCase() !== 'span') {
      element.removeAttribute('style');
      continue;
    }
    const kept = [];
    const style = element.getAttribute('style');
    if (!style) continue;
    for (const declaration of style.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 1) continue;
      const name = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      if (RICH_TEXT_CSS_PROPERTIES.includes(name) && !/url\s*\(|expression\s*\(/iu.test(value)) kept.push(`${name}:${value}`);
    }
    if (kept.length) element.setAttribute('style', kept.join(';'));
    else element.removeAttribute('style');
  }
  return container.innerHTML;
}

/**
 * 附件图不应嵌套，历史数据中偶发出现“外层空 figure 包着真实附件图”的脏结构。
 * 这里保留最深一层真正携带媒体的附件图，并把对齐信息从外层合并过来；
 * 同时清掉没有媒体且没有文本的空附件图，避免对齐视觉失效。
 *
 * @param {Element} root
 */
function normalizeRichTextAttachmentFigures(root) {
  const mediaFigure = (figure) => {
    let current = figure;
    const chain = [current];
    while (true) {
      const nested = current.querySelector(':scope > figure[data-yuance-attachment-kind]');
      if (!nested) break;
      current = nested;
      chain.push(current);
    }
    return { current, chain };
  };

  for (const figure of [...root.querySelectorAll('figure[data-yuance-attachment-kind]')]) {
    const { current, chain } = mediaFigure(figure);
    if (current === figure) continue;
    const align = chain.map((item) => item.getAttribute('data-yuance-align')).find((value) => value && value !== 'left') || 'left';
    current.setAttribute('data-yuance-align', align);
    figure.replaceWith(current);
  }

  for (const figure of [...root.querySelectorAll('figure[data-yuance-attachment-kind]')]) {
    if (!figure.querySelector('img, video') && !(figure.textContent || '').trim()) {
      figure.remove();
    }
  }
}

/** @param {HTMLDivElement} input @param {string} html */
function sanitizeEditorHtml(input, html) {
  const view = input.ownerDocument.defaultView;
  if (!view) return '';
  const doc = view.document.implementation.createHTMLDocument('');
  const container = doc.createElement('div');
  container.innerHTML = filterRichTextStyle(createDOMPurify(view).sanitize(html, { ALLOWED_TAGS: EDITOR_TAGS, ALLOWED_ATTR: EDITOR_ATTRIBUTES }), view);
  normalizeRichTextAttachmentFigures(container);
  return container.innerHTML;
}

/** @param {string} value @param {new (value: string) => { protocol: string }} Url */
function isSafeLink(value, Url) {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { return ['http:', 'https:'].includes(new Url(value).protocol); } catch { return false; }
}
