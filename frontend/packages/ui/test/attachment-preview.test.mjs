import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttachmentPreview } from '@yuance/frontend-ui';

test('attachment preview renders shared image navigation and download controls', () => {
  const html = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'design.png', source: '/preview/content', kind: 'image', fileType: 'png', position: 2, total: 3, hasPrevious: true, hasNext: true, onPrevious() {}, onNext() {}, onDownload() {}, onClose() {} }));
  assert.match(html, /design\.png/);
  assert.match(html, /2 \/ 3/);
  assert.match(html, /<img/);
  assert.match(html, />上一个</);
  assert.match(html, />下载</);
});

test('attachment preview keeps document and error fallbacks actionable', () => {
  const documentHtml = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'plan.pdf', source: '/preview/content', kind: 'document', fileType: 'pdf', onDownload() {}, onClose() {} }));
  assert.match(documentHtml, /暂不支持内嵌渲染/);
  const errorHtml = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'plan.pdf', source: '', kind: null, fileType: null, error: '预览加载失败', onDownload() {}, onClose() {} }));
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /预览加载失败/);
});
