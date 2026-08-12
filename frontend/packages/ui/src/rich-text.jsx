// @ts-check

import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useRef, useState } from 'react';

const EDITOR_TAGS = ['a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'source', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'video'];
const EDITOR_ATTRIBUTES = ['alt', 'contenteditable', 'controls', 'data-yuance-align', 'data-yuance-attachment-id', 'data-yuance-attachment-kind', 'data-yuance-file-ext', 'data-yuance-file-kind', 'data-yuance-mention-display-name', 'data-yuance-mention-username', 'href', 'loading', 'playsinline', 'preload', 'src', 'title'];
const CONTENT_TAGS = EDITOR_TAGS;
const CONTENT_ATTRIBUTES = EDITOR_ATTRIBUTES.filter((attribute) => attribute !== 'contenteditable');
const DOCUMENT_FILE_TYPES = ['doc', 'txt', 'log', 'md', 'json', 'xml', 'yaml', 'yml', 'csv', 'xls', 'xlsx', 'ods', 'ppt', 'docx', 'pptx', 'pdf'];

/** @typedef {{ source: string, release?: () => void | Promise<void> }} RichTextResolvedSource */

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
    const sanitized = createDOMPurify(view).sanitize(html, { ALLOWED_TAGS: CONTENT_TAGS, ALLOWED_ATTR: CONTENT_ATTRIBUTES });
    const staging = content.ownerDocument.createElement('div');
    staging.innerHTML = sanitized;
    const mediaReferences = [...staging.querySelectorAll('[data-yuance-attachment-id] img, [data-yuance-attachment-id] video')];
    if (resolveRef.current) for (const media of mediaReferences) media.removeAttribute('src');
    content.replaceChildren(...staging.childNodes);
    for (const file of content.querySelectorAll('a[data-yuance-attachment-kind="file"]')) {
      if (!file.hasAttribute('data-yuance-file-kind') || !file.hasAttribute('data-yuance-file-ext')) {
        const filename = file.getAttribute('title') || file.textContent || '';
        file.setAttribute('data-yuance-file-kind', richFileVisualKind(filename, ''));
        file.setAttribute('data-yuance-file-ext', richFileVisualBadge(filename, ''));
      }
    }
    let active = true;
    const releases = [];
    if (resolveRef.current) for (const media of [...content.querySelectorAll('[data-yuance-attachment-id] img, [data-yuance-attachment-id] video')]) {
      const owner = media.closest('[data-yuance-attachment-id]');
      const attachmentId = Number(owner?.getAttribute('data-yuance-attachment-id'));
      if (!Number.isSafeInteger(attachmentId) || attachmentId < 1) continue;
      void resolveRef.current(attachmentId).then((resolved) => {
        if (!active) { releaseResolvedSource(resolved); return; }
        media.setAttribute('src', resolved.source);
        if (resolved.release) releases.push(resolved.release);
      }).catch(() => {});
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

/** @typedef {{ onProgress?: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void, onError?: (message: string) => void, isCurrent?: () => boolean }} RichTextPasteOptions */

/** @param {{ id: string, value: string, onChange(value: string): void, disabled?: boolean, required?: boolean, label?: string, attachments?: RichTextAttachmentOption[], mentionOptions?: RichTextMentionOption[], onRequestRemoveAttachment?: (attachment: RichTextAttachmentOption) => void, onPasteFile?: (file: File, options?: RichTextPasteOptions) => Promise<RichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE> | RichTextAttachmentOption | null | typeof DEFER_RICH_TEXT_PASTE, onFocus?: () => void, onInputActivity?: () => void, onBlur?: () => void }} props */
export function RichTextEditor({ id, value, onChange, disabled = false, required = false, label = '资料正文', attachments = [], mentionOptions = [], onRequestRemoveAttachment, onPasteFile, onFocus, onInputActivity, onBlur }) {
  const inputRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const mentionRangeRef = useRef(/** @type {Range | null} */ (null));
  const pasteRangeRef = useRef(/** @type {Range | null} */ (null));
  const pendingUploadsRef = useRef(/** @type {Map<string, { node: HTMLElement, file: File, cancelled: boolean, objectUrl: string }>} */ (new Map()));
  const pendingUploadSequenceRef = useRef(0);
  const [attachmentIds, setAttachmentIds] = useState(() => richTextAttachmentIds(value));
  const [mentionQuery, setMentionQuery] = useState(/** @type {string | null} */ (null));
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
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
      setAttachmentIds(richTextAttachmentIds(value));
      return;
    }
    for (const node of pendingNodes) node.remove();
    const sanitized = sanitizeEditorHtml(input, value);
    if (input.innerHTML !== sanitized) input.innerHTML = sanitized;
    for (const node of pendingNodes) input.appendChild(node);
    setAttachmentIds(richTextAttachmentIds(sanitized));
    if (sanitized !== value) onChange(sanitized);
  }, [value]);

  useEffect(() => () => {
    for (const entry of pendingUploadsRef.current.values()) {
      if (!entry.objectUrl) continue;
      try { entry.node.ownerDocument.defaultView?.URL.revokeObjectURL(entry.objectUrl); } catch { /* 卸载时释放失败可忽略。 */ }
    }
    pendingUploadsRef.current.clear();
  }, []);

  /** @param {string} command @param {string | undefined} [argument] */
  function execute(command, argument) {
    const input = inputRef.current;
    if (!input || disabled) return;
    input.focus();
    input.ownerDocument.execCommand(command, false, argument);
    publish(input);
  }

  /** @param {'left' | 'center' | 'right'} alignment */
  function align(alignment) {
    const input = inputRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!input || !view) return;
    const selection = input?.ownerDocument.getSelection();
    const anchor = selection?.anchorNode instanceof view.Node ? selection.anchorNode : null;
    const element = anchor?.nodeType === 1 ? /** @type {Element} */ (anchor) : anchor?.parentElement;
    const block = element?.closest('p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li');
    if (!block || !input.contains(block)) return;
    block.setAttribute('data-yuance-align', alignment);
    publish(input);
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
  }

  /** @param {RichTextAttachmentOption} attachment */
  function insertAttachment(attachment) {
    const input = inputRef.current;
    if (!input || disabled || attachmentIds.includes(attachment.id)) return;
    const node = createAttachmentNode(input.ownerDocument, attachment);
    insertAtSelection(input, node);
    publish(input);
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
  }

  /** @param {number} attachmentId */
  function removeAttachment(attachmentId) {
    const input = inputRef.current;
    if (!input || disabled) return;
    const attachment = attachments.find((candidate) => candidate.id === attachmentId);
    if (attachment && onRequestRemoveAttachment) {
      onRequestRemoveAttachment(attachment);
      return;
    }
    input.querySelector(`[data-yuance-attachment-id="${attachmentId}"]`)?.remove();
    publish(input);
  }

  /** @param {File} file */
  function startPasteUpload(file) {
    const input = inputRef.current;
    if (!input || disabled) return;
    const uploadId = `yuance-paste-${++pendingUploadSequenceRef.current}`;
    const entry = createPendingUploadEntry(input.ownerDocument, file, uploadId);
    pendingUploadsRef.current.set(uploadId, entry);
    insertAtSelection(input, entry.node, pasteRangeRef.current);
    void uploadPastedFile(uploadId);
  }

  /** @param {string} uploadId */
  async function uploadPastedFile(uploadId) {
    const entry = pendingUploadsRef.current.get(uploadId);
    if (!entry || entry.cancelled || !onPasteFile) return;
    setPendingUploadState(entry.node, 'uploading', '正在上传');
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
        isCurrent: () => {
          const current = pendingUploadsRef.current.get(uploadId);
          return Boolean(current && !current.cancelled);
        },
      }));
      const current = pendingUploadsRef.current.get(uploadId);
      if (!current || current.cancelled) return;
      if (attachment === DEFER_RICH_TEXT_PASTE) {
        setPendingUploadState(current.node, 'error', '上传被暂缓，请重试。');
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

  return (
    <div className={`yc-rich-text-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="yc-rich-text-toolbar" role="toolbar" aria-label="富文本工具栏">
        <button type="button" aria-label="加粗" title="加粗" disabled={disabled} onClick={() => execute('bold')}><strong>B</strong></button>
        <button type="button" aria-label="斜体" title="斜体" disabled={disabled} onClick={() => execute('italic')}><em>I</em></button>
        <button type="button" aria-label="无序列表" title="无序列表" disabled={disabled} onClick={() => execute('insertUnorderedList')}>•</button>
        <button type="button" aria-label="插入代码块" title="插入代码块" disabled={disabled} onClick={() => execute('formatBlock', 'pre')}>&lt;/&gt;</button>
        <button type="button" aria-label="插入链接" title="插入链接" disabled={disabled} onClick={createLink}>↗</button>
        <button type="button" aria-label="转换 Markdown" title="转换 Markdown" disabled={disabled} onClick={convertMarkdown}>MD</button>
        <button type="button" aria-label="提及成员" title="提及成员" disabled={disabled || mentionOptions.length === 0} onClick={openMentionPicker}>@</button>
        <button type="button" aria-label="左对齐" title="左对齐" disabled={disabled} onClick={() => align('left')}>≡</button>
        <button type="button" aria-label="居中对齐" title="居中对齐" disabled={disabled} onClick={() => align('center')}>≡</button>
        <button type="button" aria-label="右对齐" title="右对齐" disabled={disabled} onClick={() => align('right')}>≡</button>
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
            pasteRangeRef.current = currentInsertionRange(input);
            for (const file of files) startPasteUpload(file);
            pasteRangeRef.current = null;
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
      {attachments.length ? <div className="yc-rich-text-attachments" aria-label="资料正文附件">
        {attachments.map((attachment) => {
          const inserted = attachmentIds.includes(attachment.id);
          return <div key={attachment.id}><span>{attachment.filename}</span>{inserted ? <button type="button" disabled={disabled} onClick={() => removeAttachment(attachment.id)}>移除引用</button> : <button type="button" disabled={disabled} onClick={() => insertAttachment(attachment)}>插入正文</button>}</div>;
        })}
      </div> : null}
    </div>
  );

  /** @param {HTMLDivElement} input */
  function publish(input) {
    const clone = /** @type {HTMLDivElement} */ (input.cloneNode(true));
    clone.querySelectorAll('[data-rich-pending-upload]').forEach((node) => node.remove());
    const sanitized = sanitizeEditorHtml(clone, clone.innerHTML);
    setAttachmentIds(richTextAttachmentIds(sanitized));
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
  const items = clipboardData.items;
  for (let index = 0; items && index < items.length; index += 1) {
    const item = items[index];
    if (item?.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  const dataFiles = clipboardData.files;
  for (let index = 0; dataFiles && index < dataFiles.length; index += 1) {
    const file = dataFiles[index];
    if (file && !files.includes(file)) files.push(file);
  }
  return files;
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

  return { node, file, cancelled: false, objectUrl };
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

/** @param {HTMLDivElement} input @param {string} html */
function sanitizeEditorHtml(input, html) {
  const view = input.ownerDocument.defaultView;
  if (!view) return '';
  return createDOMPurify(view).sanitize(html, { ALLOWED_TAGS: EDITOR_TAGS, ALLOWED_ATTR: EDITOR_ATTRIBUTES });
}

/** @param {string} value @param {new (value: string) => { protocol: string }} Url */
function isSafeLink(value, Url) {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { return ['http:', 'https:'].includes(new Url(value).protocol); } catch { return false; }
}
