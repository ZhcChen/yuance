// @ts-check

import React from 'react';

import { AttachmentList } from './work-item-attachments.jsx';
import { RichTextContent, RichTextEditor } from './rich-text.jsx';

/** @typedef {import('./work-item-attachments.jsx').Attachment} Attachment */

/**
 * @typedef {object} Comment
 * @property {number} id
 * @property {string} author
 * @property {string} author_username
 * @property {string} body
 * @property {string} body_format
 * @property {boolean} is_flow
 * @property {boolean} is_draft
 * @property {number | null} parent_comment_id
 * @property {string} parent_author
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {{
 *   comments: Comment[],
 *   attachmentsByComment: Record<string, Attachment[]>,
 *   attachmentStatusByComment: Record<string, string>,
 *   uploadingCommentId: number | null,
 *   downloadingKey: string,
 *   revealableKey: string,
 *   mutationBusy: boolean,
 *   canWriteComments: boolean,
 *   currentUsername: string,
 *   mentionOptions: Array<{ username: string, displayName: string }>,
 *   editingCommentId: number | null,
 *   replyingToCommentId: number | null,
 *   newCommentBody: string,
 *   newCommentDraftId: number | null,
 *   newCommentAttachments: Attachment[],
 *   newCommentAttachmentStatus: string,
 *   newCommentAttachmentUploading: boolean,
 *   editCommentBody: string,
 *   replyCommentBody: string,
 *   commentSubmitting: boolean,
 *   editSubmitting: boolean,
 *   deletingAttachmentId: number | null,
 *   replySubmitting: boolean,
 *   error: string,
 *   typingUsers?: Array<{ userId: number, displayName: string }>,
 *   onTypingStart?: () => void,
 *   onTypingActivity?: () => void,
 *   onTypingStop?: () => void,
 *   onSubmitNew: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onChangeNew: (value: string) => void,
 *   onUploadNewAttachment: () => void,
 *   onCancelNewDraft: () => void,
 *   onSubmitEdit: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onChangeEdit: (value: string) => void,
 *   onSubmitReply: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onChangeReply: (value: string) => void,
 *   onCancelEdit: () => void,
 *   onCancelReply: () => void,
 *   onStartEdit: (comment: Comment) => void,
 *   onStartReply: (comment: Comment) => void,
 *   onUploadAttachment: (commentId: number) => void,
 *   onPreviewAttachment: (commentId: number, attachment: Attachment) => void,
 *   onDownloadAttachment: (commentId: number, attachment: Attachment) => void,
 *   onRevealAttachment: (commentId: number, attachment: Attachment) => void,
 *   onRequestDeleteAttachment: (commentId: number, attachment: Attachment) => void,
 * }} props
 */
export function WorkItemComments(props) {
  const {
    comments,
    attachmentsByComment,
    attachmentStatusByComment,
    uploadingCommentId,
    downloadingKey,
    revealableKey,
    mutationBusy,
    canWriteComments,
    currentUsername,
    mentionOptions,
    editingCommentId,
    replyingToCommentId,
    newCommentBody,
    newCommentDraftId,
    newCommentAttachments,
    newCommentAttachmentStatus,
    newCommentAttachmentUploading,
    editCommentBody,
    replyCommentBody,
    commentSubmitting,
    editSubmitting,
    deletingAttachmentId,
    replySubmitting,
    error,
    typingUsers = [],
    onTypingStart,
    onTypingActivity,
    onTypingStop,
    onSubmitNew,
    onChangeNew,
    onUploadNewAttachment,
    onCancelNewDraft,
    onSubmitEdit,
    onChangeEdit,
    onSubmitReply,
    onChangeReply,
    onCancelEdit,
    onCancelReply,
    onStartEdit,
    onStartReply,
    onUploadAttachment,
    onPreviewAttachment,
    onDownloadAttachment,
    onRevealAttachment,
    onRequestDeleteAttachment,
  } = props;
  const typingText = workItemTypingText(typingUsers);
  const typingCallbacks = { onFocus: onTypingStart, onInputActivity: onTypingActivity, onBlur: onTypingStop };

  return (
    <section id="work-item-comments" className="work-item-comments-panel discussion-section" aria-labelledby="work-item-comments-title">
      <div className="yuance-ui-panel-header">
        <div className="work-item-comments-heading">
          <h3 id="work-item-comments-title">评论与流转</h3>
          <span className="work-item-typing-status" aria-live="polite" aria-atomic="true">{typingText}</span>
        </div>
        <span className="yuance-ui-meta">共 {comments.length} 条</span>
      </div>
      {canWriteComments ? <form className="work-item-comment-form" onSubmit={onSubmitNew}>
        <RichTextEditor id="work-item-new-comment" value={newCommentBody} onChange={onChangeNew} label="新增评论" mentionOptions={mentionOptions} {...typingCallbacks} />
        {newCommentAttachments.length ? (
          <AttachmentList
            attachments={newCommentAttachments}
            ariaLabel="新评论附件"
            downloadLabel="评论附件"
            downloadingId={newCommentDraftId !== null && downloadingKey.startsWith(`${newCommentDraftId}:`) ? Number(downloadingKey.split(':')[1]) : null}
            revealableId={newCommentDraftId !== null && revealableKey.startsWith(`${newCommentDraftId}:`) ? Number(revealableKey.split(':')[1]) : null}
            onPreview={(attachment) => { if (newCommentDraftId !== null) onPreviewAttachment(newCommentDraftId, attachment); }}
            onDownload={(attachment) => { if (newCommentDraftId !== null) onDownloadAttachment(newCommentDraftId, attachment); }}
            onReveal={(attachment) => { if (newCommentDraftId !== null) onRevealAttachment(newCommentDraftId, attachment); }}
            className="work-item-comment-attachment-list"
          />
        ) : null}
        {newCommentAttachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{newCommentAttachmentStatus}</p> : null}
        <div className="work-item-form-actions">
          <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onUploadNewAttachment} disabled={mutationBusy || newCommentAttachmentUploading}>{newCommentAttachmentUploading ? '处理中…' : '添加附件'}</button>
          {newCommentDraftId !== null ? <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onCancelNewDraft} disabled={mutationBusy}>取消草稿</button> : null}
          <button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{commentSubmitting ? '发布中…' : '发布评论'}</button>
        </div>
      </form> : null}
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
      {comments.length ? (
        <ul className="work-item-comment-list">
          {comments.map((comment) => {
            const attachments = attachmentsByComment[String(comment.id)] || [];
            const attachmentStatus = attachmentStatusByComment[String(comment.id)] || '';
            const commentUploading = uploadingCommentId === comment.id;
            return (
              <li key={comment.id} id={`comment-${comment.id}`} tabIndex={-1} className={`work-item-comment-row ${comment.is_flow ? 'is-flow' : ''}`}>
                <div className="work-item-comment-heading">
                  <strong>{comment.author}</strong>
                  {comment.parent_comment_id ? <span className="yuance-ui-meta">回复 {comment.parent_author}</span> : null}
                  {comment.is_flow ? <span className="yuance-ui-pill yuance-ui-pill-status">流转记录</span> : null}
                  {comment.is_draft ? <span className="yuance-ui-pill yuance-ui-pill-draft">草稿</span> : null}
                </div>
                {editingCommentId === comment.id ? (
                  <>
                    <RichTextContent html={comment.body} format={comment.body_format} emptyText="暂无内容。" />
                    <form className="work-item-comment-edit-form" onSubmit={onSubmitEdit}>
                      <RichTextEditor id={`work-item-comment-edit-${comment.id}`} value={editCommentBody} onChange={onChangeEdit} label="编辑评论" mentionOptions={mentionOptions} {...typingCallbacks} />
                      <div className="work-item-form-actions work-item-comment-actions">
                        <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onCancelEdit} disabled={mutationBusy}>取消</button>
                        <button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{editSubmitting ? '保存中…' : '保存评论'}</button>
                      </div>
                    </form>
                  </>
                ) : <RichTextContent html={comment.body} format={comment.body_format} emptyText="暂无内容。" />}
                {attachments.length ? (
                  <AttachmentList
                    attachments={attachments}
                    ariaLabel={`评论 ${comment.id} 附件`}
                    downloadLabel="评论附件"
                    downloadingId={downloadingKey.startsWith(`${comment.id}:`) ? Number(downloadingKey.split(':')[1]) : null}
                    revealableId={revealableKey.startsWith(`${comment.id}:`) ? Number(revealableKey.split(':')[1]) : null}
                    onPreview={(attachment) => onPreviewAttachment(comment.id, attachment)}
                    onDownload={(attachment) => onDownloadAttachment(comment.id, attachment)}
                    onReveal={(attachment) => onRevealAttachment(comment.id, attachment)}
                    renderExtraAction={(attachment) => editingCommentId === comment.id && comment.author_username === currentUsername ? (
                      <button className="yuance-ui-button yuance-ui-button-danger" type="button" onClick={() => onRequestDeleteAttachment(comment.id, attachment)} disabled={mutationBusy || deletingAttachmentId !== null}>
                        {deletingAttachmentId === attachment.id ? '删除中…' : '删除'}
                      </button>
                    ) : null}
                    className="work-item-comment-attachment-list"
                  />
                ) : null}
                {canWriteComments && !comment.is_flow && !comment.is_draft ? (
                  <form className="work-item-comment-attachment-upload" onSubmit={(event) => event.preventDefault()}>
                    <button
                      className="yuance-ui-button yuance-ui-button-secondary"
                      type="button"
                      onClick={() => onUploadAttachment(comment.id)}
                      disabled={commentUploading || uploadingCommentId !== null || mutationBusy}
                    >
                      {commentUploading ? '处理中…' : '选择评论附件'}
                    </button>
                    {attachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{attachmentStatus}</p> : null}
                  </form>
                ) : null}
                <p className="yuance-ui-muted">创建于 {comment.created_at || '未知'}，更新于 {comment.updated_at || '未知'}</p>
                {!comment.is_flow && !comment.is_draft && editingCommentId === null ? (
                  <div className="work-item-comment-actions">
                    {canWriteComments ? <button data-comment-reply className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={() => onStartReply(comment)} disabled={mutationBusy}>回复</button> : null}
                    {canWriteComments && comment.author_username === currentUsername ? <button data-comment-edit className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={() => onStartEdit(comment)} disabled={mutationBusy}>编辑</button> : null}
                  </div>
                ) : null}
                {replyingToCommentId === comment.id ? <form className="work-item-comment-reply-form" onSubmit={onSubmitReply}>
                  <p className="yuance-ui-meta">回复 {comment.author}</p>
                  <RichTextEditor id={`work-item-comment-reply-${comment.id}`} value={replyCommentBody} onChange={onChangeReply} label={`回复 ${comment.author}`} mentionOptions={mentionOptions} {...typingCallbacks} />
                  <div className="work-item-form-actions work-item-comment-actions">
                    <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onCancelReply} disabled={mutationBusy}>取消</button>
                    <button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{replySubmitting ? '回复中…' : '回复评论'}</button>
                  </div>
                </form> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="yuance-ui-empty">当前没有评论或流转记录。</p>}
    </section>
  );
}

/** @param {Array<{ userId: number, displayName: string }>} users */
export function workItemTypingText(users) {
  const names = users
    .filter((user) => Number.isSafeInteger(user.userId) && user.userId > 0 && typeof user.displayName === 'string')
    .map((user) => user.displayName.trim())
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} 正在输入…`;
  if (names.length === 2) return `${names[0]}、${names[1]} 正在输入…`;
  return `${names[0]}、${names[1]} 等 ${names.length} 人正在输入…`;
}
