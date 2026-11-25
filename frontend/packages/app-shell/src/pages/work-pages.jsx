// @ts-check
// 由 app.jsx 拆出的页面（行为不变）：状态与处理函数经 ctx 传入。

import { WORK_ITEM_PRIORITY_OPTIONS, dashboardCompletedProjectCount, dashboardPendingAssignedTotal, dashboardProjectStatus, dashboardProjectStatusTone, dashboardTimestamp, formatTimestamp, notificationKindLabel, workItemStatusLabel, workItemStatusPillTone, workItemStatusTone } from '../app-helpers.jsx';
import { buildProjectDetailPath, buildProjectPersonalAnalysisPath, buildWorkItemDetailPath, buildWorkItemListPath } from '@yuance/frontend-app-core';
import { Badge, Button, EmptyState, Icon, Metric, Modal, Panel, StatusPill, UserAvatar, WorkItemAttachments, WorkItemComments, WorkItemDetail } from '@yuance/frontend-ui';

/** @param {{ ctx: any }} props */
export function WorkItemDetailPage({ ctx }) {
  const { AttachmentPreview, activateWorkItemCommentInlineAttachment, activateWorkItemPrimaryPostInlineAttachment, activeWorkItemDetail, activeWorkItemDetailView, activeWorkItemResourceLibraryLink, cancelWorkItemCommentDraft, cancelWorkItemCommentEdit, cancelWorkItemCommentReply, changeWorkItemEditComment, changeWorkItemEditField, changeWorkItemHandoffField, changeWorkItemNewComment, confirmWorkItemCommentAttachmentDelete, detailBackPath, documentViewer, downloadWorkItemAttachment, downloadWorkItemCommentAttachment, handleNavigate, navigateWorkItemAttachmentPreview, navigateWorkItemCommentAttachmentPreview, openWorkItemAttachmentPreview, openWorkItemCommentAttachmentPreview, pasteWorkItemCommentFile, pasteWorkItemPrimaryPostFile, projectAttachmentPreview, recordWorkItemTypingActivity, releaseProjectAttachmentPreview, requestWorkItemCommentAttachmentDelete, requestWorkItemResourceLibraryLink, resolveWorkItemCommentInlineAttachmentSource, resolveWorkItemPrimaryPostInlineAttachmentSource, setWorkItemCommentAttachmentDeleteTarget, setWorkItemEditForm, setWorkItemLifecycleAction, setWorkItemNewCommentAssignStatus, setWorkItemReplyAssignStatus, setWorkItemReplyCommentBody, startWorkItemCommentEdit, startWorkItemCommentReply, startWorkItemTyping, stopWorkItemTyping, submitWorkItemComment, submitWorkItemCommentEdit, submitWorkItemCommentReply, submitWorkItemEdit, submitWorkItemHandoff, uploadSelectedWorkItemAttachment, uploadSelectedWorkItemCommentAttachment, user, workItemActionError, workItemAttachmentActionError, workItemAttachmentDownloadingId, workItemAttachmentLoadWarning, workItemAttachmentStatus, workItemAttachmentUploading, workItemAttachments, workItemCommentActionError, workItemCommentAttachmentDeleteTarget, workItemCommentAttachmentDeletingId, workItemCommentAttachmentDownloadingKey, workItemCommentAttachmentStatus, workItemCommentAttachmentUploadingId, workItemCommentAttachments, workItemCommentSubmitting, workItemComments, workItemEditCommentBody, workItemEditCommentSubmitting, workItemEditForm, workItemEditSubmitting, workItemEditingCommentId, workItemHandoffForm, workItemHandoffSubmitting, workItemMutationSubmitting, workItemNewCommentAssignStatus, workItemNewCommentAttachmentUploading, workItemNewCommentBody, workItemNewCommentDraftId, workItemOwner, workItemProjectPath, workItemReplyAssignStatus, workItemReplyCommentBody, workItemReplySubmitting, workItemReplyingToCommentId, workItemResourceLibrarySubmitting, workItemTyping, workItemWorkbenchPath } = ctx;
  return (
    <>
            <section className="work-item-detail-center" aria-label="工作项详情">
              {activeWorkItemDetail ? (
                <>
                  <WorkItemDetail
                    item={activeWorkItemDetail}
                    primaryPost={activeWorkItemDetailView?.primary_post || null}
                    resolveAttachmentSource={activeWorkItemDetailView?.primary_post ? resolveWorkItemPrimaryPostInlineAttachmentSource : undefined}
                    onAttachmentActivate={activeWorkItemDetailView?.primary_post ? activateWorkItemPrimaryPostInlineAttachment : undefined}
                    editForm={workItemEditForm}
                    handoffForm={workItemHandoffForm}
                    statusOptions={activeWorkItemDetailView?.status_options || []}
                    assigneeOptions={activeWorkItemDetailView?.assignees || []}
                    parentOptions={activeWorkItemDetailView?.parent_options || []}
                    priorityOptions={WORK_ITEM_PRIORITY_OPTIONS}
                    statusLabel={workItemStatusLabel}
                    statusTone={workItemStatusPillTone}
                    mutationBusy={workItemMutationSubmitting || workItemCommentAttachmentDeletingId !== null}
                    editSubmitting={workItemEditSubmitting}
                    handoffSubmitting={workItemHandoffSubmitting}
                    error={workItemActionError}
                    canManageWorkItems={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items)}
                    canEditPrimaryPost={Boolean(activeWorkItemDetailView?.permissions.can_edit_primary_post)}
                    canManageResourceLibraryLink={Boolean(activeWorkItemResourceLibraryLink?.can_manage)}
                    resourceLibraryLinked={Boolean(activeWorkItemResourceLibraryLink?.linked)}
                    resourceLibrarySubmitting={workItemResourceLibrarySubmitting}
                    canCloseWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_close_work_item)}
                    canReopenWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_reopen_work_item)}
                    canRestoreWorkItem={Boolean(activeWorkItemDetailView?.permissions.can_restore_work_item)}
                    cycleLabel={activeWorkItemDetailView?.cycle?.label || ''}
                    navigation={activeWorkItemDetailView?.navigation || { previous: null, next: null }}
                    flowHistory={activeWorkItemDetailView?.flow_history || { items: [], pagination: { page: 1, per_page: 10, total_items: 0, total_pages: 1 } }}
                    buildDetailHref={(itemKey) => buildWorkItemDetailPath({ owner: workItemOwner, itemKey })}
                    onOpenDetail={(event, itemKey) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey }), `已打开 ${itemKey}。`)}
                    parentHref={buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key })}
                    onOpenParent={(event) => handleNavigate(event, buildWorkItemDetailPath({ owner: workItemOwner, itemKey: activeWorkItemDetail.parent_item_key }), `已打开 ${activeWorkItemDetail.parent_item_key}。`)}
                    onChangeEdit={changeWorkItemEditField}
                    onChangeDescription={(description) => setWorkItemEditForm((current) => ({ ...current, description }))}
                    onChangeHandoff={changeWorkItemHandoffField}
                    onSubmitEdit={submitWorkItemEdit}
                    onSubmitHandoff={submitWorkItemHandoff}
                    onRequestLifecycleAction={setWorkItemLifecycleAction}
                    onRequestResourceLibraryLink={requestWorkItemResourceLibraryLink}
                    onPasteFile={(file, options) => pasteWorkItemPrimaryPostFile(file, options)}
                    backHref={detailBackPath}
                    onOpenBack={(event) => handleNavigate(event, detailBackPath, '已返回工作项列表。')}
                    workbenchHref={workItemWorkbenchPath}
                    projectHref={workItemProjectPath}
                    onNavigate={handleNavigate}
                  >

                  <AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} strategy={projectAttachmentPreview?.strategy || null} fileType={projectAttachmentPreview?.fileType || null} contentType={projectAttachmentPreview?.attachment?.content_type || ''} loading={projectAttachmentPreview?.loading} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) { if (projectAttachmentPreview.commentId) navigateWorkItemCommentAttachmentPreview(projectAttachmentPreview.previousId); else navigateWorkItemAttachmentPreview(projectAttachmentPreview.previousId); } }} onNext={() => { if (projectAttachmentPreview?.nextId) { if (projectAttachmentPreview.commentId) navigateWorkItemCommentAttachmentPreview(projectAttachmentPreview.nextId); else navigateWorkItemAttachmentPreview(projectAttachmentPreview.nextId); } }} onDownload={() => { if (projectAttachmentPreview?.attachment) { if (projectAttachmentPreview.commentId) void downloadWorkItemCommentAttachment(projectAttachmentPreview.commentId, projectAttachmentPreview.attachment); else void downloadWorkItemAttachment(projectAttachmentPreview.attachment); } }} onClose={() => void releaseProjectAttachmentPreview()} documentViewer={documentViewer} />

                  <WorkItemComments
                    comments={workItemComments}
                    attachmentsByComment={workItemCommentAttachments}
                    attachmentStatusByComment={workItemCommentAttachmentStatus}
                    uploadingCommentId={workItemCommentAttachmentUploadingId}
                    downloadingKey={workItemCommentAttachmentDownloadingKey}
                    mutationBusy={workItemMutationSubmitting}
                    canWriteComments={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items && !activeWorkItemDetail.deleted_at)}
                    currentUsername={user?.username || ''}
                    mentionOptions={(activeWorkItemDetailView?.assignees || []).map((option) => ({ username: option.value, displayName: option.label }))}
                    statusOptions={activeWorkItemDetailView?.status_options || []}
                    assigneeTarget={activeWorkItemDetail.reporter_username || ''}
                    newCommentAssignStatus={workItemNewCommentAssignStatus}
                    replyAssignStatus={workItemReplyAssignStatus}
                    editingCommentId={workItemEditingCommentId}
                    replyingToCommentId={workItemReplyingToCommentId}
                    newCommentBody={workItemNewCommentBody}
                    newCommentDraftId={workItemNewCommentDraftId}
                    newCommentAttachments={workItemNewCommentDraftId === null ? [] : (workItemCommentAttachments[String(workItemNewCommentDraftId)] || [])}
                    newCommentAttachmentStatus={workItemNewCommentDraftId === null ? '' : (workItemCommentAttachmentStatus[String(workItemNewCommentDraftId)] || '')}
                    newCommentAttachmentUploading={workItemNewCommentAttachmentUploading}
                    editCommentBody={workItemEditCommentBody}
                    replyCommentBody={workItemReplyCommentBody}
                    commentSubmitting={workItemCommentSubmitting}
                    editSubmitting={workItemEditCommentSubmitting}
                    deletingAttachmentId={workItemCommentAttachmentDeletingId}
                    replySubmitting={workItemReplySubmitting}
                    error={workItemCommentActionError}
                    typingUsers={workItemTyping.itemKey === activeWorkItemDetail.key ? workItemTyping.users : []}
                    onTypingStart={startWorkItemTyping}
                    onTypingActivity={recordWorkItemTypingActivity}
                    onTypingStop={stopWorkItemTyping}
                    onSubmitNew={submitWorkItemComment}
                    onChangeNew={changeWorkItemNewComment}
                    onChangeNewAssignStatus={setWorkItemNewCommentAssignStatus}
                    onChangeReplyAssignStatus={setWorkItemReplyAssignStatus}
                    onUploadNewAttachment={() => void uploadSelectedWorkItemCommentAttachment(null)}
                    onCancelNewDraft={() => void cancelWorkItemCommentDraft()}
                    onSubmitEdit={submitWorkItemCommentEdit}
                    onChangeEdit={changeWorkItemEditComment}
                    onSubmitReply={submitWorkItemCommentReply}
                    onChangeReply={setWorkItemReplyCommentBody}
                    onCancelEdit={cancelWorkItemCommentEdit}
                    onCancelReply={cancelWorkItemCommentReply}
                    onStartEdit={startWorkItemCommentEdit}
                    onStartReply={startWorkItemCommentReply}
                    onUploadAttachment={(commentId) => void uploadSelectedWorkItemCommentAttachment(commentId)}
                    onPreviewAttachment={(commentId, attachment) => void openWorkItemCommentAttachmentPreview(commentId, attachment)}
                    onDownloadAttachment={(commentId, attachment) => void downloadWorkItemCommentAttachment(commentId, attachment)}
                    onRequestDeleteAttachment={requestWorkItemCommentAttachmentDelete}
                    onPasteFile={pasteWorkItemCommentFile}
                    resolveAttachmentSource={resolveWorkItemCommentInlineAttachmentSource}
                    onAttachmentActivate={activateWorkItemCommentInlineAttachment}
                    buildAttachmentThumbnailUrl={(commentId, attachment) => `/web/work-items/${encodeURIComponent(activeWorkItemDetail.key)}/comments/${commentId}/attachments/${attachment.id}/download`}
                  />
                  {workItemAttachments.length > 0 || workItemAttachmentUploading || workItemAttachmentStatus || workItemAttachmentLoadWarning || workItemAttachmentActionError ? (
                    <WorkItemAttachments
                      attachments={workItemAttachments}
                      status={workItemAttachmentStatus}
                      warning={workItemAttachmentLoadWarning}
                      error={workItemAttachmentActionError}
                      uploading={workItemAttachmentUploading}
                      mutationBusy={workItemMutationSubmitting}
                      canUpload={Boolean(activeWorkItemDetailView?.permissions.can_manage_work_items && !activeWorkItemDetail.deleted_at)}
                      downloadingId={workItemAttachmentDownloadingId}
                      onChooseUpload={() => void uploadSelectedWorkItemAttachment()}
                      onRetryUpload={(attachment) => void uploadSelectedWorkItemAttachment(attachment)}
                      onPreview={(attachment) => void openWorkItemAttachmentPreview(attachment)}
                      onDownload={(attachment) => void downloadWorkItemAttachment(attachment)}
                    />
                  ) : null}
                  </WorkItemDetail>
                  <Modal open={Boolean(workItemCommentAttachmentDeleteTarget)} title={workItemCommentAttachmentDeleteTarget?.editorContext === 'primary-post' ? '删除主内容附件' : '删除评论附件'} onClose={() => { if (workItemCommentAttachmentDeletingId === null) setWorkItemCommentAttachmentDeleteTarget(null); }} footer={<><Button variant="secondary" disabled={workItemCommentAttachmentDeletingId !== null} onClick={() => setWorkItemCommentAttachmentDeleteTarget(null)}>取消</Button><Button variant="danger" loading={workItemCommentAttachmentDeletingId !== null} onClick={() => void confirmWorkItemCommentAttachmentDelete()}>确认删除</Button></>}>
                    <p>确认删除“{workItemCommentAttachmentDeleteTarget?.attachment.filename}”？对象存储中的文件和{workItemCommentAttachmentDeleteTarget?.editorContext === 'primary-post' ? '主内容' : '评论正文'}中的附件引用都会立即删除。</p>
                  </Modal>
                </>
              ) : (
                <p className="shell-empty">工作项详情暂不可用。</p>
              )}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function HomePage({ ctx }) {
  const { currentProject, dashboard, dashboardQueuePath, dashboardTableRef, dashboardTableScrollbar, handleNavigate, handleOpenNotification, headingRef, loadRouteState, messageOpeningId, messagesPath, projectsPath, route, routeRef, setProjectCreateOpen, user } = ctx;
  return (
    <>
            <section className="dashboard-page">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 ref={headingRef} tabIndex={-1}>工作台</h1>
                  <p className="page-head__desc">{currentProject?.name ? `当前项目「${currentProject.name}」，` : ''}按最近更新排序展示全部可见项目的待处理与进行中情况。</p>
                </div>
                <div className="page-head__actions">
                  <Button variant="secondary" onClick={() => void loadRouteState(routeRef.current, 'refresh')}>刷新</Button>
                  {dashboard?.can_manage_projects ? <Button onClick={() => setProjectCreateOpen(true)}>新建项目</Button> : null}
                </div>
              </div>

              <section className="metric-grid dashboard-metrics" aria-label="工作台概览">
                <Metric label="进行中项目" value={dashboard?.metrics.active_projects || 0} delta={`共 ${dashboard?.projects.length || 0} 个可见项目`} icon={<Icon name="folder" />} variant="brand" />
                <Metric label="我的待处理" value={dashboardPendingAssignedTotal(dashboard?.metrics)} delta={`需求 ${dashboard?.metrics.requirements || 0} · 任务 ${dashboard?.metrics.tasks || 0} · Bug ${dashboard?.metrics.bugs || 0}`} icon={<Icon name="inbox" />} variant="warning" />
                <Metric label="已完成项目" value={dashboardCompletedProjectCount(dashboard?.projects)} delta="已验收或已归档" icon={<Icon name="check" />} variant="success" />
                <Metric label="高优先级" value={dashboard?.metrics.high_priority || 0} delta="P0 / P1 未完成" icon={<Icon name="alert" />} variant="danger" />
              </section>

              <div className="workspace-grid">
                <div className="workspace-main">
                  <Panel title="项目推进" description={`共 ${dashboard?.projects.length || 0} 个可见项目`} actions={<a className="yc-button yc-button-ghost yc-button-sm" href={projectsPath} onClick={(event) => handleNavigate(event, projectsPath, '已打开项目列表。')}>全部项目</a>} flush>
                    <div ref={dashboardTableRef} className="table-wrap yc-overlay-scroll-target">
                      <table className="compact-table"><thead><tr><th>项目</th><th>工作项</th><th>我的待处理</th><th>状态</th><th>更新</th><th className="table-actions">操作</th></tr></thead>
                        <tbody>{dashboard?.projects.length ? dashboard.projects.map((project) => {
                          const detailPath = buildProjectDetailPath({ owner: route.owner, projectKey: project.key });
                          const analysisPath = buildProjectPersonalAnalysisPath({ owner: route.owner, projectKey: project.key });
                          const requirementPath = buildWorkItemListPath({ owner: route.owner, itemType: 'requirement', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                          const taskPath = buildWorkItemListPath({ owner: route.owner, itemType: 'task', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                          const bugPath = buildWorkItemListPath({ owner: route.owner, itemType: 'bug', projectKey: project.key, status: 'pending', assigneeUsername: user?.username || '' });
                          const status = dashboardProjectStatus(project.status);
                          return <tr key={project.key}><td><div className="table-title-cell"><a href={detailPath} title={project.name} onClick={(event) => handleNavigate(event, detailPath, `已打开项目 ${project.name}。`)}>{project.name}</a><span className="table-title-meta"><code>{project.key}</code>{project.owner ? <span title="项目负责人">{project.owner}</span> : null}</span></div></td><td><div className="work-count-cell" title="未完成：待处理、进行中、待确认"><strong>{project.active_work_item_count}</strong><span>未完成 / 共 {project.work_item_count}</span></div></td><td><div className="pending-shortcuts" aria-label={`${project.name}个人待处理`}><a href={requirementPath} onClick={(event) => handleNavigate(event, requirementPath, '已打开个人待处理需求。')}>需求 <strong>{project.pending_requirements}</strong></a><a href={taskPath} onClick={(event) => handleNavigate(event, taskPath, '已打开个人待处理任务。')}>任务 <strong>{project.pending_tasks}</strong></a><a href={bugPath} onClick={(event) => handleNavigate(event, bugPath, '已打开个人待处理 Bug。')}>Bug <strong>{project.pending_bugs}</strong></a></div></td><td><StatusPill tone={dashboardProjectStatusTone(status.tone)}>{status.label}</StatusPill></td><td className="table-muted">{formatTimestamp(project.updated_at)}</td><td className="table-actions"><a className="yc-button yc-button-secondary yc-button-sm" href={analysisPath} onClick={(event) => handleNavigate(event, analysisPath, `已打开 ${project.name} 个人分析。`)}>查看</a></td></tr>;
                        }) : <tr><td colSpan={6} className="dashboard-table-empty">暂无可查看的项目。</td></tr>}</tbody>
                      </table>
                    </div>{dashboardTableScrollbar.scrollbar}
                  </Panel>

                  <Panel title="我的待处理" description="全部可见项目 · 按最近更新排序" actions={<a className="yc-button yc-button-ghost yc-button-sm" href={dashboardQueuePath} onClick={(event) => handleNavigate(event, dashboardQueuePath, '已打开我的待处理列表。')}>查看全部</a>} flush>
                    {dashboard?.assigned_items.length ? (
                      <ul className="list-rows">
                        {dashboard.assigned_items.map((item) => {
                          const detailPath = buildWorkItemDetailPath({ owner: route.owner, itemKey: item.key });
                          return (
                            <li key={item.key}>
                              <a className="list-row" href={detailPath} onClick={(event) => handleNavigate(event, detailPath, `已打开工作项 ${item.key}。`)}>
                                <span className={`list-row__dot list-row__dot--${workItemStatusTone(item.status)}`} aria-hidden="true" />
                                <span className="list-row__main">
                                  <span className="list-row__title">{item.title}</span>
                                  <span className="list-row__meta"><code>{item.key}</code><span>{item.project_name || item.project_key}</span></span>
                                </span>
                                <span className="list-row__side"><StatusPill tone={workItemStatusPillTone(item.status)}>{workItemStatusLabel(item.status)}</StatusPill></span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <EmptyState icon={<Icon name="inbox" />} title="暂无待处理工作项" description="指派给你的需求、任务与 Bug 会按最近更新出现在这里。" />
                    )}
                  </Panel>
                </div>

                <aside className="workspace-side" aria-label="最近动态">
                  <Panel title="待我处理讨论" description={`${dashboard?.pending_discussion_count || 0} 条未读`} actions={<a className="yc-button yc-button-ghost yc-button-sm" href={messagesPath} onClick={(event) => handleNavigate(event, messagesPath, '已打开消息中心。')}>消息中心</a>} flush>
                    {dashboard?.pending_discussions.length ? (
                      <ul className="list-rows">
                        {dashboard.pending_discussions.map((item) => (
                          <li key={item.id}>
                            <button className="list-row" type="button" disabled={messageOpeningId !== null} onClick={() => void handleOpenNotification(item)}>
                              <UserAvatar name={item.actor} className="list-row__avatar" />
                              <span className="list-row__main">
                                <span className="list-row__title">{item.title}</span>
                                <span className="list-row__meta"><span>{item.actor}</span><span>{dashboardTimestamp(item.created_at)}</span></span>
                              </span>
                              <span className="list-row__side"><Badge tone="brand">{notificationKindLabel(item.kind)}</Badge></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState icon={<Icon name="message" />} title="暂无待处理讨论" description="新的提及和回复会显示在这里。" />
                    )}
                  </Panel>

                  <Panel title="最近动态">
                    <ol className="timeline">
                      {dashboard?.activities.length ? dashboard.activities.map((activity) => (
                        <li className="timeline__item" key={activity.id}>
                          <UserAvatar name={activity.actor} className="timeline__avatar" />
                          <div className="timeline__body">
                            <p className="timeline__title">{activity.summary}</p>
                            <p className="timeline__meta"><span>{activity.actor}</span><span>{dashboardTimestamp(activity.created_at)}</span></p>
                          </div>
                        </li>
                      )) : <li className="timeline__item timeline__item--empty"><div className="timeline__body"><p className="timeline__title">暂无最近动态</p><p className="timeline__meta">项目活动会显示在这里。</p></div></li>}
                    </ol>
                  </Panel>
                </aside>
              </div>
            </section>
    </>
  );
}
