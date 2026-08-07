import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkItemAttachments, attachmentStatusLabel, formatByteSize } from '@yuance/frontend-ui';

const attachment = {
  id: 7,
  filename: 'design.txt',
  content_type: 'text/plain',
  byte_size: 1536,
  status: 'uploaded',
  created_by: 'alice',
  created_at: '2026-08-01',
};

test('attachment formatters preserve shared display semantics', () => {
  assert.equal(formatByteSize(0), '大小未知');
  assert.equal(formatByteSize(1536), '1.5 KB');
  assert.equal(attachmentStatusLabel('uploaded'), '已上传');
});

test('work item attachments render content, status and callbacks as controls', () => {
  const html = renderToStaticMarkup(createElement(WorkItemAttachments, {
    attachments: [attachment],
    status: '上传完成。',
    warning: '列表部分加载失败。',
    error: '刷新失败。',
    uploading: false,
    mutationBusy: false,
    canUpload: true,
    downloadingId: null,
    onChooseUpload: () => {},
    onRetryUpload: () => {},
    onDownload: () => {},
  }));

  assert.match(html, /工作项附件/);
  assert.match(html, /design\.txt/);
  assert.match(html, /1\.5 KB/);
  assert.match(html, /aria-label="下载附件 design\.txt"/);
  assert.match(html, /role="alert"/);
});

test('work item attachments render an explicit empty state', () => {
  const html = renderToStaticMarkup(createElement(WorkItemAttachments, {
    attachments: [],
    status: '',
    warning: '',
    error: '',
    uploading: false,
    mutationBusy: false,
    canUpload: true,
    downloadingId: null,
    onChooseUpload: () => {},
    onRetryUpload: () => {},
    onDownload: () => {},
  }));

  assert.match(html, /当前没有工作项附件/);
});

test('work item attachments expose reveal only for the capability-bound row', () => {
  const html = renderToStaticMarkup(createElement(WorkItemAttachments, {
    attachments: [attachment], status: '下载完成。', warning: '', error: '', uploading: false, mutationBusy: false, canUpload: true,
    downloadingId: null, revealableId: attachment.id, onChooseUpload: () => {}, onRetryUpload: () => {}, onDownload: () => {}, onReveal: () => {},
  }));
  assert.match(html, /在文件夹中显示/);
});

test('work item attachments expose retries only to writers', () => {
  const pending = { ...attachment, status: 'pending' };
  const writable = renderToStaticMarkup(createElement(WorkItemAttachments, {
    attachments: [pending], status: '', warning: '', error: '', uploading: false, mutationBusy: false, canUpload: true,
    downloadingId: null, onChooseUpload: () => {}, onRetryUpload: () => {}, onDownload: () => {},
  }));
  assert.match(writable, /选择工作项附件/);
  assert.match(writable, /继续上传/);

  const readonly = renderToStaticMarkup(createElement(WorkItemAttachments, {
    attachments: [pending], status: '', warning: '', error: '', uploading: false, mutationBusy: false, canUpload: false,
    downloadingId: null, onChooseUpload: () => {}, onRetryUpload: () => {}, onDownload: () => {},
  }));
  assert.doesNotMatch(readonly, /选择工作项附件/);
  assert.doesNotMatch(readonly, /继续上传/);
});
