import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkItemComments } from '@yuance/frontend-ui';

const comment = {
  id: 9,
  parent_comment_id: null,
  parent_author: '',
  body: '开始处理',
  body_format: 'plain',
  author: 'alice',
  author_username: 'alice',
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
    revealableKey: '',
    mutationBusy: false,
    canWriteComments: true,
    currentUsername: 'alice',
    mentionOptions: [{ username: 'bob', displayName: 'Bob' }],
    editingCommentId: null,
    replyingToCommentId: null,
    newCommentBody: '',
    editCommentBody: '',
    replyCommentBody: '',
    commentSubmitting: false,
    editSubmitting: false,
    replySubmitting: false,
    error: '',
    onSubmitNew: () => {},
    onChangeNew: () => {},
    onSubmitEdit: () => {},
    onChangeEdit: () => {},
    onSubmitReply: () => {},
    onChangeReply: () => {},
    onCancelEdit: () => {},
    onCancelReply: () => {},
    onStartEdit: () => {},
    onStartReply: () => {},
    onUploadAttachment: () => {},
    onDownloadAttachment: () => {},
    onRevealAttachment: () => {},
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
  const html = renderComments({ editingCommentId: 9, editCommentBody: '<p>更新内容</p>', error: '保存失败。' });

  assert.match(html, /编辑评论/);
  assert.match(html, /work-item-comment-edit-9/);
  assert.match(html, /role="alert"/);
});

test('work item comments render reply composer and hide edit from non-authors', () => {
  const reply = renderComments({ replyingToCommentId: 9, replyCommentBody: '<p>回复内容</p>' });
  assert.match(reply, /回复 alice/);
  assert.match(reply, /回复评论/);

  const foreign = renderComments({ currentUsername: 'bob' });
  assert.doesNotMatch(foreign, /data-comment-edit/);
  assert.match(foreign, /data-comment-reply/);
});

test('work item comments keep browsing available without exposing write controls', () => {
  const html = renderComments({ canWriteComments: false });

  assert.match(html, /评论与流转/);
  assert.match(html, /开始处理/);
  assert.match(html, /comment\.txt/);
  assert.doesNotMatch(html, /新增评论/);
  assert.doesNotMatch(html, /data-comment-reply/);
  assert.doesNotMatch(html, /data-comment-edit/);
  assert.doesNotMatch(html, /选择评论附件/);
});

test('work item comments render an explicit empty state', () => {
  const html = renderComments({ comments: [], attachmentsByComment: {}, attachmentStatusByComment: {} });
  assert.match(html, /当前没有评论或流转记录/);
});
