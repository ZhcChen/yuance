import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RichAttachmentMenu } from '@yuance/frontend-ui';

test('rich attachment menu renders preview and download actions without copy link', () => {
  const html = renderToStaticMarkup(React.createElement(RichAttachmentMenu, {
    open: true,
    title: 'demo.pdf',
    x: 120,
    y: 80,
    downloadUrl: '/web/projects/YCE/resources/8/attachments/9/download',
    canPreview: true,
    onClose() {},
    onDownload() {},
    onStatus() {},
  }));
  assert.match(html, /role="menu"/);
  assert.match(html, /demo\.pdf/);
  assert.doesNotMatch(html, /复制链接/);
  assert.match(html, /预览/);
  assert.match(html, /下载/);
  assert.match(html, /查看文档/);
});

test('rich attachment menu hides preview action for non-document files', () => {
  const html = renderToStaticMarkup(React.createElement(RichAttachmentMenu, {
    open: true,
    title: 'archive.zip',
    x: 0,
    y: 0,
    downloadUrl: '/web/projects/YCE/resources/8/attachments/10/download',
    canPreview: false,
    onClose() {},
    onDownload() {},
    onStatus() {},
  }));
  assert.doesNotMatch(html, /查看文档/);
  assert.doesNotMatch(html, /复制链接/);
  assert.match(html, /下载/);
});

test('rich attachment menu is not rendered while closed', () => {
  const html = renderToStaticMarkup(React.createElement(RichAttachmentMenu, {
    open: false,
    title: 'demo.pdf',
    x: 0,
    y: 0,
    downloadUrl: '/web/projects/YCE/resources/8/attachments/9/download',
    onClose() {},
    onDownload() {},
    onStatus() {},
  }));
  assert.equal(html, '');
});
