// @ts-check

import React, { useState } from 'react';
import { RichTextContent, RichTextEditor } from './rich-text.jsx';
import { Button, Modal, PriorityBadge } from './primitives.jsx';
import { UserAvatar } from './user-avatar.jsx';

/**
 * @typedef {object} WorkItemDetail
 * @property {string} key
 * @property {string} item_type
 * @property {string} title
 * @property {string} description
 * @property {string} status
 * @property {string} priority
 * @property {string} project_key
 * @property {string} project_name
 * @property {string} parent_item_key
 * @property {string} parent_title
 * @property {string} assignee_username
 * @property {string} assignee
 * @property {string} reporter
 * @property {string} due_date
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} deleted_at
 */

/** @typedef {{ title: string, description: string, status: string, priority: string, assigneeUsername: string, dueDate: string, parentItemKey: string }} EditForm */
/** @typedef {{ status: string, assigneeUsername: string, body: string }} HandoffForm */
/** @typedef {import('react').ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} FieldChangeEvent */

/**
 * @param {{
 *   item: WorkItemDetail,
 *   primaryPost: { id: number, body: string, body_format: string } | null,
 *   primaryPostAttachments: Array<{ id: number, filename: string, contentType: string, url: string }>,
 *   editForm: EditForm,
 *   handoffForm: HandoffForm,
 *   statusOptions: { value: string, label: string }[],
 *   assigneeOptions: { value: string, label: string }[],
 *   parentOptions: { key: string, title: string }[],
 *   priorityOptions: string[],
 *   statusLabel: (status: string) => string,
 *   mutationBusy: boolean,
 *   editSubmitting: boolean,
 *   handoffSubmitting: boolean,
 *   error: string,
 *   canManageWorkItems: boolean,
 *   canEditPrimaryPost: boolean,
 *   canCloseWorkItem: boolean,
 *   canReopenWorkItem: boolean,
 *   canRestoreWorkItem: boolean,
 *   cycleLabel: string,
 *   navigation: { previous: { item_key: string, title: string } | null, next: { item_key: string, title: string } | null },
 *   flowHistory: { items: { source_kind: string, actor: string, created_at: string, summary: string }[], pagination: { total_items: number } },
 *   buildDetailHref: (itemKey: string) => string,
 *   onOpenDetail: (event: import('react').MouseEvent<HTMLAnchorElement>, itemKey: string) => void,
 *   parentHref: string,
 *   onOpenParent: (event: import('react').MouseEvent<HTMLAnchorElement>) => void,
 *   onChangeEdit: (event: FieldChangeEvent) => void,
 *   onChangeDescription: (value: string) => void,
 *   onChangeHandoff: (event: FieldChangeEvent) => void,
 *   onSubmitEdit: (event: import('react').FormEvent<HTMLFormElement>) => boolean | void | Promise<boolean | void>,
 *   onSubmitHandoff: (event: import('react').FormEvent<HTMLFormElement>) => boolean | void | Promise<boolean | void>,
 *   onRequestLifecycleAction: (action: 'close' | 'reopen' | 'restore') => void,
 *   onRequestDeletePrimaryPostAttachment: (attachment: { id: number, filename: string, contentType: string, url: string }) => void,
 *   onPasteFile?: (file: File, options?: { onProgress?: (stage: 'registering' | 'signing' | 'uploading' | 'confirming') => void, onError?: (message: string) => void, isCurrent?: () => boolean }) => Promise<{ id: number, filename: string, contentType: string, url: string } | null | typeof import('./rich-text.jsx').DEFER_RICH_TEXT_PASTE>,
 *   resolveAttachmentSource?: (attachmentId: number) => Promise<{ source: string, release?: () => void | Promise<void> }>,
 *   onAttachmentActivate?: (attachmentId: number) => void,
 *   backHref: string,
 *   onOpenBack: (event: import('react').MouseEvent<HTMLAnchorElement>) => void,
 *   children?: React.ReactNode,
 * }} props
 */
export function WorkItemDetail({
  item,
  primaryPost,
  primaryPostAttachments,
  editForm,
  handoffForm,
  statusOptions,
  assigneeOptions,
  parentOptions,
  priorityOptions,
  statusLabel,
  mutationBusy,
  editSubmitting,
  handoffSubmitting,
  error,
  canManageWorkItems,
  canEditPrimaryPost,
  canCloseWorkItem,
  canReopenWorkItem,
  canRestoreWorkItem,
  cycleLabel,
  navigation,
  flowHistory,
  buildDetailHref,
  onOpenDetail,
  parentHref,
  onOpenParent,
  onChangeEdit,
  onChangeDescription,
  onChangeHandoff,
  onSubmitEdit,
  onSubmitHandoff,
  onRequestLifecycleAction,
  onRequestDeletePrimaryPostAttachment,
  onPasteFile,
  resolveAttachmentSource,
  onAttachmentActivate,
  backHref,
  onOpenBack,
  children,
}) {
  const [activePanel, setActivePanel] = useState(/** @type {'edit' | 'handoff' | 'history' | null} */ (null));
  const previous = navigation.previous;
  const next = navigation.next;
  const isDeleted = Boolean(item.deleted_at.trim());
  const closePanel = () => setActivePanel(null);
  return (
    <section className="work-item-page">
      <header className="work-item-hero">
        <a className="work-item-back" href={backHref} onClick={onOpenBack}>← 返回 {item.project_name}</a>
        <div className="work-item-title-row">
          <div><div className="work-item-identity"><span className="work-kind" data-kind={item.item_type}>{item.item_type === 'requirement' ? '需求' : item.item_type === 'bug' ? 'Bug' : '任务'}</span><span>{item.key}</span></div><h1 aria-label={`${item.key} · ${item.title}`}>{item.title}</h1></div>
          <div className="work-item-title-tags"><PriorityBadge priority={item.priority} /><span className={`status status-${item.status}`}>{statusLabel(item.status)}</span></div>
        </div>
      </header>
      {isDeleted ? <section className="work-item-deleted-panel"><div><strong>历史工作项</strong><span>该工作项已于 {item.deleted_at} 删除，当前仅供审计查看。</span></div>{canRestoreWorkItem ? <Button onClick={() => onRequestLifecycleAction('restore')}>恢复工作项</Button> : null}</section> : null}
      <div className="work-item-layout">
        <main className="work-item-content">
        <section className="work-item-description" aria-label="详情说明">
          <div className="content-section-head work-item-description-head"><div className="work-item-publisher"><UserAvatar name={item.reporter || ''} fallback="?" className="work-item-publisher-avatar" /><div className="work-item-publisher-meta"><strong className="work-item-publisher-name">{item.reporter || '未知'}</strong><span className="section-kicker work-item-publisher-role">发布人</span></div></div><span className="content-updated">更新于 {item.updated_at || '未知'}</span></div>
          <div className="work-item-description-body">
          <RichTextContent html={primaryPost?.body || item.description} format={primaryPost?.body_format || 'plain'} emptyText="暂无描述。" resolveAttachmentSource={resolveAttachmentSource} onAttachmentActivate={onAttachmentActivate} />
          </div>
        </section>
        {children}
        {!canManageWorkItems && !isDeleted ? <p className="shell-muted">当前项目权限为只读。</p> : null}
        {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
        </main>
        <aside className="work-item-action-rail" aria-label="工作项操作"><section className="work-item-action-panel">
          <div className="action-panel-head"><span className="section-kicker">当前负责人</span><strong>{item.assignee || '未分配'}</strong></div>
          <nav className="action-panel-sequence-nav" aria-label="工作项前后项导航">
            {previous ? <a className="yc-button yc-button-secondary" href={buildDetailHref(previous.item_key)} title={previous.title} onClick={(event) => onOpenDetail(event, previous.item_key)}>← 上一个{item.item_type === 'bug' ? ' Bug' : '工作项'}</a> : <span className="yc-button yc-button-secondary disabled">已是第一项</span>}
            {next ? <a className="yc-button yc-button-secondary" href={buildDetailHref(next.item_key)} title={next.title} onClick={(event) => onOpenDetail(event, next.item_key)}>下一个{item.item_type === 'bug' ? ' Bug' : '工作项'} →</a> : <span className="yc-button yc-button-secondary disabled">已是最后一项</span>}
          </nav>
          <div className="action-panel-buttons">
            {canManageWorkItems && !isDeleted ? <Button onClick={() => setActivePanel('handoff')}>指派 / 流转</Button> : null}
            {canEditPrimaryPost && !isDeleted ? <Button variant="secondary" onClick={() => setActivePanel('edit')}>编辑内容</Button> : null}
            {canManageWorkItems && !isDeleted ? <a className="yc-button yc-button-secondary" href="#work-item-comments">发表新评论</a> : null}
            <Button variant="secondary" onClick={() => setActivePanel('history')}>查看操作记录</Button>
            {canCloseWorkItem ? <Button variant="danger" onClick={() => onRequestLifecycleAction('close')}>关闭工作项</Button> : null}
            {canReopenWorkItem ? <Button variant="secondary" onClick={() => onRequestLifecycleAction('reopen')}>重新打开</Button> : null}
          </div>
          <dl className="action-panel-context"><div><dt>报告人</dt><dd>{item.reporter || '未知'}</dd></div>{item.parent_item_key ? <div><dt>父级需求</dt><dd><a href={parentHref} onClick={onOpenParent}>{item.parent_item_key} · {item.parent_title}</a></dd></div> : null}{cycleLabel ? <div><dt>所属周期</dt><dd>{cycleLabel}</dd></div> : null}<div><dt>创建时间</dt><dd>{item.created_at || '未知'}</dd></div><div><dt>截止日期</dt><dd>{item.due_date || '未设置'}</dd></div></dl>
        </section></aside>
      </div>

      {canEditPrimaryPost && !isDeleted ? <Modal open={activePanel === 'edit'} title="编辑工作项" onClose={closePanel}>
        <article className="work-item-detail-panel">
          <h3>编辑工作项</h3>
          <form id="work-item-edit-form" className="work-item-action-form" onSubmit={async (event) => { if (await onSubmitEdit(event)) setActivePanel(null); }}>
            <label className="work-item-form-field work-item-form-field-wide"><span>标题</span><input name="title" value={editForm.title} onChange={onChangeEdit} required /></label>
            <div className="work-item-form-field work-item-form-field-wide"><span>主内容</span><RichTextEditor id="work-item-primary-post" value={editForm.description} disabled={mutationBusy} label="主内容" attachments={primaryPostAttachments} onRequestRemoveAttachment={onRequestDeletePrimaryPostAttachment} onPasteFile={onPasteFile} onChange={onChangeDescription} /></div>
            <label className="work-item-form-field"><span>状态</span><select name="status" value={editForm.status} onChange={onChangeEdit}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>优先级</span><select name="priority" value={editForm.priority} onChange={onChangeEdit}>{priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label className="work-item-form-field"><span>处理人</span><select name="assigneeUsername" value={editForm.assigneeUsername} onChange={onChangeEdit}><option value="">未分配</option>{assigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>截止日期</span><input name="dueDate" type="date" value={editForm.dueDate} onChange={onChangeEdit} /></label>
            {item.item_type === 'task' ? (
              <label className="work-item-form-field work-item-form-field-wide"><span>父级需求</span><select name="parentItemKey" value={editForm.parentItemKey} onChange={onChangeEdit}><option value="">不关联</option>{parentOptions.map((option) => <option key={option.key} value={option.key}>{option.key} · {option.title}</option>)}</select></label>
            ) : null}
            <div className="work-item-form-actions"><Button variant="secondary" disabled={mutationBusy} onClick={closePanel}>取消</Button><Button type="submit" loading={editSubmitting}>保存修改</Button></div>
          </form>
        </article>
      </Modal> : null}
      {canManageWorkItems && !isDeleted ? <Modal open={activePanel === 'handoff'} title="指派 / 流转" onClose={closePanel}>
        <article className="work-item-detail-panel">
          <h3>推进并指派</h3>
          <form id="work-item-handoff-form" className="work-item-action-form" onSubmit={async (event) => { if (await onSubmitHandoff(event)) setActivePanel(null); }}>
            <label className="work-item-form-field"><span>目标状态</span><select name="status" value={handoffForm.status} onChange={onChangeHandoff}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>指派给</span><select name="assigneeUsername" value={handoffForm.assigneeUsername} onChange={onChangeHandoff}><option value="">未分配</option>{assigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="work-item-form-field work-item-form-field-wide"><span>处理说明</span><textarea name="body" rows={5} value={handoffForm.body} onChange={onChangeHandoff} placeholder="说明本次指派、处理进展或下一步" /></label>
            <div className="work-item-form-actions"><Button variant="secondary" disabled={mutationBusy} onClick={closePanel}>取消</Button><Button type="submit" loading={handoffSubmitting}>确认推进</Button></div>
          </form>
        </article>
      </Modal> : null}
      <Modal open={activePanel === 'history'} title="操作记录" onClose={closePanel} footer={<Button variant="secondary" onClick={closePanel}>关闭</Button>}>
      <section className="work-item-detail-panel work-item-flow-panel" aria-labelledby="work-item-flow-history-title">
        <h3 id="work-item-flow-history-title">流转历史</h3>
        {flowHistory.items.length ? <ol className="work-item-flow-history">{flowHistory.items.map((record, index) => <li key={`${record.created_at}-${index}`}><strong>{record.actor}</strong><span>{record.summary}</span><time>{record.created_at}</time></li>)}</ol> : <p className="shell-muted">暂无流转记录。</p>}
        {flowHistory.pagination.total_items > flowHistory.items.length ? <p className="shell-muted">共 {flowHistory.pagination.total_items} 条，当前显示最近 {flowHistory.items.length} 条。</p> : null}
      </section>
      </Modal>
    </section>
  );
}
