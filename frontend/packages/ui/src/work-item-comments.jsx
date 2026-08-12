// @ts-check

import React from 'react';

import { attachmentIsUploaded, attachmentStatusLabel, formatByteSize } from './formatters.js';
import { Button } from './primitives.jsx';
import { AttachmentList } from './work-item-attachments.jsx';
import { RichTextContent, RichTextEditor } from './rich-text.jsx';
import { UserAvatar } from './user-avatar.jsx';

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
 * @param {Attachment} attachment
 * @returns {'image' | 'video' | null}
 */
function attachmentMediaKind(attachment) {
  if (!attachmentIsUploaded(attachment)) return null;
  const contentType = (attachment.content_type || '').toLowerCase();
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}

/**
 * @param {{
 *   attachments: Attachment[],
 *   commentId: number,
 *   downloadingId: number | null,
 *   revealableId: number | null,
 *   onPreview: (attachment: Attachment) => void,
 *   onDownload: (attachment: Attachment) => void,
 *   onReveal?: (attachment: Attachment) => void,
 *   renderExtraAction?: (attachment: Attachment) => React.ReactNode,
 *   buildThumbnailUrl?: (commentId: number, attachment: Attachment) => string,
 * }} props
 */
function DiscussionAttachmentList({ attachments, commentId, downloadingId, revealableId, onPreview, onDownload, onReveal, renderExtraAction, buildThumbnailUrl }) {
  return (
    <ul className="discussion-attachments work-item-comment-attachments" aria-label="评论附件">
      {attachments.map((attachment) => {
        const uploaded = attachmentIsUploaded(attachment);
        const mediaKind = uploaded ? attachmentMediaKind(attachment) : null;
        const thumbnailSource = buildThumbnailUrl ? buildThumbnailUrl(commentId, attachment) : '';
        return (
          <li key={attachment.id} className={`discussion-attachment is-${attachment.status || 'unknown'}`}>
            {mediaKind === 'image' ? (
              <button
                className="discussion-attachment-preview"
                type="button"
                aria-label={`预览图片 ${attachment.filename || attachment.id}`}
                onClick={() => onPreview(attachment)}
                disabled={downloadingId === attachment.id}
              >
                <span className="attachment-image-frame">
                  {thumbnailSource ? (
                    <img
                      src={thumbnailSource}
                      alt=""
                      loading="lazy"
                      onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                      onError={(event) => {
                        event.currentTarget.classList.add('is-error');
                        const state = event.currentTarget.parentElement?.querySelector('.attachment-image-state');
                        if (state) state.textContent = '预览不可用';
                      }}
                    />
                  ) : null}
                  <span className="attachment-image-state">加载预览</span>
                </span>
              </button>
            ) : mediaKind === 'video' ? (
              <button
                className="discussion-attachment-preview"
                type="button"
                aria-label={`预览视频 ${attachment.filename || attachment.id}`}
                onClick={() => onPreview(attachment)}
                disabled={downloadingId === attachment.id}
              >
                <span className="attachment-image-frame">
                  {thumbnailSource ? <video src={thumbnailSource} muted preload="metadata" playsInline /> : null}
                  <span className="attachment-video-play" aria-hidden="true">▶</span>
                </span>
              </button>
            ) : (
              <span className="discussion-file-type" aria-hidden="true">FILE</span>
            )}
            <div>
              <strong>{attachment.filename || '未命名附件'}</strong>
              <span>{formatByteSize(attachment.byte_size)} · {attachment.created_by || '未知用户'} · {attachment.created_at || '未知时间'}</span>
            </div>
            <div className="work-item-attachment-actions">
              {uploaded ? (
                <>
                  {onPreview ? <Button variant="secondary" type="button" ariaLabel={`预览评论附件 ${attachment.filename || attachment.id}`} onClick={() => onPreview(attachment)} disabled={downloadingId === attachment.id}>预览</Button> : null}
                  <Button variant="secondary" type="button" ariaLabel={`下载评论附件 ${attachment.filename || attachment.id}`} onClick={() => onDownload(attachment)} disabled={downloadingId === attachment.id}>{downloadingId === attachment.id ? '处理中…' : '下载'}</Button>
                  {revealableId === attachment.id && onReveal ? <Button variant="secondary" type="button" onClick={() => onReveal(attachment)} disabled={downloadingId === attachment.id}>在文件夹中显示</Button> : null}
                </>
              ) : <span className="attachment-action-hint">{attachmentStatusLabel(attachment.status)}</span>}
              {renderExtraAction?.(attachment)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
 *   statusOptions?: Array<{ value: string, label: string }>,
 *   assigneeTarget?: string,
 *   newCommentAssignStatus?: string,
 *   replyAssignStatus?: string,
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
 *   onChangeNewAssignStatus?: (value: string) => void,
 *   onChangeReplyAssignStatus?: (value: string) => void,
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
 *   onPasteFile?: (context: 'new' | 'edit' | 'reply', commentId: number | null, file: File, options?: { onProgress?: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void, onError?: (message: string) => void, isCurrent?: () => boolean }) => Promise<{ id: number, filename: string, contentType: string, url: string } | null | typeof import('./rich-text.jsx').DEFER_RICH_TEXT_PASTE>,
 *   resolveAttachmentSource?: (commentId: number, attachmentId: number) => Promise<{ source: string, release?: () => void | Promise<void> }>,
 *   onAttachmentActivate?: (commentId: number, attachmentId: number) => void,
 *   buildAttachmentThumbnailUrl?: (commentId: number, attachment: Attachment) => string,
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
    statusOptions = [],
    assigneeTarget = '',
    newCommentAssignStatus = '',
    replyAssignStatus = '',
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
    onChangeNewAssignStatus = () => {},
    onChangeReplyAssignStatus = () => {},
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
    onPasteFile,
    resolveAttachmentSource,
    onAttachmentActivate,
    buildAttachmentThumbnailUrl,
  } = props;
  const typingText = workItemTypingText(typingUsers);
  const typingCallbacks = { onFocus: onTypingStart, onInputActivity: onTypingActivity, onBlur: onTypingStop };

  return (
    <section id="work-item-comments" className="work-item-comments-panel discussion-section" aria-labelledby="work-item-comments-title">
      <div className="content-section-head discussion-heading">
        <div className="content-section-copy">
          <span className="section-kicker">协作记录</span>
          <h2 id="work-item-comments-title">讨论</h2>
        </div>
        <div className="discussion-heading-meta">
          <span className="discussion-count">{comments.length} 条讨论</span>
          {typingText ? <span className="discussion-typing" aria-live="polite" aria-atomic="true">{typingText}</span> : null}
        </div>
      </div>
      {canWriteComments ? <div className="discussion-composer-dock">
        <form className="discussion-composer work-item-comment-form" onSubmit={onSubmitNew}>
          <UserAvatar name="我" className="discussion-avatar discussion-composer-avatar work-item-comment-avatar" />
          <div className="discussion-composer-main">
            <RichTextEditor id="work-item-new-comment" value={newCommentBody} onChange={onChangeNew} label="新增评论" mentionOptions={mentionOptions} onPasteFile={onPasteFile ? (file, options) => onPasteFile('new', null, file, options) : undefined} {...typingCallbacks} />
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
            <div className="discussion-composer-footer work-item-form-actions">
              <Button variant="secondary" type="button" onClick={onUploadNewAttachment} disabled={mutationBusy || newCommentAttachmentUploading}>{newCommentAttachmentUploading ? '处理中…' : '添加附件'}</Button>
              {newCommentDraftId !== null ? <Button variant="secondary" type="button" onClick={onCancelNewDraft} disabled={mutationBusy}>取消草稿</Button> : null}
              <label className="discussion-assign-status">指派后状态<select value={newCommentAssignStatus} disabled={mutationBusy} onChange={(event) => onChangeNewAssignStatus(event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <Button variant="secondary" type="submit" data-discussion-submit disabled={mutationBusy || newCommentAttachmentUploading}>{commentSubmitting ? '正在提交…' : '发表'}</Button>
              <Button type="submit" data-discussion-submit data-discussion-assign disabled={mutationBusy || newCommentAttachmentUploading || !assigneeTarget}>{commentSubmitting ? '正在提交…' : '发表并指派'}</Button>
            </div>
          </div>
        </form>
      </div> : null}
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
      {comments.length ? (
        <ul className="work-item-comment-list discussion-thread">
          {comments.map((comment) => {
            const attachments = attachmentsByComment[String(comment.id)] || [];
            const attachmentStatus = attachmentStatusByComment[String(comment.id)] || '';
            const commentUploading = uploadingCommentId === comment.id;
            const downloadingId = downloadingKey.startsWith(`${comment.id}:`) ? Number(downloadingKey.split(':')[1]) : null;
            const revealableId = revealableKey.startsWith(`${comment.id}:`) ? Number(revealableKey.split(':')[1]) : null;
            return (
              <li key={comment.id} id={`comment-${comment.id}`} tabIndex={-1} className={`work-item-comment-row discussion-post ${comment.is_flow ? 'is-flow' : ''}`}>
                <UserAvatar name={comment.author} className="discussion-avatar work-item-comment-avatar" />
                <div className="discussion-post-shell">
                  <header className="discussion-post-head">
                    <div>
                      <strong>{comment.author}</strong>
                      {comment.parent_comment_id ? <a className="discussion-reply-target" href={`#comment-${comment.parent_comment_id}`} aria-label={`查看 ${comment.parent_author} 的原评论`}>回复 {comment.parent_author}</a> : null}
                      {comment.is_flow ? <span className="yuance-ui-pill yuance-ui-pill-status">流转记录</span> : null}
                      {comment.is_draft ? <span className="yuance-ui-pill yuance-ui-pill-draft">草稿</span> : null}
                    </div>
                  </header>
                  <article className="discussion-post-content">
                    {editingCommentId === comment.id ? (
                      <>
                        <RichTextContent html={comment.body} format={comment.body_format} emptyText="暂无内容。" resolveAttachmentSource={resolveAttachmentSource ? (attachmentId) => resolveAttachmentSource(comment.id, attachmentId) : undefined} onAttachmentActivate={onAttachmentActivate ? (attachmentId) => onAttachmentActivate(comment.id, attachmentId) : undefined} />
                        <form className="work-item-comment-edit-form" onSubmit={onSubmitEdit}>
                          <RichTextEditor id={`work-item-comment-edit-${comment.id}`} value={editCommentBody} onChange={onChangeEdit} label="编辑评论" mentionOptions={mentionOptions} onPasteFile={onPasteFile ? (file, options) => onPasteFile('edit', comment.id, file, options) : undefined} {...typingCallbacks} />
                          <div className="work-item-form-actions work-item-comment-actions">
                            <Button variant="secondary" type="button" onClick={onCancelEdit} disabled={mutationBusy}>取消</Button>
                            <Button type="submit" disabled={mutationBusy}>{editSubmitting ? '保存中…' : '保存评论'}</Button>
                          </div>
                        </form>
                      </>
                    ) : <RichTextContent html={comment.body} format={comment.body_format} emptyText="暂无内容。" resolveAttachmentSource={resolveAttachmentSource ? (attachmentId) => resolveAttachmentSource(comment.id, attachmentId) : undefined} onAttachmentActivate={onAttachmentActivate ? (attachmentId) => onAttachmentActivate(comment.id, attachmentId) : undefined} />}
                    {attachments.length ? (
                      <DiscussionAttachmentList
                        attachments={attachments}
                        commentId={comment.id}
                        downloadingId={downloadingId}
                        revealableId={revealableId}
                        onPreview={(attachment) => onPreviewAttachment(comment.id, attachment)}
                        onDownload={(attachment) => onDownloadAttachment(comment.id, attachment)}
                        onReveal={onRevealAttachment ? (attachment) => onRevealAttachment(comment.id, attachment) : undefined}
                        renderExtraAction={(attachment) => editingCommentId === comment.id && comment.author_username === currentUsername ? (
                          <Button variant="danger" type="button" onClick={() => onRequestDeleteAttachment(comment.id, attachment)} disabled={mutationBusy || deletingAttachmentId !== null}>
                            {deletingAttachmentId === attachment.id ? '删除中…' : '删除'}
                          </Button>
                        ) : null}
                        buildThumbnailUrl={buildAttachmentThumbnailUrl}
                      />
                    ) : null}
                    {attachmentStatus ? <p className="work-item-attachment-status" aria-live="polite">{attachmentStatus}</p> : null}
                    <footer className="discussion-post-actions">
                      <div className="discussion-post-action-buttons">
                        {canWriteComments && !comment.is_flow && !comment.is_draft && editingCommentId === null ? (
                          <>
                            <Button variant="secondary" data-comment-reply type="button" onClick={() => onStartReply(comment)} disabled={mutationBusy}>回复</Button>
                            {comment.author_username === currentUsername ? <Button variant="secondary" data-comment-edit type="button" onClick={() => onStartEdit(comment)} disabled={mutationBusy}>编辑</Button> : null}
                            <Button variant="secondary" type="button" onClick={() => onUploadAttachment(comment.id)} disabled={commentUploading || uploadingCommentId !== null || mutationBusy}>{commentUploading ? '处理中…' : '添加附件'}</Button>
                          </>
                        ) : null}
                      </div>
                      <div className="discussion-post-time">
                        <span>发表于 {comment.created_at || '未知'}</span>
                        {comment.updated_at && comment.updated_at !== comment.created_at ? <span>编辑于 {comment.updated_at}</span> : null}
                      </div>
                    </footer>
                    {replyingToCommentId === comment.id ? (
                      <form className="discussion-composer discussion-reply-form work-item-comment-reply-form" onSubmit={onSubmitReply}>
                        <div className="discussion-composer-main">
                          <p className="discussion-replying-to">回复 <strong>{comment.author}</strong></p>
                          <RichTextEditor id={`work-item-comment-reply-${comment.id}`} value={replyCommentBody} onChange={onChangeReply} label={`回复 ${comment.author}`} mentionOptions={mentionOptions} onPasteFile={onPasteFile ? (file, options) => onPasteFile('reply', comment.id, file, options) : undefined} {...typingCallbacks} />
                          <div className="discussion-composer-footer work-item-form-actions">
                            <Button variant="secondary" type="button" onClick={onCancelReply} disabled={mutationBusy}>取消</Button>
                            <label className="discussion-assign-status">指派后状态<select value={replyAssignStatus} disabled={mutationBusy} onChange={(event) => onChangeReplyAssignStatus(event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                            <Button variant="secondary" type="submit" data-discussion-submit disabled={mutationBusy}>{replySubmitting ? '正在提交…' : '回复'}</Button>
                            <Button type="submit" data-discussion-submit data-discussion-assign disabled={mutationBusy || !comment.author_username}>{replySubmitting ? '正在提交…' : '回复并指派'}</Button>
                          </div>
                        </div>
                      </form>
                    ) : null}
                  </article>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <div className="discussion-empty"><strong>还没有讨论</strong><span>发表第一条内容，后续协作记录会完整保留在这里。</span></div>}
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
