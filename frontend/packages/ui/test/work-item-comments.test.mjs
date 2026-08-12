import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { WorkItemComments, workItemTypingText } from '@yuance/frontend-ui';

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
    statusOptions: [{ value: 'open', label: '待处理' }, { value: 'in_progress', label: '处理中' }],
    assigneeTarget: 'bob',
    newCommentAssignStatus: 'open',
    replyAssignStatus: 'open',
    editingCommentId: null,
    replyingToCommentId: null,
    newCommentBody: '',
    newCommentDraftId: null,
    newCommentAttachments: [],
    newCommentAttachmentStatus: '',
    newCommentAttachmentUploading: false,
    editCommentBody: '',
    replyCommentBody: '',
    commentSubmitting: false,
    editSubmitting: false,
    deletingAttachmentId: null,
    replySubmitting: false,
    error: '',
    onSubmitNew: () => {},
    onChangeNew: () => {},
    onChangeNewAssignStatus: () => {},
    onChangeReplyAssignStatus: () => {},
    onUploadNewAttachment: () => {},
    onCancelNewDraft: () => {},
    onSubmitEdit: () => {},
    onChangeEdit: () => {},
    onSubmitReply: () => {},
    onChangeReply: () => {},
    onCancelEdit: () => {},
    onCancelReply: () => {},
    onStartEdit: () => {},
    onStartReply: () => {},
    onUploadAttachment: () => {},
    onPreviewAttachment: () => {},
    onDownloadAttachment: () => {},
    onRevealAttachment: () => {},
    onRequestDeleteAttachment: () => {},
    ...overrides,
  }));
}

test('work item comments render comments, attachment controls and upload state', () => {
  const html = renderComments();

  assert.match(html, /讨论/);
  assert.match(html, /1 条讨论/);
  assert.match(html, /开始处理/);
  assert.match(html, /发表于 2026-08-01/);
  assert.match(html, /comment\.txt/);
  assert.match(html, /aria-label="下载评论附件 comment\.txt"/);
  assert.match(html, /aria-label="预览评论附件 comment\.txt"/);
  assert.match(html, /上传完成/);
  assert.match(html, /指派后状态/);
  assert.match(html, /发表并指派/);
});

test('work item comments render edit and error states', () => {
  const html = renderComments({ editingCommentId: 9, editCommentBody: '<p>更新内容</p>', error: '保存失败。' });

  assert.match(html, /编辑评论/);
  assert.match(html, /work-item-comment-edit-9/);
  assert.match(html, /role="alert"/);
  assert.match(html, />删除<\/button>/);
});

test('work item comments only expose attachment deletion to the active author editor', () => {
  assert.doesNotMatch(renderComments(), />删除<\/button>/);
  assert.doesNotMatch(renderComments({ editingCommentId: 9, currentUsername: 'bob' }), />删除<\/button>/);
  assert.match(renderComments({ editingCommentId: 9, deletingAttachmentId: 7 }), /删除中/);
});

test('work item comments expose draft attachments in the shared composer', () => {
  const html = renderComments({
    newCommentDraftId: 12,
    newCommentAttachments: [attachment],
    newCommentAttachmentStatus: '草稿附件上传完成。',
  });

  assert.match(html, /新评论附件/);
  assert.match(html, /comment\.txt/);
  assert.match(html, /草稿附件上传完成/);
  assert.match(html, /取消草稿/);
});

test('work item comments render reply composer and hide edit from non-authors', () => {
  const reply = renderComments({ replyingToCommentId: 9, replyCommentBody: '<p>回复内容</p>' });
  assert.match(reply, /回复 alice/);
  assert.match(reply, /回复并指派/);
  assert.match(reply, /data-discussion-assign/);

  const foreign = renderComments({ currentUsername: 'bob' });
  assert.doesNotMatch(foreign, /data-comment-edit/);
  assert.match(foreign, /data-comment-reply/);
});

test('work item comments keep browsing available without exposing write controls', () => {
  const html = renderComments({ canWriteComments: false });

  assert.match(html, /讨论/);
  assert.match(html, /开始处理/);
  assert.match(html, /comment\.txt/);
  assert.doesNotMatch(html, /新增评论/);
  assert.doesNotMatch(html, /data-comment-reply/);
  assert.doesNotMatch(html, /data-comment-edit/);
  assert.doesNotMatch(html, /添加附件/);
});

test('work item comments render an explicit empty state', () => {
  const html = renderComments({ comments: [], attachmentsByComment: {}, attachmentStatusByComment: {} });
  assert.match(html, /还没有讨论/);
  assert.match(html, /0 条讨论/);
});

test('work item comments summarize typing users in a polite live region', () => {
  assert.equal(workItemTypingText([]), '');
  assert.equal(workItemTypingText([{ userId: 1, displayName: 'Alice' }]), 'Alice 正在输入…');
  assert.equal(workItemTypingText([{ userId: 1, displayName: 'Alice' }, { userId: 2, displayName: 'Bob' }]), 'Alice、Bob 正在输入…');
  assert.equal(workItemTypingText([{ userId: 1, displayName: 'Alice' }, { userId: 2, displayName: 'Bob' }, { userId: 3, displayName: 'Carol' }]), 'Alice、Bob 等 3 人正在输入…');

  const html = renderComments({ typingUsers: [{ userId: 1, displayName: 'Alice' }] });
  assert.match(html, /class="discussion-typing" aria-live="polite" aria-atomic="true">Alice 正在输入…/u);
});
