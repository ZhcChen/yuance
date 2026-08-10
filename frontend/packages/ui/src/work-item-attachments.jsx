// @ts-check

import React from 'react';

import { attachmentIsUploaded, attachmentStatusLabel, formatByteSize } from './formatters.js';

/**
 * @typedef {object} Attachment
 * @property {number} id
 * @property {string} filename
 * @property {string} content_type
 * @property {number} byte_size
 * @property {string} status
 * @property {string} created_by
 * @property {string} created_at
 */

/**
 * @param {{ attachments: Attachment[], ariaLabel?: string, downloadLabel: '附件' | '评论附件', downloadingId: number | null, revealableId?: number | null, onDownload: (attachment: Attachment) => void, onPreview?: (attachment: Attachment) => void, onReveal?: (attachment: Attachment) => void, renderExtraAction?: (attachment: Attachment) => React.ReactNode, showCreator?: boolean, className?: string }} props
 */
export function AttachmentList({ attachments, ariaLabel, downloadLabel, downloadingId, revealableId = null, onDownload, onPreview, onReveal, renderExtraAction, showCreator = false, className = '' }) {
  return (
    <ul className={`work-item-attachment-list ${className}`.trim()} aria-label={ariaLabel}>
      {attachments.map((attachment) => (
        <li key={attachment.id} className={`work-item-attachment-row is-${attachment.status || 'unknown'}`}>
          <div className="work-item-attachment-main">
            <strong>{attachment.filename || '未命名附件'}</strong>
            <span className="yuance-ui-meta">
              {formatByteSize(attachment.byte_size)} · {attachment.content_type || 'application/octet-stream'} · {attachmentStatusLabel(attachment.status)}
            </span>
            {showCreator ? <span className="yuance-ui-muted">{attachment.created_by || '未知用户'} · {attachment.created_at || '未知时间'}</span> : null}
          </div>
          <div className="work-item-attachment-actions">
            {attachmentIsUploaded(attachment) ? (
              <>
                {onPreview ? <button className="yuance-ui-button yuance-ui-button-secondary" type="button" aria-label={`预览${downloadLabel} ${attachment.filename || attachment.id}`} onClick={() => onPreview(attachment)} disabled={downloadingId === attachment.id}>预览</button> : null}
                <button
                  className="yuance-ui-button yuance-ui-button-secondary"
                  type="button"
                  aria-label={`下载${downloadLabel} ${attachment.filename || attachment.id}`}
                  onClick={() => onDownload(attachment)}
                  disabled={downloadingId === attachment.id}
                >
                  {downloadingId === attachment.id ? '处理中…' : '下载'}
                </button>
                {revealableId === attachment.id && onReveal ? (
                  <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={() => onReveal(attachment)} disabled={downloadingId === attachment.id}>
                    在文件夹中显示
                  </button>
                ) : null}
              </>
            ) : <span className="attachment-action-hint">上传完成后可下载</span>}
            {renderExtraAction?.(attachment)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{ attachments: Attachment[], status: string, warning: string, error: string, uploading: boolean, mutationBusy: boolean, canUpload: boolean, downloadingId: number | null, revealableId?: number | null, onChooseUpload: () => void, onRetryUpload: (attachment: Attachment) => void, onPreview?: (attachment: Attachment) => void, onDownload: (attachment: Attachment) => void, onReveal?: (attachment: Attachment) => void }} props
 */
export function WorkItemAttachments({ attachments, status, warning, error, uploading, mutationBusy, canUpload, downloadingId, revealableId = null, onChooseUpload, onRetryUpload, onPreview, onDownload, onReveal }) {
  return (
    <section className="work-item-attachments-panel" aria-labelledby="work-item-attachments-title">
      <div className="yuance-ui-panel-header">
        <h3 id="work-item-attachments-title">工作项附件</h3>
        <span className="yuance-ui-meta">共 {attachments.length} 个</span>
      </div>
      {canUpload ? <form className="work-item-attachment-upload" onSubmit={(event) => event.preventDefault()}>
        <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={onChooseUpload} disabled={uploading || mutationBusy}>
          {uploading ? '处理中…' : '选择工作项附件'}
        </button>
        <p className="yuance-ui-muted">选择文件后会自动登记、直传对象存储并刷新附件列表。</p>
      </form> : null}
      {status ? <p className="work-item-attachment-status" aria-live="polite">{status}</p> : null}
      {warning ? <p className="work-item-attachment-warning" aria-live="polite">{warning}</p> : null}
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
      {attachments.length ? (
        <AttachmentList attachments={attachments} downloadLabel="附件" downloadingId={downloadingId} revealableId={revealableId} onPreview={onPreview} onDownload={onDownload} onReveal={onReveal} showCreator renderExtraAction={(attachment) => canUpload && ['pending', 'failed'].includes(attachment.status) ? <button className="yuance-ui-button yuance-ui-button-secondary" type="button" onClick={() => onRetryUpload(attachment)} disabled={uploading || mutationBusy}>继续上传</button> : null} />
      ) : <p className="yuance-ui-empty">当前没有工作项附件。</p>}
    </section>
  );
}
