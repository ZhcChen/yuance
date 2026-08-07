// @ts-check

import React from 'react';
import { RichTextContent, RichTextEditor } from './rich-text.jsx';

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
 *   onSubmitEdit: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onSubmitHandoff: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onRequestLifecycleAction: (action: 'close' | 'reopen' | 'restore') => void,
 * }} props
 */
export function WorkItemDetail({
  item,
  primaryPost,
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
}) {
  const previous = navigation.previous;
  const next = navigation.next;
  const isDeleted = Boolean(item.deleted_at.trim());
  return (
    <>
      <nav className="work-item-sequence-navigation" aria-label="工作项前后项导航">
        {previous ? <a href={buildDetailHref(previous.item_key)} onClick={(event) => onOpenDetail(event, previous.item_key)}>上一项 · {previous.title}</a> : <span>已是第一项</span>}
        {next ? <a href={buildDetailHref(next.item_key)} onClick={(event) => onOpenDetail(event, next.item_key)}>下一项 · {next.title}</a> : <span>已是最后一项</span>}
      </nav>
      <section className="work-item-detail-grid">
        <article className="work-item-detail-panel">
          <h3>描述</h3>
          <RichTextContent html={primaryPost?.body || item.description} format={primaryPost?.body_format || 'plain'} emptyText="暂无描述。" />
        </article>
        <article className="work-item-detail-panel">
          <h3>关键信息</h3>
          <dl className="work-item-detail-meta">
            <div><dt>状态</dt><dd>{statusLabel(item.status)}</dd></div>
            <div><dt>优先级</dt><dd>{item.priority || '未设置'}</dd></div>
            <div><dt>处理人</dt><dd>{item.assignee || '未分配'}</dd></div>
            <div><dt>报告人</dt><dd>{item.reporter || '未知'}</dd></div>
            <div><dt>截止日期</dt><dd>{item.due_date || '未设置'}</dd></div>
            <div><dt>创建时间</dt><dd>{item.created_at || '未知'}</dd></div>
            <div><dt>更新时间</dt><dd>{item.updated_at || '未知'}</dd></div>
            <div><dt>所属项目</dt><dd>{item.project_key} · {item.project_name}</dd></div>
            {cycleLabel ? <div><dt>所属周期</dt><dd>{cycleLabel}</dd></div> : null}
            {item.parent_item_key ? (
              <div><dt>父级工作项</dt><dd><a className="yuance-ui-link" href={parentHref} onClick={onOpenParent}>{item.parent_item_key} · {item.parent_title}</a></dd></div>
            ) : null}
            {item.deleted_at ? <div><dt>删除时间</dt><dd>{item.deleted_at}</dd></div> : null}
          </dl>
        </article>
      </section>

      {canManageWorkItems && !isDeleted ? <section className="work-item-action-grid" aria-label="工作项写入操作">
        {canEditPrimaryPost ? <article className="work-item-detail-panel">
          <h3>编辑工作项</h3>
          <form className="work-item-action-form" onSubmit={onSubmitEdit}>
            <label className="work-item-form-field work-item-form-field-wide"><span>标题</span><input name="title" value={editForm.title} onChange={onChangeEdit} required /></label>
            <div className="work-item-form-field work-item-form-field-wide"><span>主内容</span><RichTextEditor id="work-item-primary-post" value={editForm.description} disabled={mutationBusy} label="主内容" onChange={onChangeDescription} /></div>
            <label className="work-item-form-field"><span>状态</span><select name="status" value={editForm.status} onChange={onChangeEdit}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>优先级</span><select name="priority" value={editForm.priority} onChange={onChangeEdit}>{priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label className="work-item-form-field"><span>处理人</span><select name="assigneeUsername" value={editForm.assigneeUsername} onChange={onChangeEdit}><option value="">未分配</option>{assigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>截止日期</span><input name="dueDate" type="date" value={editForm.dueDate} onChange={onChangeEdit} /></label>
            {item.item_type === 'task' ? (
              <label className="work-item-form-field work-item-form-field-wide"><span>父级需求</span><select name="parentItemKey" value={editForm.parentItemKey} onChange={onChangeEdit}><option value="">不关联</option>{parentOptions.map((option) => <option key={option.key} value={option.key}>{option.key} · {option.title}</option>)}</select></label>
            ) : null}
            <div className="work-item-form-actions"><button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{editSubmitting ? '保存中…' : '保存修改'}</button></div>
          </form>
        </article> : null}

        <article className="work-item-detail-panel">
          <h3>推进并指派</h3>
          <form className="work-item-action-form" onSubmit={onSubmitHandoff}>
            <label className="work-item-form-field"><span>目标状态</span><select name="status" value={handoffForm.status} onChange={onChangeHandoff}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label className="work-item-form-field"><span>指派给</span><select name="assigneeUsername" value={handoffForm.assigneeUsername} onChange={onChangeHandoff}><option value="">未分配</option>{assigneeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="work-item-form-field work-item-form-field-wide"><span>处理说明</span><textarea name="body" rows={5} value={handoffForm.body} onChange={onChangeHandoff} placeholder="说明本次指派、处理进展或下一步" /></label>
            <div className="work-item-form-actions"><button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{handoffSubmitting ? '提交中…' : '确认推进'}</button></div>
          </form>
        </article>
      </section> : <p className="shell-muted">{isDeleted ? '该工作项已删除，恢复前不可编辑。' : '当前项目权限为只读。'}</p>}
      <section className="work-item-detail-panel" aria-labelledby="work-item-flow-history-title">
        <h3 id="work-item-flow-history-title">流转历史</h3>
        {flowHistory.items.length ? <ol className="work-item-flow-history">{flowHistory.items.map((record, index) => <li key={`${record.created_at}-${index}`}><strong>{record.actor}</strong><span>{record.summary}</span><time>{record.created_at}</time></li>)}</ol> : <p className="shell-muted">暂无流转记录。</p>}
        {flowHistory.pagination.total_items > flowHistory.items.length ? <p className="shell-muted">共 {flowHistory.pagination.total_items} 条，当前显示最近 {flowHistory.items.length} 条。</p> : null}
      </section>
      {canCloseWorkItem || canReopenWorkItem || canRestoreWorkItem ? (
        <section className="work-item-detail-panel" aria-label="工作项生命周期操作">
          <h3>生命周期</h3>
          <div className="work-item-form-actions">
            {canCloseWorkItem ? <button className="yuance-ui-button yuance-ui-button-danger" type="button" disabled={mutationBusy} onClick={() => onRequestLifecycleAction('close')}>关闭工作项</button> : null}
            {canReopenWorkItem ? <button className="yuance-ui-button" type="button" disabled={mutationBusy} onClick={() => onRequestLifecycleAction('reopen')}>重新打开</button> : null}
            {canRestoreWorkItem ? <button className="yuance-ui-button" type="button" disabled={mutationBusy} onClick={() => onRequestLifecycleAction('restore')}>恢复工作项</button> : null}
          </div>
        </section>
      ) : null}
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
    </>
  );
}
