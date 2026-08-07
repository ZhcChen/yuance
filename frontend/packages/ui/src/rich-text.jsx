// @ts-check

import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useRef } from 'react';

const EDITOR_TAGS = ['a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'];
const EDITOR_ATTRIBUTES = ['data-yuance-align', 'href', 'title'];
const CONTENT_TAGS = [...EDITOR_TAGS, 'figcaption', 'figure', 'img', 'source', 'video'];
const CONTENT_ATTRIBUTES = [...EDITOR_ATTRIBUTES, 'alt', 'controls', 'data-yuance-attachment-id', 'data-yuance-attachment-kind', 'data-yuance-file-ext', 'data-yuance-file-kind', 'loading', 'playsinline', 'preload', 'src'];

/** @param {{ html: string, format?: string, emptyText?: string }} props */
export function RichTextContent({ html, format = 'html', emptyText = '暂无正文。' }) {
  const contentRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    const content = contentRef.current;
    const view = content?.ownerDocument.defaultView;
    if (content && view && format === 'html') content.innerHTML = createDOMPurify(view).sanitize(html, { ALLOWED_TAGS: CONTENT_TAGS, ALLOWED_ATTR: CONTENT_ATTRIBUTES });
  }, [format, html]);
  if (!html) return <p className="yc-rich-text-empty">{emptyText}</p>;
  if (format !== 'html') return <div className="yc-rich-text-content yc-rich-text-plain">{html}</div>;
  return <div ref={contentRef} className="yc-rich-text-content" />;
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

/** @param {{ id: string, value: string, onChange(value: string): void, disabled?: boolean, required?: boolean, label?: string }} props */
export function RichTextEditor({ id, value, onChange, disabled = false, required = false, label = '资料正文' }) {
  const inputRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const sanitized = sanitizeEditorHtml(input, value);
    if (input.innerHTML !== sanitized) input.innerHTML = sanitized;
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

  return (
    <div className={`yc-rich-text-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="yc-rich-text-toolbar" role="toolbar" aria-label="富文本工具栏">
        <button type="button" aria-label="加粗" title="加粗" disabled={disabled} onClick={() => execute('bold')}><strong>B</strong></button>
        <button type="button" aria-label="斜体" title="斜体" disabled={disabled} onClick={() => execute('italic')}><em>I</em></button>
        <button type="button" aria-label="无序列表" title="无序列表" disabled={disabled} onClick={() => execute('insertUnorderedList')}>•</button>
        <button type="button" aria-label="插入代码块" title="插入代码块" disabled={disabled} onClick={() => execute('formatBlock', 'pre')}>&lt;/&gt;</button>
        <button type="button" aria-label="插入链接" title="插入链接" disabled={disabled} onClick={createLink}>↗</button>
        <button type="button" aria-label="转换 Markdown" title="转换 Markdown" disabled={disabled} onClick={convertMarkdown}>MD</button>
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
        onInput={(event) => publish(event.currentTarget)}
        onPaste={(event) => {
          event.preventDefault();
          event.currentTarget.ownerDocument.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
          publish(event.currentTarget);
        }}
      />
    </div>
  );

  /** @param {HTMLDivElement} input */
  function publish(input) {
    onChange(sanitizeEditorHtml(input, input.innerHTML));
  }
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
