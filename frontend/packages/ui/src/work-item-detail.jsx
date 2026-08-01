// @ts-check

import React from 'react';

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
 *   editForm: EditForm,
 *   handoffForm: HandoffForm,
 *   statusOptions: string[],
 *   priorityOptions: string[],
 *   statusLabel: (status: string) => string,
 *   mutationBusy: boolean,
 *   editSubmitting: boolean,
 *   handoffSubmitting: boolean,
 *   error: string,
 *   parentHref: string,
 *   onOpenParent: (event: import('react').MouseEvent<HTMLAnchorElement>) => void,
 *   onChangeEdit: (event: FieldChangeEvent) => void,
 *   onChangeHandoff: (event: FieldChangeEvent) => void,
 *   onSubmitEdit: (event: import('react').FormEvent<HTMLFormElement>) => void,
 *   onSubmitHandoff: (event: import('react').FormEvent<HTMLFormElement>) => void,
 * }} props
 */
export function WorkItemDetail({
  item,
  editForm,
  handoffForm,
  statusOptions,
  priorityOptions,
  statusLabel,
  mutationBusy,
  editSubmitting,
  handoffSubmitting,
  error,
  parentHref,
  onOpenParent,
  onChangeEdit,
  onChangeHandoff,
  onSubmitEdit,
  onSubmitHandoff,
}) {
  return (
    <>
      <section className="work-item-detail-grid">
        <article className="work-item-detail-panel">
          <h3>描述</h3>
          <p className="work-item-detail-description">{item.description || '暂无描述。'}</p>
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
            {item.parent_item_key ? (
              <div><dt>父级工作项</dt><dd><a className="yuance-ui-link" href={parentHref} onClick={onOpenParent}>{item.parent_item_key} · {item.parent_title}</a></dd></div>
            ) : null}
            {item.deleted_at ? <div><dt>删除时间</dt><dd>{item.deleted_at}</dd></div> : null}
          </dl>
        </article>
      </section>

      <section className="work-item-action-grid" aria-label="工作项写入操作">
        <article className="work-item-detail-panel">
          <h3>编辑工作项</h3>
          <form className="work-item-action-form" onSubmit={onSubmitEdit}>
            <label className="work-item-form-field work-item-form-field-wide"><span>标题</span><input name="title" value={editForm.title} onChange={onChangeEdit} required /></label>
            <label className="work-item-form-field work-item-form-field-wide"><span>描述</span><textarea name="description" rows={4} value={editForm.description} onChange={onChangeEdit} /></label>
            <label className="work-item-form-field"><span>状态</span><select name="status" value={editForm.status} onChange={onChangeEdit}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="work-item-form-field"><span>优先级</span><select name="priority" value={editForm.priority} onChange={onChangeEdit}>{priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label className="work-item-form-field"><span>处理人用户名</span><input name="assigneeUsername" value={editForm.assigneeUsername} onChange={onChangeEdit} placeholder="例如 yuance_admin" /></label>
            <label className="work-item-form-field"><span>截止日期</span><input name="dueDate" type="date" value={editForm.dueDate} onChange={onChangeEdit} /></label>
            {item.item_type === 'task' ? (
              <label className="work-item-form-field work-item-form-field-wide"><span>父级工作项 Key</span><input name="parentItemKey" value={editForm.parentItemKey} onChange={onChangeEdit} placeholder="不关联可留空" /></label>
            ) : null}
            <div className="work-item-form-actions"><button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{editSubmitting ? '保存中…' : '保存修改'}</button></div>
          </form>
        </article>

        <article className="work-item-detail-panel">
          <h3>推进并指派</h3>
          <form className="work-item-action-form" onSubmit={onSubmitHandoff}>
            <label className="work-item-form-field"><span>目标状态</span><select name="status" value={handoffForm.status} onChange={onChangeHandoff}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="work-item-form-field"><span>指派给用户名</span><input name="assigneeUsername" value={handoffForm.assigneeUsername} onChange={onChangeHandoff} placeholder="例如 yuance_admin" /></label>
            <label className="work-item-form-field work-item-form-field-wide"><span>处理说明</span><textarea name="body" rows={5} value={handoffForm.body} onChange={onChangeHandoff} placeholder="说明本次指派、处理进展或下一步" /></label>
            <div className="work-item-form-actions"><button className="yuance-ui-button" type="submit" disabled={mutationBusy}>{handoffSubmitting ? '提交中…' : '确认推进'}</button></div>
          </form>
        </article>
      </section>
      {error ? <p className="work-item-action-error" role="alert">{error}</p> : null}
    </>
  );
}
