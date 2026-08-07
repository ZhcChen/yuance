// @ts-check

import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useRef, useState } from 'react';

const EDITOR_TAGS = ['a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'source', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'video'];
const EDITOR_ATTRIBUTES = ['alt', 'contenteditable', 'controls', 'data-yuance-align', 'data-yuance-attachment-id', 'data-yuance-attachment-kind', 'data-yuance-file-ext', 'data-yuance-file-kind', 'data-yuance-mention-display-name', 'data-yuance-mention-username', 'href', 'loading', 'playsinline', 'preload', 'src', 'title'];
const CONTENT_TAGS = EDITOR_TAGS;
const CONTENT_ATTRIBUTES = EDITOR_ATTRIBUTES.filter((attribute) => attribute !== 'contenteditable');

/** @typedef {{ source: string, release?: () => void | Promise<void> }} RichTextResolvedSource */

/** @param {{ html: string, format?: string, emptyText?: string, onAttachmentActivate?: (attachmentId: number) => void, resolveAttachmentSource?: (attachmentId: number) => Promise<RichTextResolvedSource> }} props */
export function RichTextContent({ html, format = 'html', emptyText = '暂无正文。', onAttachmentActivate, resolveAttachmentSource }) {
  const contentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const activateRef = useRef(onAttachmentActivate);
  const resolveRef = useRef(resolveAttachmentSource);
  activateRef.current = onAttachmentActivate;
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
      if (!Number.isSafeInteger(attachmentId) || attachmentId < 1 || !activateRef.current) return;
      event.preventDefault();
      activateRef.current(attachmentId);
    };
    content.addEventListener('click', activate);
    return () => {
      active = false;
      content.removeEventListener('click', activate);
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
  if (mediaKind === 'file') return `<a data-yuance-attachment-id="${id}" data-yuance-attachment-kind="file" data-yuance-align="left" href="${url}" title="${filename}">${escapeText(attachment.filename)}</a>`;
  if (mediaKind === 'image') return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="${url}" alt="${filename}" loading="lazy"></figure>`;
  return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="video" data-yuance-align="left"><video src="${url}" controls preload="metadata" playsinline title="${filename}"></video></figure>`;
}

/** @typedef {{ id: number, filename: string, contentType: string, url: string }} RichTextAttachmentOption */
/** @typedef {{ username: string, displayName: string }} RichTextMentionOption */

/** @param {{ id: string, value: string, onChange(value: string): void, disabled?: boolean, required?: boolean, label?: string, attachments?: RichTextAttachmentOption[], mentionOptions?: RichTextMentionOption[], onRequestRemoveAttachment?: (attachment: RichTextAttachmentOption) => void }} props */
export function RichTextEditor({ id, value, onChange, disabled = false, required = false, label = '资料正文', attachments = [], mentionOptions = [], onRequestRemoveAttachment }) {
  const inputRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const mentionRangeRef = useRef(/** @type {Range | null} */ (null));
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
    const sanitized = sanitizeEditorHtml(input, value);
    if (input.innerHTML !== sanitized) input.innerHTML = sanitized;
    setAttachmentIds(richTextAttachmentIds(sanitized));
    if (sanitized !== value) onChange(sanitized);
  }, [value]);

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
        onInput={(event) => {
          const context = mentionContext(event.currentTarget);
          mentionRangeRef.current = context?.range || null;
          setMentionQuery(context?.query ?? null);
          setMentionActiveIndex(0);
          publish(event.currentTarget);
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
        }}
        onPaste={(event) => {
          event.preventDefault();
          event.currentTarget.ownerDocument.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
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
    const sanitized = sanitizeEditorHtml(input, input.innerHTML);
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

/** @param {HTMLDivElement} input @param {Element} node */
function insertAtSelection(input, node) {
  const selection = input.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !input.contains(selection.anchorNode)) input.appendChild(node);
  else {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  input.appendChild(input.ownerDocument.createElement('p')).appendChild(input.ownerDocument.createElement('br'));
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
