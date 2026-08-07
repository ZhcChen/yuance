import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RichTextContent, RichTextEditor, plainTextToRichHtml, richTextHasContent } from '@yuance/frontend-ui';

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
});

test('rich text editor exposes the shared formatting toolbar and textbox', () => {
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, { id: 'body', value: '<p>正文</p>', onChange() {}, required: true }));
  assert.match(html, /aria-label="富文本工具栏"/);
  assert.match(html, /aria-label="加粗"/);
  assert.match(html, /aria-label="转换 Markdown"/);
  assert.match(html, /role="textbox"/);
  assert.match(html, /aria-required="true"/);
  assert.doesNotMatch(html, /<p>正文<\/p>/);
});
