import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DEFER_RICH_TEXT_PASTE, RichTextContent, RichTextEditor, plainTextToRichHtml, richTextAttachmentHtml, richTextAttachmentIds, richTextHasContent } from '@yuance/frontend-ui';

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

test('rich text editor exposes the shared formatting toolbar and textbox', () => {
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, { id: 'body', value: '<p>正文</p>', onChange() {}, required: true, mentionOptions: [{ username: 'alice', displayName: 'Alice' }] }));
  assert.match(html, /aria-label="富文本工具栏"/);
  assert.match(html, /aria-label="加粗"/);
  assert.match(html, /aria-label="转换 Markdown"/);
  assert.match(html, /aria-label="提及成员"/);
  assert.doesNotMatch(html, /aria-label="提及成员"[^>]*disabled/);
  assert.match(html, /role="textbox"/);
  assert.match(html, /aria-required="true"/);
  assert.doesNotMatch(html, /<p>正文<\/p>/);
});

test('rich text editor distinguishes inserted and available uploaded attachments', () => {
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, {
    id: 'body', value: '<p>正文</p><a data-yuance-attachment-id="9" data-yuance-attachment-kind="file" href="/web/projects/YCE/resources/8/attachments/9/download">plan.txt</a>', onChange() {},
    attachments: [
      { id: 9, filename: 'plan.txt', contentType: 'text/plain', url: '/web/projects/YCE/resources/8/attachments/9/download' },
      { id: 10, filename: 'design.png', contentType: 'image/png', url: '/web/projects/YCE/resources/8/attachments/10/download' },
    ],
  }));
  assert.match(html, /plan\.txt[\s\S]*移除引用/);
  assert.match(html, /design\.png[\s\S]*插入正文/);
});

test('rich text attachment HTML emits canonical escaped file and media nodes', () => {
  assert.equal(richTextAttachmentHtml({ id: 9, filename: 'a<&".txt', contentType: 'text/plain', url: '/web/projects/YCE/resources/8/attachments/9/download' }), '<a data-yuance-attachment-id="9" data-yuance-attachment-kind="file" data-yuance-align="left" href="/web/projects/YCE/resources/8/attachments/9/download" title="a&lt;&amp;&quot;.txt">a&lt;&amp;".txt</a>');
  assert.match(richTextAttachmentHtml({ id: 10, filename: 'design.png', contentType: 'image/png', url: '/web/projects/YCE/resources/8/attachments/10/download' }), /^<figure[\s\S]*<img[\s\S]*><\/figure>$/u);
  assert.match(richTextAttachmentHtml({ id: 11, filename: 'demo.mp4', contentType: 'video/mp4', url: '/web/projects/YCE/resources/8/attachments/11/download' }), /<video[\s\S]*controls/);
});
