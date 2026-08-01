import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkItemComments } from '@yuance/frontend-ui';

const comment = {
  id: 9,
  parent_comment_id: null,
  parent_author: '',
  body: '开始处理',
  body_format: 'plain',
  author: 'alice',
  created_at: '2026-08-01',
  updated_at: '2026-08-01',
  is_flow: false,
  is_draft: false,
};

const attachment = {
  id: 7,
  filename: 'comment.txt',
  content_type: 'text/plain',
  byte_size: 7,
  status: 'uploaded',
  created_by: 'alice',
  created_at: '2026-08-01',
};

function renderComments(overrides = {}) {
  return renderToStaticMarkup(createElement(WorkItemComments, {
    comments: [comment],
    attachmentsByComment: { 9: [attachment] },
    attachmentStatusByComment: { 9: '上传完成。' },
    uploadingCommentId: null,
    downloadingKey: '',
    mutationBusy: false,
    editingCommentId: null,
    newCommentBody: '',
    editCommentBody: '',
    commentSubmitting: false,
    editSubmitting: false,
    error: '',
    newCommentTextareaRef: createRef(),
    editCommentTextareaRef: createRef(),
    onSubmitNew: () => {},
    onChangeNew: () => {},
    onSubmitEdit: () => {},
    onChangeEdit: () => {},
    onCancelEdit: () => {},
    onStartEdit: () => {},
    onUploadAttachment: () => {},
    onDownloadAttachment: () => {},
    ...overrides,
  }));
}

test('work item comments render comments, attachment controls and upload state', () => {
  const html = renderComments();

  assert.match(html, /评论与流转/);
  assert.match(html, /开始处理/);
  assert.match(html, /comment\.txt/);
  assert.match(html, /aria-label="下载评论附件 comment\.txt"/);
  assert.match(html, /上传完成/);
});

test('work item comments render edit and error states', () => {
  const html = renderComments({ editingCommentId: 9, editCommentBody: '更新内容', error: '保存失败。' });

  assert.match(html, /编辑评论/);
  assert.match(html, /更新内容/);
  assert.match(html, /role="alert"/);
});

test('work item comments render an explicit empty state', () => {
  const html = renderComments({ comments: [], attachmentsByComment: {}, attachmentStatusByComment: {} });
  assert.match(html, /当前没有评论或流转记录/);
});
