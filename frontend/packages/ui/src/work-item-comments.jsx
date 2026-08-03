// @ts-check

import React from 'react';

import { AttachmentList } from './work-item-attachments.jsx';

/** @typedef {import('./work-item-attachments.jsx').Attachment} Attachment */

/**
 * @typedef {object} Comment
 * @property {number} id
 * @property {string} author
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
 *   mutationBusy: boolean,
 *   editingCommentId: number | null,
 *   newCommentBody: string,
 *   editCommentBody: string,
 *   commentSubmitting: boolean,
 *   editSubmitting: boolean,
 *   error: string,
 *   newCommentTextareaRef: import('react').RefObject<HTMLTextAreaElement | null>,
 *   editCommentTextareaRef: import('react').RefObject<HTMLTextAreaElement | null>,
 *   onSubmitNew: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onChangeNew: (event: import('react').ChangeEvent<HTMLTextAreaElement>) => void,
 *   onSubmitEdit: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onChangeEdit: (event: import('react').ChangeEvent<HTMLTextAreaElement>) => void,
 *   onCancelEdit: () => void,
 *   onStartEdit: (comment: Comment) => void,
 *   onUploadAttachment: (commentId: number) => void,
 *   onDownloadAttachment: (commentId: number, attachment: Attachment) => void,
 * }} props
 */
export function WorkItemComments(props) {
  const {
    comments,
    attachmentsByComment,
    attachmentStatusByComment,
    uploadingCommentId,
    downloadingKey,
    mutationBusy,
    editingCommentId,
    newCommentBody,
    editCommentBody,
    commentSubmitting,
    editSubmitting,
    error,
    newCommentTextareaRef,
    editCommentTextareaRef,
    onSubmitNew,
    onChangeNew,
    onSubmitEdit,
    onChangeEdit,
    onCancelEdit,
    onStartEdit,
    onUploadAttachment,
    onDownloadAttachment,
  } = props;

  return (
    <section className="work-item-comments-panel" aria-labelledby="work-item-comments-title">
      <div className="yuance-ui-panel-header">
        <h3 id="work-item-comments-title">评论与流转</h3>
        <span className="yuance-ui-meta">共 {comments.length} 条</span>
      </div>
      <form className="work-item-comment-form" onSubmit={onSubmitNew}>
        <label className="work-item-form-field">
          <span>新增评论</span>
          <textarea ref={newCommentTextareaRef} rows={4} value={newCommentBody} onChange={onChangeNew} placeholder="输入一条普通评论" />
        </label>
        <div className="work-item-form-actions">
          <button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{commentSubmitting ? '发布中…' : '发布评论'}</button>
        </div>
      </form>
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
      {comments.length ? (
        <ul className="work-item-comment-list">
          {comments.map((comment) => {
            const attachments = attachmentsByComment[String(comment.id)] || [];
            const attachmentStatus = attachmentStatusByComment[String(comment.id)] || '';
            const commentUploading = uploadingCommentId === comment.id;
            return (
              <li key={comment.id} id={`comment-${comment.id}`} className={`work-item-comment-row ${comment.is_flow ? 'is-flow' : ''}`}>
                <div className="work-item-comment-heading">
                  <strong>{comment.author}</strong>
                  {comment.parent_comment_id ? <span className="yuance-ui-meta">回复 {comment.parent_author}</span> : null}
                  {comment.is_flow ? <span className="yuance-ui-pill yuance-ui-pill-status">流转记录</span> : null}
                  {comment.is_draft ? <span className="yuance-ui-pill yuance-ui-pill-draft">草稿</span> : null}
                </div>
                {editingCommentId === comment.id ? (
                  <>
                    <p className="work-item-comment-body">{comment.body || '暂无内容。'}</p>
                    <form className="work-item-comment-edit-form" onSubmit={onSubmitEdit}>
                      <label className="work-item-form-field">
                        <span>编辑评论</span>
                        <textarea ref={editCommentTextareaRef} rows={4} value={editCommentBody} onChange={onChangeEdit} />
                      </label>
                      <div className="work-item-form-actions work-item-comment-actions">
                        <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onCancelEdit} disabled={mutationBusy}>取消</button>
                        <button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{editSubmitting ? '保存中…' : '保存评论'}</button>
                      </div>
                    </form>
                  </>
                ) : <p className="work-item-comment-body">{comment.body || '暂无内容。'}</p>}
                {attachments.length ? (
                  <AttachmentList
                    attachments={attachments}
                    ariaLabel={`评论 ${comment.id} 附件`}
                    downloadLabel="评论附件"
                    downloadingId={downloadingKey.startsWith(`${comment.id}:`) ? Number(downloadingKey.split(':')[1]) : null}
                    onDownload={(attachment) => onDownloadAttachment(comment.id, attachment)}
                    className="work-item-comment-attachment-list"
                  />
                ) : null}
                {!comment.is_flow && !comment.is_draft ? (
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
                    <button data-comment-edit className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={() => onStartEdit(comment)} disabled={mutationBusy}>编辑</button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="yuance-ui-empty">当前没有评论或流转记录。</p>}
    </section>
  );
}
