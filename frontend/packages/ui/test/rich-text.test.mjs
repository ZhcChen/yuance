import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DEFER_RICH_TEXT_PASTE, RichTextContent, RichTextEditor, isPreviewableDocumentFile, plainTextToRichHtml, previewableDocumentFileType, richFileVisualBadge, richFileVisualKind, richTextAttachmentHtml, richTextAttachmentIds, richTextHasContent } from '@yuance/frontend-ui';

test('rich text editor exposes the deferred paste sentinel used by pre-upload flows', () => {
  assert.equal(DEFER_RICH_TEXT_PASTE, 'defer');
});

test('rich text content defers HTML injection to its client sanitizer and preserves plain text semantics', () => {
  const rich = renderToStaticMarkup(React.createElement(RichTextContent, { html: '<h2>方案</h2><pre><code>cargo test</code></pre>', format: 'html' }));
  assert.equal(rich, '<div class="yc-rich-text-content"></div>');

  const plain = renderToStaticMarkup(React.createElement(RichTextContent, { html: '<script>alert(1)</script>', format: 'plain' }));
  assert.doesNotMatch(plain, /<script>/);
  assert.match(plain, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('plain text conversion escapes markup and rich content detection rejects empty blocks', () => {
  assert.equal(plainTextToRichHtml('<b>标题</b>\n下一行'), '<p>&lt;b&gt;标题&lt;/b&gt;</p><p>下一行</p>');
  assert.equal(richTextHasContent('<p><br></p>'), false);
  assert.equal(richTextHasContent('<p>正文</p>'), true);
  assert.equal(richTextHasContent('<hr>'), true);
  assert.deepEqual(richTextAttachmentIds('<figure data-yuance-attachment-id="19"><img></figure><a data-yuance-attachment-id="7"></a><a data-yuance-attachment-id="19"></a>'), [19, 7]);
});

test('rich text editor exposes the shared formatting toolbar and textbox', async () => {
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, { id: 'body', value: '<p>正文</p>', onChange() {}, required: true, mentionOptions: [{ username: 'alice', displayName: 'Alice' }] }));
  const source = await readFile(new URL('../src/rich-text.jsx', import.meta.url), 'utf8');
  assert.match(html, /aria-label="富文本工具栏"/);
  assert.match(html, /aria-label="段落格式"/);
  assert.match(html, /aria-label="字号"/);
  assert.match(html, /aria-label="文字颜色"/);
  assert.match(source, /type="color"/);
  assert.match(source, /aria-label="自定义文字颜色"/);
  assert.ok((source.match(/\{ label: '[^']+', value: '#[0-9a-f]{6}' \},/gu) || []).length >= 24);
  assert.match(html, /role="group" aria-label="文本样式"/);
  assert.match(html, /role="group" aria-label="列表"/);
  assert.match(html, /aria-label="加粗"/);
  assert.match(html, /aria-label="有序列表"/);
  assert.match(html, /aria-label="更多格式"/);
  assert.match(html, /aria-label="提及成员"/);
  assert.doesNotMatch(html, /aria-label="提及成员"[^>]*disabled/);
  assert.match(html, /role="textbox"/);
  assert.match(html, /aria-required="true"/);
  assert.doesNotMatch(html, /<p>正文<\/p>/);
});

test('rich text attachment HTML emits canonical escaped file and media nodes', () => {
  assert.equal(richTextAttachmentHtml({ id: 9, filename: 'a<&".txt', contentType: 'text/plain', url: '/web/projects/YCE/resources/8/attachments/9/download' }), '<a data-yuance-attachment-id="9" data-yuance-attachment-kind="file" data-yuance-file-kind="text" data-yuance-file-ext="TXT" data-yuance-align="left" href="/web/projects/YCE/resources/8/attachments/9/download" title="a&lt;&amp;&quot;.txt">a&lt;&amp;".txt</a>');
  assert.match(richTextAttachmentHtml({ id: 10, filename: 'design.png', contentType: 'image/png', url: '/web/projects/YCE/resources/8/attachments/10/download' }), /^<figure[\s\S]*<img[\s\S]*><\/figure>$/u);
  assert.match(richTextAttachmentHtml({ id: 11, filename: 'demo.mp4', contentType: 'video/mp4', url: '/web/projects/YCE/resources/8/attachments/11/download' }), /<video[\s\S]*controls/);
});

test('rich text file cards share editor and rendered-content styles', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const appShellStyles = await readFile(new URL('../../app-shell/src/application.css', import.meta.url), 'utf8');

  assert.match(styles, /\.yc-rich-text-input a\[data-yuance-attachment-kind="file"\],\n\.yc-rich-text-content a\[data-yuance-attachment-kind="file"\] \{/u);
  for (const kind of ['word', 'sheet', 'slide', 'pdf', 'text', 'code', 'archive']) {
    assert.match(styles, new RegExp(`\\.yc-rich-text-input a\\[data-yuance-attachment-kind="file"\\]\\[data-yuance-file-kind="${kind}"\\],\\n\\.yc-rich-text-content a\\[data-yuance-attachment-kind="file"\\]\\[data-yuance-file-kind="${kind}"\\]`, 'u'));
  }
  assert.match(styles, /\.yc-rich-downloading-overlay \{/u);
  assert.match(styles, /\.yc-rich-downloading-spinner \{/u);
  assert.doesNotMatch(appShellStyles, /\.resource-rich-body\.discussion-rich-body a\[data-yuance-attachment-kind="file"\]/u);
});

test('rich text content exposes an attachment downloading state on file cards', async () => {
  const source = await readFile(new URL('../src/rich-text.jsx', import.meta.url), 'utf8');
  assert.match(source, /downloadingAttachmentId = null/u);
  assert.match(source, /yc-rich-downloading-overlay/u);
  assert.match(source, /正在下载中/u);
});

test('rich text file helpers derive document previewability and file card visuals', () => {
  assert.equal(previewableDocumentFileType('guide.pdf', ''), 'pdf');
  assert.equal(previewableDocumentFileType('plan.txt', 'text/plain'), 'txt');
  assert.equal(previewableDocumentFileType('notes.md', 'application/octet-stream'), 'md');
  assert.equal(previewableDocumentFileType('archive.zip', ''), '');
  assert.equal(richFileVisualKind('设计说明.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'word');
  assert.equal(richFileVisualKind('数据.xlsx', ''), 'sheet');
  assert.equal(richFileVisualKind('演示.pptx', ''), 'slide');
  assert.equal(richFileVisualKind('archive.zip', ''), 'archive');
  assert.equal(richFileVisualBadge('README.md', ''), 'MD');
  assert.equal(richFileVisualBadge('archive.zip', ''), 'ZIP');
  assert.equal(richFileVisualBadge('unknown', ''), 'FILE');
  assert.equal(isPreviewableDocumentFile('guide.pdf', ''), true);
  assert.equal(isPreviewableDocumentFile('archive.zip', ''), false);
});
