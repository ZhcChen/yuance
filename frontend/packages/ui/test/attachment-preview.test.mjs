import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttachmentPreview } from '@yuance/frontend-ui';

test('attachment preview renders fullscreen image viewer controls and status', () => {
  const html = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'design.png', source: '/preview/content', kind: 'image', fileType: 'png', position: 2, total: 3, hasPrevious: true, hasNext: true, onPrevious() {}, onNext() {}, onDownload() {}, onClose() {} }));
  assert.match(html, /design\.png/);
  assert.match(html, /第 2 \/ 3 项/);
  assert.match(html, /<img/);
  assert.match(html, /role="toolbar"/);
  assert.match(html, /aria-label="查看上一个媒体"/);
  assert.match(html, /aria-label="缩小图片"/);
  assert.match(html, /aria-label="放大图片"/);
  assert.match(html, /aria-label="顺时针旋转图片"/);
  assert.match(html, /aria-label="重置图片显示"/);
  assert.match(html, /aria-label="查看下一个媒体"/);
  assert.match(html, /aria-label="下载附件"/);
  assert.match(html, /aria-label="关闭媒体预览"/);
});

test('attachment preview renders video with native controls and hides image-only actions', () => {
  const html = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'demo.mp4', source: '/preview/demo.mp4', kind: 'video', fileType: 'mp4', onDownload() {}, onClose() {} }));
  assert.match(html, /<video/);
  assert.match(html, /controls/);
  assert.match(html, /aria-label="下载附件"/);
  assert.doesNotMatch(html, /aria-label="放大图片"/);
  assert.doesNotMatch(html, /aria-label="顺时针旋转图片"/);
});

test('attachment preview renders text documents inline and keeps unsupported documents actionable', () => {
  const textHtml = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'notes.md', source: '/preview/content', kind: 'document', strategy: 'text', fileType: 'md', onDownload() {}, onClose() {} }));
  assert.match(textHtml, /class="attachment-preview-text-frame"/);
  assert.match(textHtml, /src="\/preview\/content"/);
  assert.match(textHtml, /title="notes\.md 文本预览"/);

  const documentHtml = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'plan.pdf', source: '/preview/content', kind: 'document', fileType: 'pdf', documentViewer: async () => ({ destroy() {} }), onDownload() {}, onClose() {} }));
  assert.match(documentHtml, /class="attachment-preview-document-host"/);
  assert.doesNotMatch(documentHtml, /暂不支持内嵌渲染/);
  const errorHtml = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'plan.pdf', source: '', kind: null, fileType: null, error: '预览加载失败', onDownload() {}, onClose() {} }));
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /预览加载失败/);
});

test('attachment preview download control shows busy loading state while downloading', () => {
  const html = renderToStaticMarkup(React.createElement(AttachmentPreview, { open: true, title: 'plan.pdf', source: '', kind: null, fileType: null, downloading: true, onDownload() {}, onClose() {} }));
  assert.match(html, /aria-label="正在下载附件"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /class="attachment-preview-downloading"/);
  assert.doesNotMatch(html, /aria-label="下载附件"/);
});
