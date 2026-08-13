import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttachmentImage } from '@yuance/frontend-ui';

test('attachment image renders a loading placeholder before the image is ready', () => {
  const html = renderToStaticMarkup(createElement(AttachmentImage, {
    src: 'https://example.test/design.png',
    alt: 'design.png',
    placeholder: '图片加载中…',
    errorText: '图片加载失败',
  }));

  assert.match(html, /yc-attachment-image is-loading/);
  assert.match(html, /yc-attachment-image-img/);
  assert.match(html, /图片加载中…/);
  assert.doesNotMatch(html, /is-ready/);
});

test('attachment image shows the error fallback without rendering an image', () => {
  const html = renderToStaticMarkup(createElement(AttachmentImage, {
    src: 'https://example.test/design.png',
    alt: 'design.png',
    error: true,
    errorText: '预览不可用',
  }));

  assert.match(html, /yc-attachment-image is-error/);
  assert.match(html, /预览不可用/);
  assert.doesNotMatch(html, /yc-attachment-image-img/);
});

test('attachment image waits in idle state when no source is provided', () => {
  const html = renderToStaticMarkup(createElement(AttachmentImage, { placeholder: '正在准备图片…' }));

  assert.match(html, /yc-attachment-image is-idle/);
  assert.match(html, /正在准备图片…/);
  assert.doesNotMatch(html, /yc-attachment-image-img/);
});
