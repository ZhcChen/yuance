// @ts-check
// 由 app.jsx 拆出的页面（行为不变）：状态与处理函数经 ctx 传入。

import { PROJECT_RESOURCE_CATEGORY_OPTIONS, dashboardProjectStatus, dashboardProjectStatusTone, dashboardTimestamp, formatAnalysisAverage, formatChangeTimestamp, formatTimestamp, linkedWorkItemTypeLabel, projectCycleStatusLabel, projectMemberRoleLabel, projectResourceCategoryLabel, projectResourceFilterSummary, projectStatusLabel, timeAllocationActionLabel, timeAllocationActionTone, timeAllocationChangeValue, timeAllocationFieldLabel, workItemTypeLabel } from '../app-helpers.jsx';
import { ProjectResourceDetailSkeleton } from '../app-skeleton.jsx';
import { buildProjectCycleDetailPath, buildProjectDetailPath, buildProjectResourceDetailPath, buildProjectsPath, buildWorkItemDetailPath, routePathForOwner } from '@yuance/frontend-app-core';
import { Badge, Button, ContentTab, ContentTabs, DataTable, EmptyState, Feedback, Field, FilterBar, FilterField, Icon, Metric, Modal, PaginatedTable, Pagination, Panel, PriorityBadge, RichAttachmentMenu, RichTextContent, Select, StatusPill, TextArea, TextInput, LazyTimeAllocationGantt as TimeAllocationGantt, formatBusinessTimestamp } from '@yuance/frontend-ui';

/** @param {{ ctx: any }} props */
export function TimeManagementPage({ ctx }) {
  const { OverlayScrollTarget, changeTimeManagementChangesPageSize, confirmTimeChangeRestore, headingRef, loadTimeManagementChanges, persistTimeCreate, persistTimeDelete, persistTimeSave, persistTimeUpdate, setTimeChangeRestoreError, setTimeChangeRestoreTarget, setTimeChangesOpen, timeAllocations, timeChangeRestoreError, timeChangeRestoreTarget, timeChangeRestoring, timeChangesError, timeChangesLoading, timeChangesOpen, timeChangesPage, timeMembers, timeProjects, user } = ctx;
  return (
    <>
            <>
              <section className="page-stack time-management-page" aria-labelledby="time-management-title">
                <div className="page-head">
                  <div className="page-head__text">
                    <h1 id="time-management-title" ref={headingRef} tabIndex={-1}>时间管理</h1>
                    <p className="page-head__desc">按成员或项目查看排期；在成员行拖动即可生成排期，点击右上角“保存”后生效。</p>
                  </div>
                </div>
                <section className="shell-card">
                  <TimeAllocationGantt
                    allocations={timeAllocations}
                    projects={timeProjects}
                    members={timeMembers}
                    currentUsername={user?.username || ''}
                    onCreate={persistTimeCreate}
                    onUpdate={persistTimeUpdate}
                    onDelete={persistTimeDelete}
                    onSave={persistTimeSave}
                    onOpenRecords={() => {
                      setTimeChangesOpen(true);
                      void loadTimeManagementChanges(1);
                    }}
                  />
                </section>
              </section>
              <Modal
                wide
                open={timeChangesOpen}
                title="时间管理修改记录"
                onClose={() => {
                  if (!timeChangesLoading) setTimeChangesOpen(false);
                }}
                footer={<Button variant="secondary" disabled={timeChangesLoading} onClick={() => setTimeChangesOpen(false)}>关闭</Button>}
              >
                <OverlayScrollTarget axis="vertical" label="时间管理修改记录" className="time-management-changes-modal-body">
                  <p className="shell-muted">记录每次新增、更新或删除排期时的操作人与字段差异，后续可据此回退。</p>
                  {timeChangesError ? <Feedback tone="danger" title="修改记录加载失败">{timeChangesError}</Feedback> : null}
                  {timeChangesLoading && !timeChangesPage ? <p className="shell-muted">正在加载修改记录…</p> : null}
                  {timeChangesPage && !timeChangesPage.items.length ? (
                    <Feedback tone="info" title="暂无修改记录">还没有人修改过时间排期。</Feedback>
                  ) : null}
                  {timeChangesPage && timeChangesPage.items.length ? (
                    <>
                      <div className="time-management-changes-list">
                        {timeChangesPage.items.map((record) => (
                          <article className="time-management-change-record" key={record.id}>
                            <header className="time-management-change-record-head">
                              <div className="time-management-change-record-title">
                                <Badge tone={timeAllocationActionTone(record.action)}>{timeAllocationActionLabel(record.action)}</Badge>
                                <strong>{record.project_name || record.project_key}</strong>
                              </div>
                              <time>{formatChangeTimestamp(record.created_at)}</time>
                            </header>
                            <p className="time-management-change-record-summary">{record.summary}</p>
                            <div className="time-management-change-record-meta">
                              <span>操作人：{record.actor_display_name || record.actor_username}</span>
                              <span>成员：{record.after?.username || record.before?.username || '未知'}</span>
                            </div>
                            {record.action !== 'time_allocation.restored' ? (
                              <div className="time-management-change-record-actions">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={timeChangeRestoring}
                                  onClick={() => {
                                    setTimeChangeRestoreError('');
                                    setTimeChangeRestoreTarget({ id: record.id, summary: record.summary, action: record.action });
                                  }}
                                >
                                  回退
                                </Button>
                              </div>
                            ) : null}
                            {record.changes?.length ? (
                              <ul className="time-management-change-diffs">
                                {record.changes.map((change, index) => (
                                  <li key={`${change.field}-${index}`}>
                                    <span className="time-management-change-field">{timeAllocationFieldLabel(change.field)}</span>
                                    <span className="time-management-change-arrow">→</span>
                                    <code className="time-management-change-value">{timeAllocationChangeValue(change.before)}</code>
                                    <span className="time-management-change-arrow">→</span>
                                    <code className="time-management-change-value">{timeAllocationChangeValue(change.after)}</code>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </article>
                        ))}
                      </div>
                      <Pagination
                        page={timeChangesPage.pagination.page}
                        totalPages={timeChangesPage.pagination.total_pages}
                        totalItems={timeChangesPage.pagination.total_items}
                        onPageChange={(page) => void loadTimeManagementChanges(page)}
                        itemLabel="条记录"
                        rangeLabel={`当前显示 ${timeChangesPage.pagination.total_items === 0 ? 0 : (timeChangesPage.pagination.page - 1) * timeChangesPage.pagination.per_page + 1}-${Math.min(timeChangesPage.pagination.total_items, timeChangesPage.pagination.page * timeChangesPage.pagination.per_page)}`}
                        pageSize={timeChangesPage.pagination.per_page}
                        onPageSizeChange={changeTimeManagementChangesPageSize}
                      />
                    </>
                  ) : null}
                </OverlayScrollTarget>
              </Modal>
              <Modal
                open={Boolean(timeChangeRestoreTarget)}
                title="确认回退修改记录"
                onClose={() => {
                  if (!timeChangeRestoring) setTimeChangeRestoreTarget(null);
                }}
                footer={<>
                  <Button variant="secondary" disabled={timeChangeRestoring} onClick={() => setTimeChangeRestoreTarget(null)}>取消</Button>
                  <Button variant="danger" loading={timeChangeRestoring} onClick={() => void confirmTimeChangeRestore()}>确认回退</Button>
                </>}
              >
                <p>将把这条记录对应的排期恢复为操作前状态，回退操作本身也会记录在修改历史中。</p>
                <p className="shell-muted">{timeChangeRestoreTarget?.summary}</p>
                {timeChangeRestoreError ? <Feedback tone="danger" title="回退失败">{timeChangeRestoreError}</Feedback> : null}
              </Modal>
            </>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectResourceLibraryPage({ ctx }) {
  const { activeProjectDetail, canManageProjectContent, currentProject, handleNavigate, headingRef, openProjectResourceForm, projectResourceError, projectResourceFilters, projectResourceLibraryRows, projectResourceLinkedError, projectResourceStatus, projectResourceSubmitting, projectScopeKey, resetProjectResourceFilters, route, setProjectResourceFilters, submitProjectResourceFilters } = ctx;
  return (
    <>
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1 ref={headingRef} tabIndex={-1}>资料库</h1>
          <p className="page-head__desc">当前项目「{activeProjectDetail.name}」下的全部资料，可与工作项双向关联。</p>
        </div>
        <div className="page-head__actions">
          {canManageProjectContent ? <Button disabled={projectResourceSubmitting} onClick={() => openProjectResourceForm()}>新建资料</Button> : null}
        </div>
      </div>
      <Panel title="筛选条件" className="project-resource-library-filter-card" description={projectResourceFilterSummary(projectResourceFilters)} ariaLabel="项目资料筛选">
      <FilterBar className="resource-library-filter-bar" ariaLabel="项目资料筛选" onSubmit={submitProjectResourceFilters} actions={<>
        <Button type="submit" variant="secondary">筛选</Button>
        <Button type="button" variant="secondary" onClick={() => void resetProjectResourceFilters()}>重置</Button>
      </>}>
        <FilterField id="project-resource-filter-q" label="关键词"><TextInput value={projectResourceFilters.q} placeholder="标题、摘要或正文" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, q: event.target.value }))} /></FilterField>
        <FilterField id="project-resource-filter-category" label="分类">
          <Select value={projectResourceFilters.category} onChange={(event) => setProjectResourceFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">全部分类</option>
            {PROJECT_RESOURCE_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </FilterField>
        <FilterField id="project-resource-filter-status" label="状态">
          <Select value={projectResourceFilters.status} onChange={(event) => setProjectResourceFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">全部状态</option>
            <option value="active">生效中</option>
            <option value="archived">已归档</option>
          </Select>
        </FilterField>
        <FilterField id="project-resource-filter-tag" label="标签"><TextInput value={projectResourceFilters.tag} placeholder="精确匹配标签" onChange={(event) => setProjectResourceFilters((current) => ({ ...current, tag: event.target.value }))} /></FilterField>
      </FilterBar>
      </Panel>
      <Panel title="资料目录" className="project-resource-library-list-card" description={`共 ${projectResourceLibraryRows.length} 份资料`} ariaLabel="项目资料列表" flush>
        {projectResourceError ? <Feedback tone="danger" title="资料列表加载失败">{projectResourceError}</Feedback> : null}
        {projectResourceLinkedError ? <Feedback tone="danger" title="来源内容加载失败">{projectResourceLinkedError}</Feedback> : null}
        {projectResourceStatus ? <p className="resource-library-status" aria-live="polite">{projectResourceStatus}</p> : null}
        <PaginatedTable
          columns={[
            {
              key: 'title',
              label: '标题',
              className: 'resource-table-title-cell',
              render: (resource) => {
                const resourcePath = resource.row_type === 'linked-work-item'
                  ? routePathForOwner(resource.url, route.owner)
                  : buildProjectResourceDetailPath({ owner: route.owner, projectKey: projectScopeKey || currentProject?.key || '', resourceId: resource.id });
                return (
                  <div className="resource-table-title-main">
                    <a className="resource-table-title-link" href={resourcePath} title={resource.title} onClick={(event) => handleNavigate(event, resourcePath, resource.row_type === 'linked-work-item' ? `已打开 ${resource.key}。` : `已打开资料 ${resource.title}。`)}>{resource.title}</a>
                    {resource.summary ? <span className="resource-table-summary" title={resource.summary}>{resource.summary}</span> : null}
                  </div>
                );
              },
            },
            {
              key: 'category',
              label: '分类',
              className: 'resource-table-category-cell',
              render: (resource) => <span className={`resource-category resource-category-kind resource-kind-${resource.category || 'other'}`} title={resource.category || ''}>{resource.row_type === 'linked-work-item' ? '工作项发布' : projectResourceCategoryLabel(resource.category)}</span>,
            },
            {
              key: 'status',
              label: '状态',
              className: 'resource-table-status-cell',
              render: (resource) => (
                <div className="resource-table-statuses">
                  <Badge tone={resource.status === 'archived' ? 'neutral' : 'success'}>{resource.status === 'archived' ? '已归档' : '生效中'}</Badge>
                  {resource.is_protected ? <span className="resource-lock-badge">保险箱</span> : null}
                </div>
              ),
            },
            {
              key: 'tags',
              label: '标签',
              className: 'resource-table-tags-cell',
              render: (resource) => resource.tags.length
                ? <span className="resource-table-cell-text" title={resource.tags.join('、')}>{resource.tags.join('、')}</span>
                : <span className="shell-muted">—</span>,
            },
            {
              key: 'source',
              label: '来源',
              className: 'resource-table-source-cell',
              render: (resource) => {
                if (resource.row_type === 'linked-work-item') {
                  const sourcePath = routePathForOwner(resource.url, route.owner);
                  return <a className="resource-table-source-link" href={sourcePath} title={`${linkedWorkItemTypeLabel(resource.item_type)} ${resource.key}`} onClick={(event) => handleNavigate(event, sourcePath, `已打开 ${resource.key}。`)}><Badge>{linkedWorkItemTypeLabel(resource.item_type)}</Badge><span>{resource.key}</span></a>;
                }
                if (resource.related_work_item) {
                  const sourcePath = routePathForOwner(resource.related_work_item.url, route.owner);
                  return <a className="resource-table-source-link" href={sourcePath} title={resource.related_work_item.title} onClick={(event) => handleNavigate(event, sourcePath, `已打开 ${resource.related_work_item.key}。`)}><span>工作项</span><span>{resource.related_work_item.key}</span></a>;
                }
                if (resource.related_cycle) return <span className="resource-table-cell-text" title={resource.related_cycle.name}>周期 · {resource.related_cycle.name}</span>;
                return <span className="shell-muted">资料库</span>;
              },
            },
            {
              key: 'updated',
              label: '最近更新',
              className: 'resource-table-updated-cell',
              render: (resource) => <div className="resource-table-updated" title={`${resource.updated_by} · ${dashboardTimestamp(resource.updated_at)}（东八区）`}><span>{resource.updated_by}</span><small>{formatTimestamp(resource.updated_at)}</small></div>,
            },
            {
              key: 'actions',
              label: '操作',
              className: 'resource-table-actions-cell',
              render: (resource) => {
                if (resource.row_type === 'linked-work-item') {
                  const postPath = routePathForOwner(resource.url, route.owner);
                  return <a className="yc-button yc-button-secondary yc-button-sm" href={postPath} onClick={(event) => handleNavigate(event, postPath, `已打开 ${resource.key}。`)}>打开</a>;
                }
                const resourcePath = buildProjectResourceDetailPath({ owner: route.owner, projectKey: projectScopeKey || currentProject?.key || '', resourceId: resource.id });
                return <a className="yc-button yc-button-secondary yc-button-sm" href={resourcePath} onClick={(event) => handleNavigate(event, resourcePath, `已打开资料 ${resource.title}。`)}>打开</a>;
              },
            },
          ]}
          rows={projectResourceLibraryRows}
          rowKey={(resource) => resource.row_type === 'linked-work-item' ? resource.id : resource.id}
          caption="项目资料列表"
          emptyText={Object.values(projectResourceFilters).some((value) => String(value).trim())
            ? '当前筛选下没有项目资料，可以清除筛选后重新查看。'
            : (canManageProjectContent ? '还没有项目资料，可以点击右上角「新建资料」添加。' : '这个项目还没有资料。')}
          tableClassName="resource-library-table"
          tableWrapClassName="project-resource-library-table-wrap"
        />
      </Panel>
    </>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectsPage({ ctx }) {
  const { changeProjectPage, changeProjectPageSize, currentProject, handleNavigate, handleSetCurrentProject, headingRef, projectCreateDirty, projectCreateError, projectCreateForm, projectCreateOpen, projectCreateSubmitting, projectMetrics, projectPage, projectRangeEnd, projectRangeStart, projectRoute, projectSwitchingKey, route, runtime, setProjectCreateError, setProjectCreateForm, setProjectCreateOpen, submitProjectCreate, submitProjectSearch } = ctx;
  return (
    <>
            <section className="page-stack projects-page" aria-labelledby="project-center-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="project-center-title" ref={headingRef} tabIndex={-1}>项目</h1>
                  <p className="page-head__desc">{projectPage?.pagination?.total_items ?? 0} 个项目，按最近更新排序{projectRoute?.q ? `，关键词「${projectRoute.q}」` : ''}。创建后会自动把当前用户加入为项目负责人。</p>
                </div>
                <div className="page-head__actions">
                  <Button onClick={() => { setProjectCreateError(''); setProjectCreateOpen(true); }}>新建项目</Button>
                </div>
              </div>

              <section className="metric-grid project-list-metrics" aria-label="项目概览">
                <Metric label="进行中项目" value={projectMetrics.active} delta={`共 ${projectMetrics.total} 个可见项目`} icon={<Icon name="folder" />} variant="brand" />
                <Metric label="我负责的" value={projectMetrics.owned} delta="当前账号负责" icon={<Icon name="users" />} variant="info" />
                <Metric label="待处理工作项" value={projectMetrics.pending} delta="需求 / 任务 / Bug 合计" icon={<Icon name="inbox" />} variant="warning" />
                <Metric label="全部项目" value={projectMetrics.total} delta="当前可见范围" icon={<Icon name="book" />} variant="success" />
              </section>

              <Modal open={projectCreateOpen} dirty={projectCreateDirty} title="新建项目" onClose={() => { if (!projectCreateSubmitting) setProjectCreateOpen(false); }} footer={<><Button variant="secondary" disabled={projectCreateSubmitting} onClick={() => setProjectCreateOpen(false)}>取消</Button><Button loading={projectCreateSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-create-form')); form?.requestSubmit(); }}>创建</Button></>}>
                <form id="project-create-form" onSubmit={submitProjectCreate}>
                  {projectCreateError ? <Feedback tone="danger" title="创建失败">{projectCreateError}</Feedback> : null}
                  <Field id="project-create-name" label="项目名称" required><TextInput value={projectCreateForm.name} maxLength={120} onChange={(event) => setProjectCreateForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-create-status" label="状态" required><Select value={projectCreateForm.status} onChange={(event) => setProjectCreateForm((current) => ({ ...current, status: event.target.value }))}><option value="not_started">待启动</option><option value="in_progress">进行中</option><option value="acceptance">验收中</option><option value="completed">已完成</option><option value="on_hold">已暂停</option><option value="cancelled">已取消</option><option value="archived">已归档</option></Select></Field>
                  <Field id="project-create-start" label="开始日期"><TextInput type="date" value={projectCreateForm.startDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-create-due" label="截止日期"><TextInput type="date" min={projectCreateForm.startDate || undefined} value={projectCreateForm.dueDate} onChange={(event) => setProjectCreateForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-create-description" label="项目描述"><TextArea value={projectCreateForm.description} maxLength={2000} onChange={(event) => setProjectCreateForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>

              <div className="projects-filter-row">
                <div className="scope-group" role="group" aria-label="项目状态筛选">
                  {[['', '全部'], ['not_started', '待启动'], ['in_progress', '进行中'], ['acceptance', '验收中'], ['completed', '已完成'], ['on_hold', '已暂停'], ['cancelled', '已取消'], ['archived', '已归档']].map(([status, label]) => {
                    const path = buildProjectsPath({ owner: route.owner, status, q: projectRoute?.q, perPage: projectRoute?.perPage });
                    const active = (projectRoute?.status || '') === status;
                    return <a key={status || 'all'} className="scope-tab" aria-current={active ? 'true' : undefined} href={path} onClick={(event) => handleNavigate(/** @type {import('react').MouseEvent<HTMLAnchorElement>} */ (event), path, `已筛选${label}项目。`)}>{label}</a>;
                  })}
                </div>
                <form className="projects-search" onSubmit={submitProjectSearch}>
                  <TextInput type="search" name="q" defaultValue={projectRoute?.q || ''} placeholder="搜索项目名称或编号" aria-label="搜索项目" />
                </form>
              </div>

              {projectPage?.items?.length ? (
                <>
                  <div className="project-card-grid" role="list" aria-label="项目列表">
                    {projectPage.items.map((project) => {
                      const isCurrentProject = currentProject?.key === project.key;
                      const path = buildProjectDetailPath({ owner: route.owner, projectKey: project.key });
                      return (
                        <article key={project.key} className={`project-card project-row ${isCurrentProject ? 'current' : ''}`} role="listitem">
                          <div className="project-card-topline">
                            <span className="project-card-mark" aria-hidden="true">{project.name.slice(0, 1)}</span>
                            <div className="project-card-heading">
                              <a className="project-card-title" href={path} onClick={(event) => handleNavigate(event, path, `已打开项目 ${project.key}。`)}>{project.name}</a>
                              <code className="project-card-key">{project.key}</code>
                            </div>
                            {isCurrentProject ? <Badge tone="info">当前项目</Badge> : <StatusPill tone={dashboardProjectStatusTone(dashboardProjectStatus(project.status).tone)}>{projectStatusLabel(project.status)}</StatusPill>}
                          </div>
                          <div className="project-card-stats">
                            <Badge tone={project.pending_requirements ? 'brand' : 'neutral'}>需求 {project.pending_requirements || 0}</Badge>
                            <Badge>任务 {project.pending_tasks || 0}</Badge>
                            <Badge tone={project.pending_bugs ? 'danger' : 'neutral'}>Bug {project.pending_bugs || 0}</Badge>
                            <span className="project-card-total"><strong>{project.active_work_item_count}</strong><em>待处理</em></span>
                          </div>
                          <div className="project-card-foot">
                            <span>负责人 {project.owner || '未分配'}</span>
                            <span>·</span>
                            <span>{String(project.updated_at || '').slice(0, 10)}</span>
                            <Button variant="secondary" disabled={isCurrentProject || Boolean(projectSwitchingKey)} onClick={() => void handleSetCurrentProject(project)}>{isCurrentProject ? '当前项目' : projectSwitchingKey === project.key ? '切换中…' : '设为当前项目'}</Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <Pagination ariaLabel="项目分页" page={projectPage.pagination.page} totalPages={projectPage.pagination.total_pages} totalItems={projectPage.pagination.total_items} itemLabel="个项目" rangeLabel={`当前显示 ${projectRangeStart}-${projectRangeEnd}`} pageSize={projectPage.pagination.per_page} onPageSizeChange={changeProjectPageSize} onPageChange={changeProjectPage} />
                </>
              ) : (
                <EmptyState icon={<Icon name="folder" />} title={projectRoute?.q ? '没有匹配的项目' : '暂无项目'} description={projectRoute?.q ? `没有名称或编号包含「${projectRoute.q}」的项目。` : '创建第一个项目后，需求、任务和 Bug 都会归属到项目下。'} />
              )}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectDetailPage({ ctx }) {
  const { OverlayScrollTarget, activeProjectDetail, canManageProject, confirmProjectCycleClose, confirmProjectMemberRemove, handleNavigate, headingRef, openProjectCycle, openProjectEdit, openProjectMemberDialog, persistProjectTimeCreate, persistProjectTimeDelete, persistProjectTimeUpdate, personalAnalysisPath, projectCycleCloseTarget, projectCycleDirty, projectCycleForm, projectCycleOpen, projectCycles, projectEditDirty, projectEditForm, projectEditOpen, projectMemberCandidateError, projectMemberCandidateLoading, projectMemberCandidateSearch, projectMemberCandidates, projectMemberForm, projectMemberOpen, projectMemberRemoveTarget, projectMemberSelectedUsernames, projectMemberTarget, projectMembers, projectMutationError, projectMutationSubmitting, projectTimeAllocations, projectTimeAllocationsError, route, runtime, setProjectCycleCloseTarget, setProjectCycleForm, setProjectCycleOpen, setProjectEditForm, setProjectEditOpen, setProjectMemberCandidateSearch, setProjectMemberForm, setProjectMemberOpen, setProjectMemberRemoveTarget, setProjectMemberSelectedUsernames, setProjectMemberTarget, setProjectMutationError, submitProjectCycle, submitProjectEdit, submitProjectMember, submitProjectMemberRole, visibleProjectMemberCandidates } = ctx;
  return (
    <>
            <section className="page-stack project-detail-page" aria-labelledby="project-detail-title">
              <section className="page-hero detail-hero"><div><p className="shell-eyebrow">项目 / {activeProjectDetail?.key || route.projectKey}</p><h1 id="project-detail-title" ref={headingRef} tabIndex={-1}>{activeProjectDetail?.name || route.projectKey}</h1><p>{activeProjectDetail?.description || '正在加载项目详情。'}</p>{activeProjectDetail ? <div className="project-detail-meta"><Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge><span>项目负责人：{activeProjectDetail.owner || activeProjectDetail.owner_username}</span><span>创建：{dashboardTimestamp(activeProjectDetail.created_at)}</span><span>更新：{dashboardTimestamp(activeProjectDetail.updated_at)}</span></div> : null}</div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={buildProjectsPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildProjectsPath({ owner: route.owner }), '已返回项目列表。')}>项目列表</a>{canManageProject ? <Button variant="secondary" onClick={openProjectEdit}>编辑项目</Button> : null}<a className="yc-button yc-button-secondary" href={personalAnalysisPath} onClick={(event) => handleNavigate(event, personalAnalysisPath, '已打开个人项目分析。')}>个人分析</a></div></section>
              <section className="metric-grid project-detail-metrics" aria-label="项目详情概览">
                <Metric label="需求" value={activeProjectDetail?.requirements || 0} icon={<Icon name="doc" />} variant="info" />
                <Metric label="任务" value={activeProjectDetail?.tasks || 0} icon={<Icon name="task" />} variant="warning" />
                <Metric label="Bug" value={activeProjectDetail?.bugs || 0} icon={<Icon name="bug" />} variant="danger" />
                <Metric label="成员" value={projectMembers.length} icon={<Icon name="users" />} variant="success" />
              </section>
              <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">项目详情</p><h2>项目资料</h2></div><ContentTabs ariaLabel="项目详情导航">
                {[['info', '详情'], ['cycles', '周期'], ['time', '时间'], ['members', '成员']].map(([tab, label]) => {
                  const path = buildProjectDetailPath({ owner: route.owner, projectKey: route.projectKey, tab });
                  return <ContentTab key={tab} active={route.tab === tab} href={path} onClick={(event) => handleNavigate(/** @type {import('react').MouseEvent<HTMLAnchorElement>} */ (event), path, `已切换到${label}。`)}>{label}</ContentTab>;
                })}
              </ContentTabs></div><div className="project-tab-panels">
              {projectMutationError ? <Feedback tone="danger" title="项目操作失败">{projectMutationError}</Feedback> : null}
              {activeProjectDetail && route.tab === 'info' ? (
                <div className="project-detail-overview">
                  <section className="project-tab-section"><div className="project-tab-section-head"><div><h3>基础信息</h3><p>项目身份、项目负责人和生命周期状态。</p></div></div><dl className="project-detail-dl">
                    <div><dt>项目编号</dt><dd><code>{activeProjectDetail.key}</code></dd></div>
                    <div><dt>项目状态</dt><dd><Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge></dd></div>
                    <div><dt>项目负责人</dt><dd>{activeProjectDetail.owner || activeProjectDetail.owner_username}</dd></div>
                    <div><dt>开始日期</dt><dd>{activeProjectDetail.start_date || '未设置'}</dd></div>
                    <div><dt>截止日期</dt><dd>{activeProjectDetail.due_date || '未设置'}</dd></div>
                    <div><dt>创建时间</dt><dd>{dashboardTimestamp(activeProjectDetail.created_at)}</dd></div>
                    <div><dt>更新时间</dt><dd>{dashboardTimestamp(activeProjectDetail.updated_at)}</dd></div>
                  </dl></section>
                  <section className="project-tab-section project-description-section"><div className="project-tab-section-head"><div><h3>项目说明</h3><p>目标、范围和协作边界。</p></div></div><p>{activeProjectDetail.description || '暂无描述。'}</p></section>
                </div>
              ) : null}

              {activeProjectDetail && route.tab === 'members' ? (
                <section className="project-tab-section" aria-labelledby="project-members-title">
                  <div className="project-tab-section-head"><div><h3 id="project-members-title">项目成员</h3><p>共 {projectMembers.length} 名成员</p></div>{canManageProject ? <Button variant="secondary" onClick={() => void openProjectMemberDialog()}>添加成员</Button> : null}</div>
                  <DataTable
                    caption="项目成员"
                    rows={projectMembers}
                    rowKey={(member) => member.username}
                    emptyText="当前项目暂无成员。"
                    columns={[
                      { key: 'member', label: '成员', render: (member) => <><strong>{member.display_name}</strong><br /><span className="shell-muted">@{member.username}</span></> },
                      { key: 'role', label: '角色', render: (member) => projectMemberRoleLabel(member.member_role) },
                      { key: 'joined', label: '加入时间', render: (member) => formatTimestamp(member.joined_at) },
                      { key: 'actions', label: '操作', render: (member) => member.username === activeProjectDetail.owner_username || !canManageProject ? <span className="shell-muted">{member.username === activeProjectDetail.owner_username ? '负责人' : '只读'}</span> : <div className="shell-actions-inline"><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => { setProjectMutationError(''); setProjectMemberTarget(member); }}>调整角色</Button><Button variant="danger" disabled={projectMutationSubmitting} onClick={() => { setProjectMutationError(''); setProjectMemberRemoveTarget(member); }}>移除</Button></div> },
                    ]}
                  />
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'cycles' ? (
                <section className="project-tab-section" aria-labelledby="project-cycles-title">
                  <div className="project-tab-section-head"><div><h3 id="project-cycles-title">项目周期</h3><p>共 {projectCycles.length} 个周期</p></div>{canManageProject ? <Button variant="secondary" onClick={() => openProjectCycle()}>新建周期</Button> : null}</div>
                  <DataTable caption="项目周期" rows={projectCycles} rowKey={(cycle) => cycle.id} emptyText="当前项目暂无周期。" columns={[
                    { key: 'cycle', label: '周期', render: (cycle) => <><a className="shell-link" href={buildProjectCycleDetailPath({ owner: route.owner, projectKey: route.projectKey, cycleId: cycle.id })} onClick={(event) => handleNavigate(event, buildProjectCycleDetailPath({ owner: route.owner, projectKey: route.projectKey, cycleId: cycle.id }), `已打开周期 ${cycle.name}。`)}>{cycle.name}</a><br /><span className="shell-muted">{cycle.goal || '暂无目标'}</span></> },
                    { key: 'range', label: '日期', render: (cycle) => `${cycle.start_date} - ${cycle.end_date}` },
                    { key: 'owner', label: '负责人', render: (cycle) => cycle.owner || '未设置' },
                    { key: 'items', label: '工作项', render: (cycle) => `${cycle.total_items}（待处理 ${cycle.pending_count}）` },
                    { key: 'status', label: '状态', render: projectCycleStatusLabel },
                    { key: 'actions', label: '操作', render: (cycle) => canManageProject && !cycle.is_closed ? <div className="shell-actions-inline"><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => openProjectCycle(cycle)}>编辑</Button><Button variant="danger" disabled={projectMutationSubmitting} onClick={() => setProjectCycleCloseTarget(cycle)}>关闭</Button></div> : <span className="shell-muted">{cycle.is_closed ? '已关闭' : '只读'}</span> },
                  ]} />
                </section>
              ) : null}

              {activeProjectDetail && route.tab === 'time' ? (
                <section className="project-tab-section" aria-labelledby="project-time-title">
                  <div className="project-tab-section-head">
                    <div>
                      <h3 id="project-time-title">项目时间排期</h3>
                      <p>为项目成员安排时间投入，拖动色块即可调整起止日期。</p>
                    </div>
                  </div>
                  {projectTimeAllocationsError ? <Feedback tone="danger" title="时间排期加载失败">{projectTimeAllocationsError}</Feedback> : null}
                  <TimeAllocationGantt
                    allocations={projectTimeAllocations}
                    projects={[{ key: activeProjectDetail.key, name: activeProjectDetail.name }]}
                    members={projectMembers.map((member) => ({ username: member.username, display_name: member.display_name }))}
                    onCreate={persistProjectTimeCreate}
                    onUpdate={persistProjectTimeUpdate}
                    onDelete={persistProjectTimeDelete}
                  />
                </section>
              ) : null}
              </div></section>

              <Modal open={projectEditOpen} dirty={projectEditDirty} title="编辑项目" onClose={() => { if (!projectMutationSubmitting) setProjectEditOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectEditOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-edit-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-edit-form" onSubmit={submitProjectEdit}>
                  <Field id="project-edit-name" label="项目名称" required><TextInput value={projectEditForm.name} maxLength={120} onChange={(event) => setProjectEditForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field id="project-edit-status" label="状态" required><Select value={projectEditForm.status} onChange={(event) => setProjectEditForm((current) => ({ ...current, status: event.target.value }))}>{['not_started', 'in_progress', 'acceptance', 'completed', 'on_hold', 'cancelled', 'archived'].map((status) => <option key={status} value={status}>{projectStatusLabel(status)}</option>)}</Select></Field>
                  <Field id="project-edit-owner" label="负责人用户名" required><TextInput value={projectEditForm.ownerUsername} maxLength={64} onChange={(event) => setProjectEditForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field>
                  <Field id="project-edit-start" label="开始日期"><TextInput type="date" value={projectEditForm.startDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                  <Field id="project-edit-due" label="截止日期"><TextInput type="date" min={projectEditForm.startDate || undefined} value={projectEditForm.dueDate} onChange={(event) => setProjectEditForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                  <Field id="project-edit-description" label="项目描述"><TextArea value={projectEditForm.description} maxLength={2000} onChange={(event) => setProjectEditForm((current) => ({ ...current, description: event.target.value }))} /></Field>
                </form>
              </Modal>
              <Modal open={projectMemberOpen} title="添加项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} disabled={projectMemberCandidateLoading || projectMemberSelectedUsernames.length === 0} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-form'))?.requestSubmit()}>加入项目</Button></>}>
                <form id="project-member-form" onSubmit={submitProjectMember}>
                  <Field id="project-member-search" label="搜索用户"><TextInput type="search" value={projectMemberCandidateSearch} placeholder="姓名、用户名或角色" disabled={projectMemberCandidateLoading || !projectMemberCandidates.length} onChange={(event) => setProjectMemberCandidateSearch(event.target.value)} /></Field>
                  <div className="project-member-picker" aria-busy={projectMemberCandidateLoading}>
                    <div className="project-member-picker-head"><span>候选用户</span><strong>已选择 {projectMemberSelectedUsernames.length} 人</strong></div>
                    {projectMemberCandidateLoading ? <p className="shell-muted">正在加载候选用户。</p> : visibleProjectMemberCandidates.length ? <OverlayScrollTarget axis="vertical" label="候选用户" className="project-member-candidate-list">{visibleProjectMemberCandidates.map((candidate) => {
                      const selected = projectMemberSelectedUsernames.includes(candidate.username);
                      return <label className="project-member-candidate" key={candidate.username}><input type="checkbox" checked={selected} onChange={(event) => setProjectMemberSelectedUsernames((current) => event.target.checked ? [...current, candidate.username] : current.filter((username) => username !== candidate.username))} /><span><strong>{candidate.display_name}</strong><em>@{candidate.username}</em></span><small>{candidate.roles || '未配置系统角色'}</small></label>;
                    })}</OverlayScrollTarget> : <p className="shell-muted">{projectMemberCandidates.length ? '没有匹配用户。' : '没有可加入用户。'}</p>}
                  </div>
                  {projectMemberCandidateError ? <Feedback tone="danger" title="添加成员失败">{projectMemberCandidateError}</Feedback> : null}
                  <Field id="project-member-role" label="项目角色" required><Select value={projectMemberForm.memberRole} onChange={(event) => setProjectMemberForm((current) => ({ ...current, memberRole: event.target.value }))}><option value="member">项目成员</option><option value="maintainer">项目管理员</option><option value="viewer">只读成员</option></Select></Field>
                </form>
              </Modal>
              <Modal open={Boolean(projectMemberTarget)} title="调整成员角色" onClose={() => { if (!projectMutationSubmitting) setProjectMemberTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberTarget(null)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-member-role-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-member-role-form" onSubmit={submitProjectMemberRole}><p>{projectMemberTarget?.display_name} @{projectMemberTarget?.username}</p><Field id="project-member-role-value" label="项目角色" required><Select key={`${projectMemberTarget?.username || ''}:${projectMemberTarget?.member_role || ''}`} name="memberRole" defaultValue={projectMemberTarget?.member_role || 'member'}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></Select></Field></form>
              </Modal>
              <Modal open={Boolean(projectMemberRemoveTarget)} title="移除项目成员" onClose={() => { if (!projectMutationSubmitting) setProjectMemberRemoveTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectMemberRemoveTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectMemberRemove()}>确认移除</Button></>}><p>确认从项目中移除 {projectMemberRemoveTarget?.display_name} @{projectMemberRemoveTarget?.username}？</p></Modal>
              <Modal open={projectCycleOpen} dirty={projectCycleDirty} title={projectCycleForm.id ? '编辑项目周期' : '新建项目周期'} onClose={() => { if (!projectMutationSubmitting) setProjectCycleOpen(false); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleOpen(false)}>取消</Button><Button loading={projectMutationSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('project-cycle-form'))?.requestSubmit()}>保存</Button></>}>
                <form id="project-cycle-form" onSubmit={submitProjectCycle}><Field id="project-cycle-name" label="周期名称" required><TextInput value={projectCycleForm.name} maxLength={120} onChange={(event) => setProjectCycleForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field id="project-cycle-goal" label="周期目标"><TextInput value={projectCycleForm.goal} maxLength={240} onChange={(event) => setProjectCycleForm((current) => ({ ...current, goal: event.target.value }))} /></Field><Field id="project-cycle-owner" label="负责人用户名"><TextInput value={projectCycleForm.ownerUsername} maxLength={64} onChange={(event) => setProjectCycleForm((current) => ({ ...current, ownerUsername: event.target.value }))} /></Field><Field id="project-cycle-start" label="开始日期" required><TextInput type="date" value={projectCycleForm.startDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, startDate: event.target.value }))} /></Field><Field id="project-cycle-end" label="结束日期" required><TextInput type="date" min={projectCycleForm.startDate || undefined} value={projectCycleForm.endDate} onChange={(event) => setProjectCycleForm((current) => ({ ...current, endDate: event.target.value }))} /></Field><Field id="project-cycle-description" label="周期说明"><TextArea value={projectCycleForm.description} maxLength={5000} onChange={(event) => setProjectCycleForm((current) => ({ ...current, description: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={Boolean(projectCycleCloseTarget)} title="关闭项目周期" onClose={() => { if (!projectMutationSubmitting) setProjectCycleCloseTarget(null); }} footer={<><Button variant="secondary" disabled={projectMutationSubmitting} onClick={() => setProjectCycleCloseTarget(null)}>取消</Button><Button variant="danger" loading={projectMutationSubmitting} onClick={() => void confirmProjectCycleClose()}>确认关闭</Button></>}><p>确认关闭周期“{projectCycleCloseTarget?.name}”？关闭后不能继续编辑。</p></Modal>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectPersonalAnalysisPage({ ctx }) {
  const { activeProjectDetail, handleNavigate, headingRef, personalAnalysisPendingLinks, personalAnalysisPendingTotal, projectPersonalAnalysis, projectScopeKey, route, user } = ctx;
  return (
    <>
            <section className="page-stack personal-analysis-page" aria-labelledby="personal-analysis-title">
              <header className="analysis-header"><div><a className="work-item-back" href={buildProjectDetailPath({ owner: route.owner, projectKey: projectScopeKey })} onClick={(event) => handleNavigate(event, buildProjectDetailPath({ owner: route.owner, projectKey: projectScopeKey }), '已返回项目详情。')}>← 返回项目详情</a><p className="shell-eyebrow">{projectScopeKey} / 个人项目分析</p><h1 id="personal-analysis-title" ref={headingRef} tabIndex={-1}>{activeProjectDetail?.name || projectScopeKey}</h1><p>仅统计 {projectPersonalAnalysis?.display_name || user?.display_name || '当前用户'} 在该项目中的实际处理与协作记录。</p></div>{activeProjectDetail ? <Badge>{projectStatusLabel(activeProjectDetail.status)}</Badge> : null}</header>
              {projectPersonalAnalysis ? <>
                <section className="metric-grid personal-analysis-output" aria-label="个人处理产出">
                  <Metric label="累计处理" value={projectPersonalAnalysis.completed_total} icon={<Icon name="check" />} variant="info" />
                  <Metric label="近 30 日" value={projectPersonalAnalysis.completed_last_30_days} icon={<Icon name="calendar" />} variant="success" />
                  <Metric label="已处理 Bug" value={projectPersonalAnalysis.completed_bugs} icon={<Icon name="bug" />} variant="danger" />
                  <Metric label="当前待处理" value={personalAnalysisPendingTotal} icon={<Icon name="task" />} variant="warning" />
                </section>

                <section className="analysis-section" aria-labelledby="personal-analysis-efficiency-title">
                  <div className="section-heading"><div><p className="shell-eyebrow">处理效率</p><h2 id="personal-analysis-efficiency-title">自然周期效率</h2></div><span>统计起点：{dashboardTimestamp(projectPersonalAnalysis.joined_at)}</span></div>
                  <div className="metric-grid compact-metrics">
                    <Metric label="日平均处理" value={formatAnalysisAverage(projectPersonalAnalysis.daily_average)} icon={<Icon name="trend" />} variant="info" />
                    <Metric label="单日最大处理" value={projectPersonalAnalysis.daily_peak} icon={<Icon name="trend" />} variant="success" />
                    <Metric label="月平均处理" value={formatAnalysisAverage(projectPersonalAnalysis.monthly_average)} icon={<Icon name="trend" />} variant="warning" />
                    <Metric label="单月最大处理" value={projectPersonalAnalysis.monthly_peak} icon={<Icon name="trend" />} variant="danger" />
                  </div>
                </section>

                <div className="analysis-columns">
                  <section className="analysis-section" aria-labelledby="personal-analysis-pending-title">
                    <div className="section-heading"><div><p className="shell-eyebrow">当前负载</p><h2 id="personal-analysis-pending-title">我的待处理</h2></div></div>
                    <div className="analysis-pending-list">{personalAnalysisPendingLinks.map((item) => <a href={item.path} key={item.itemType} onClick={(event) => handleNavigate(event, item.path, `已打开待处理${item.label}。`)}><span>{item.label}</span><strong>{item.count}</strong></a>)}</div>
                  </section>
                  <section className="analysis-section" aria-labelledby="personal-analysis-collaboration-title">
                    <div className="section-heading"><div><p className="shell-eyebrow">协作参与</p><h2 id="personal-analysis-collaboration-title">沟通与推进</h2></div></div>
                    <dl className="analysis-collaboration"><div><dt>活跃天数</dt><dd>{projectPersonalAnalysis.active_days}</dd></div><div><dt>评论 / 回复</dt><dd>{projectPersonalAnalysis.comment_count}</dd></div><div><dt>指派 / 流转</dt><dd>{projectPersonalAnalysis.handoff_count}</dd></div></dl>
                  </section>
                </div>

                <section className="analysis-section" aria-labelledby="personal-analysis-completions-title">
                  <div className="section-heading"><div><p className="shell-eyebrow">最近产出</p><h2 id="personal-analysis-completions-title">最近完成记录</h2></div><span>以实际终态操作时间排序</span></div>
                  {projectPersonalAnalysis.recent_completions.length ? <div className="analysis-completion-list">{projectPersonalAnalysis.recent_completions.map((item) => { const itemPath = buildWorkItemDetailPath({ owner: /** @type {'app' | 'web'} */ (route.owner), itemKey: item.key }); return <a href={itemPath} key={`${item.key}-${item.completed_at}`} onClick={(event) => handleNavigate(event, itemPath, `已打开 ${item.key}。`)}><Badge>{workItemTypeLabel(item.item_type)}</Badge><code>{item.key}</code><strong>{item.title}</strong><time>{formatTimestamp(item.completed_at)}</time></a>; })}</div> : <div className="empty-state"><strong>暂无完成记录</strong><span>工作项由你推进到完成、解决、验证或关闭后会记录在这里。</span></div>}
                </section>
                <p className="analysis-note">处理量按你实际执行的终态流转事件统计；日均和月均从加入项目起按自然周期计算，并包含无处理记录的日期。</p>
              </> : null}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectResourceDetailPage({ ctx }) {
  const { AttachmentPreview, OverlayScrollTarget, activateProjectResourceInlineAttachment, appendProjectResourceAccess, canManageProjectContent, closeProjectResourceFileMenu, downloadProjectResourceAttachment, handleNavigate, headingRef, navigateProjectResourceAttachmentPreview, openProjectResourceFileMenu, openProjectResourceForm, projectAttachmentPreview, projectResourceAttachmentUploading, projectResourceDetail, projectResourceDownloadingId, projectResourceError, projectResourceFileMenu, projectResourceFileMenuCanPreview, projectResourceFileMenuDownloadHandler, projectResourceLocked, projectResourcePassword, projectResourceRelatedWorkItem, projectResourceStatus, projectResourceSubmitting, projectResourceTitleIsInBody, projectResourceUnlocking, releaseProjectAttachmentPreview, resolveProjectResourceInlineAttachmentSource, resourceFallbackPath, route, setProjectResourceArchiveTarget, setProjectResourceError, setProjectResourcePassword, setProjectResourcePasswordResetForm, setProjectResourcePasswordResetOpen, setStatusMessage, submitProjectResourceUnlock, user } = ctx;
  return (
    <>
            <section className="page-stack resource-detail-page" aria-label="资料详情">
              {projectResourceError ? <Feedback tone="danger" title="资料操作失败">{projectResourceError}</Feedback> : null}
              {projectResourceStatus ? <p className="work-item-attachment-status" aria-live="polite">{projectResourceStatus}</p> : null}
              {!projectResourceDetail && !projectResourceError ? <ProjectResourceDetailSkeleton /> : null}
              {projectResourceDetail ? <>
                <nav className="breadcrumb" aria-label="面包屑导航">
                  <a className="resource-reader-back" aria-label="返回资料库" href={resourceFallbackPath} onClick={(event) => handleNavigate(event, resourceFallbackPath, '已返回项目资料库。')}>
                    <span aria-hidden="true">←</span>
                  </a>
                  <span className="breadcrumb__sep" aria-hidden="true">/</span>
                  <a href={resourceFallbackPath}>资料库</a>
                  <span className="breadcrumb__sep" aria-hidden="true">/</span>
                  <span aria-current="page">{projectResourceDetail.title}</span>
                </nav>
                <header className="page-head resource-reader-header" aria-label="资料信息与操作">
                  <div className="page-head__text">
                    {projectResourceTitleIsInBody ? (
                      <p className="page-head__title">
                        {projectResourceDetail.title}
                        <Badge tone="violet">{projectResourceCategoryLabel(projectResourceDetail.category)}</Badge>
                      </p>
                    ) : (
                      <h1 className="page-head__title" ref={headingRef} tabIndex={-1}>
                        {projectResourceDetail.title}
                        <Badge tone="violet">{projectResourceCategoryLabel(projectResourceDetail.category)}</Badge>
                      </h1>
                    )}
                    <p className="page-head__desc">
                      {projectResourceDetail.updated_by ? `更新人 ${projectResourceDetail.updated_by}` : '资料库内容'}
                      {projectResourceDetail.updated_at ? <span title="北京时间（东八区）"> · 更新于 {formatBusinessTimestamp(projectResourceDetail.updated_at, { seconds: false })}</span> : ''}
                      {projectResourceDetail.status === 'archived' ? ' · 已归档' : ''}
                    </p>
                  </div>
                  <div className="page-head__actions">
                    {canManageProjectContent && projectResourceDetail.status !== 'archived' && !projectResourceLocked ? <Button variant="primary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading} onClick={() => openProjectResourceForm(projectResourceDetail)}>编辑资料</Button> : null}
                    {canManageProjectContent && projectResourceDetail.status !== 'archived' && !projectResourceLocked ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading} onClick={() => { setProjectResourceError(''); setProjectResourceArchiveTarget(projectResourceDetail); }}>归档资料</Button> : null}
                    {user?.is_super_admin && projectResourceDetail.status !== 'archived' ? <Button variant="secondary" disabled={projectResourceSubmitting || projectResourceAttachmentUploading} onClick={() => { setProjectResourceError(''); setProjectResourcePasswordResetForm({ accessPasswordAction: 'set', accessPassword: '' }); setProjectResourcePasswordResetOpen(true); }}>重置保险箱密码</Button> : null}
                  </div>
                </header>
                <div className="resource-detail-layout">
                <div className="resource-detail-main">
                <Panel flush className="resource-content-card">
                  {projectResourceLocked ? <OverlayScrollTarget axis="vertical" label="资料访问验证" className="resource-lock-panel"><div className="resource-lock-card"><span className="resource-lock-mark" aria-hidden="true">⌁</span><div><p className="shell-eyebrow">访问验证</p><h2>这条资料已设置访问密码</h2><p>请输入创建该资料时设置的访问密码。验证通过后会展示正文和正文内附件。</p></div><form className="resource-unlock-form" onSubmit={submitProjectResourceUnlock}><Field id="project-resource-password" label="访问密码" required><TextInput type="password" autoComplete="off" value={projectResourcePassword} onChange={(event) => setProjectResourcePassword(event.target.value)} /></Field><Button type="submit" loading={projectResourceUnlocking} disabled={!projectResourcePassword}>验证并查看</Button></form></div></OverlayScrollTarget> : <article className="resource-rich-body discussion-rich-body"><RichTextContent html={projectResourceDetail.body_html || projectResourceDetail.body} format={projectResourceDetail.body_format} onAttachmentActivate={activateProjectResourceInlineAttachment} onFileAttachmentActivate={openProjectResourceFileMenu} resolveAttachmentSource={resolveProjectResourceInlineAttachmentSource} downloadingAttachmentId={projectResourceDownloadingId} showTableOfContents /></article>}
                </Panel>
                </div>
                <aside className="resource-detail-aside" aria-label="资料属性">
                  <Panel title="关联工作项">
                    {projectResourceRelatedWorkItem ? (() => {
                      const relatedPath = routePathForOwner(projectResourceRelatedWorkItem.url, route.owner);
                      return <a className="work-item-related-item" href={relatedPath} onClick={(event) => handleNavigate(event, relatedPath, `已打开 ${projectResourceRelatedWorkItem.key}。`)}><span className="work-item-related-title">{projectResourceRelatedWorkItem.title}</span><span className="work-item-related-meta">{projectResourceRelatedWorkItem.key}</span></a>;
                    })() : <p className="shell-muted">这份资料还没有关联工作项。</p>}
                    {projectResourceDetail.related_cycle ? <p className="shell-muted">所属周期：{projectResourceDetail.related_cycle.name}</p> : null}
                  </Panel>
                  <Panel title="资料信息">
                    <dl className="props">
                      <dt className="props__label">分类</dt>
                      <dd>{projectResourceCategoryLabel(projectResourceDetail.category)}</dd>
                      <dt className="props__label">状态</dt>
                      <dd><Badge tone={projectResourceDetail.status === 'archived' ? 'neutral' : 'success'}>{projectResourceDetail.status === 'archived' ? '已归档' : '生效中'}</Badge></dd>
                      <dt className="props__label">标签</dt>
                      <dd>{projectResourceDetail.tags.length ? projectResourceDetail.tags.join('、') : '—'}</dd>
                      <dt className="props__label">创建时间</dt>
                      <dd className="props__muted">{formatBusinessTimestamp(projectResourceDetail.created_at, { seconds: false }) || '未知'}</dd>
                    </dl>
                  </Panel>
                </aside>
                </div>
                <AttachmentPreview open={Boolean(projectAttachmentPreview?.open)} title={projectAttachmentPreview?.attachment?.filename || '附件预览'} source={projectAttachmentPreview?.source || ''} kind={projectAttachmentPreview?.kind || null} strategy={projectAttachmentPreview?.strategy || null} fileType={projectAttachmentPreview?.fileType || null} contentType={projectAttachmentPreview?.attachment?.content_type || ''} loading={projectAttachmentPreview?.loading} downloading={projectResourceDownloadingId !== null && projectAttachmentPreview?.attachment?.id === projectResourceDownloadingId} error={projectAttachmentPreview?.error} position={projectAttachmentPreview?.position} total={projectAttachmentPreview?.total} hasPrevious={Boolean(projectAttachmentPreview?.previousId)} hasNext={Boolean(projectAttachmentPreview?.nextId)} onPrevious={() => { if (projectAttachmentPreview?.previousId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.previousId); }} onNext={() => { if (projectAttachmentPreview?.nextId) navigateProjectResourceAttachmentPreview(projectAttachmentPreview.nextId); }} onDownload={() => { if (projectAttachmentPreview?.attachment) void downloadProjectResourceAttachment(projectAttachmentPreview.attachment); }} onClose={() => void releaseProjectAttachmentPreview()} />
                <RichAttachmentMenu open={Boolean(projectResourceFileMenu)} title={projectResourceFileMenu?.title || '附件'} x={projectResourceFileMenu?.x || 0} y={projectResourceFileMenu?.y || 0} downloadUrl={projectResourceFileMenu ? appendProjectResourceAccess(projectResourceFileMenu.href) : ''} canPreview={projectResourceFileMenuCanPreview()} onClose={closeProjectResourceFileMenu} onDownload={projectResourceFileMenuDownloadHandler()} onStatus={({ tone, text }) => { if (tone === 'error') setProjectResourceError(text); else setStatusMessage(text); }} />
              </> : null}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProjectCycleDetailPage({ ctx }) {
  const { activeProjectDetail, cycleBackPath, cycleFallbackPath, cycleMemberLoad, cyclePace, handleNavigate, headingRef, projectCycleDetail, projectMutationError, route } = ctx;
  return (
    <>
            <section className="page-stack cycle-detail-page" aria-labelledby="project-cycle-detail-title">
              <section className="page-hero detail-hero"><div><p className="shell-eyebrow">项目周期 / {route.projectKey}</p><h1 id="project-cycle-detail-title" ref={headingRef} tabIndex={-1}>{projectCycleDetail?.name || `周期 #${route.cycleId}`}</h1><p>{projectCycleDetail?.goal || projectCycleDetail?.description || '当前周期还没有填写目标说明。'}</p>{projectCycleDetail ? <div className="project-detail-meta"><Badge>{projectCycleStatusLabel(projectCycleDetail)}</Badge><span>所属项目：{activeProjectDetail?.name || route.projectKey}</span><span>总工作项：{projectCycleDetail.total_items}</span><span>{projectCycleDetail.start_date} ~ {projectCycleDetail.end_date}</span></div> : null}</div><div className="toolbar-actions"><a className="yc-button yc-button-secondary" href={cycleBackPath} onClick={(event) => handleNavigate(event, cycleBackPath, cycleBackPath === cycleFallbackPath ? '已返回项目周期。' : '已返回上一页。')}>{cycleBackPath === cycleFallbackPath ? '返回项目周期' : '返回上一页'}</a></div></section>
              {projectMutationError ? <Feedback tone="danger" title="周期操作失败">{projectMutationError}</Feedback> : null}
              {projectCycleDetail ? <>
                <section className="metric-grid cycle-detail-metrics" aria-label="周期统计">
                  <Metric label="工作项" value={projectCycleDetail.total_items} icon={<Icon name="task" />} variant="info" />
                  <Metric label="待处理" value={projectCycleDetail.pending_count} icon={<Icon name="calendar" />} variant="warning" />
                  <Metric label="需求" value={projectCycleDetail.requirement_count} icon={<Icon name="doc" />} variant="success" />
                  <Metric label="Bug" value={projectCycleDetail.bug_count} icon={<Icon name="bug" />} variant="danger" />
                </section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">周期概览</p><h2>基础信息</h2></div></div><div className="project-tab-panels"><div className="project-detail-overview cycle-detail-overview"><section className="project-tab-section"><div className="project-tab-section-head"><div><h3>核心字段</h3><p>把周期身份、负责人和交付规模放在同一处查看。</p></div></div><dl className="project-detail-dl"><div><dt>负责人</dt><dd>{projectCycleDetail.owner || '未设置'}</dd></div><div><dt>开始日期</dt><dd>{projectCycleDetail.start_date}</dd></div><div><dt>结束日期</dt><dd>{projectCycleDetail.end_date}</dd></div><div><dt>任务数量</dt><dd>{projectCycleDetail.task_count}</dd></div><div><dt>状态</dt><dd>{projectCycleStatusLabel(projectCycleDetail)}</dd></div><div><dt>更新时间</dt><dd>{formatTimestamp(projectCycleDetail.updated_at)}</dd></div></dl></section><section className="project-tab-section cycle-detail-description"><div className="project-tab-section-head"><div><h3>目标与说明</h3><p>明确这一轮周期要交付什么、关注什么。</p></div></div><div className="cycle-detail-description-body"><article><strong>周期目标</strong><p>{projectCycleDetail.goal || '未填写周期目标'}</p></article><article><strong>补充说明</strong><p>{projectCycleDetail.description || '暂无补充说明'}</p></article></div></section></div></div></section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">时间状态</p><h2 id="cycle-pace-title">当前节奏</h2></div></div><div className="project-tab-panels cycle-progress-panel"><div className="cycle-progress-summary"><div className="cycle-progress-figure"><strong>{cyclePace?.percent}%</strong><span>时间进度</span></div><div className="cycle-progress-track"><strong>{cyclePace?.duration}</strong><span>{cyclePace?.hint}</span><progress max="100" value={cyclePace?.percent || 0} aria-label="周期时间进度">{cyclePace?.percent}%</progress></div></div></div></section>
                <section className="project-tabs-card"><div className="project-tabs-head"><div><p className="shell-eyebrow">状态看板</p><h2>工作项状态看板</h2></div></div><div className="cycle-board-grid">{[['open', '待处理', 'warning'], ['in_progress', '进行中', 'info'], ['pending_confirmation', '待确认', 'info'], ['done', '已完成', 'success']].map(([status, label, tone]) => { const items = projectCycleDetail.work_items.filter((item) => status === 'done' ? !['open', 'in_progress', 'pending_confirmation'].includes(item.status) : item.status === status); return <article className="cycle-board-column" data-tone={tone} key={status}><div className="cycle-board-column-head"><strong>{label}</strong><span>{items.length} 项</span></div><div className="cycle-board-items">{items.length ? items.map((item) => { const itemPath = buildWorkItemDetailPath({ owner: /** @type {'app' | 'web'} */ (route.owner), itemKey: item.key }); return <article className="cycle-board-item" key={item.key}><a className="cycle-board-item-title" href={itemPath} onClick={(event) => handleNavigate(event, itemPath, `已打开 ${item.key}。`)}>{item.key} · {item.title}</a><div className="cycle-board-item-meta"><PriorityBadge priority={item.priority} /><span>{item.assignee || '未指派'}</span><span>{item.due_date || '无截止日期'}</span></div></article>; }) : <p className="shell-empty">暂无工作项。</p>}</div></article>; })}</div></section>
                <section className="project-tabs-card" aria-labelledby="cycle-member-load-title"><div className="project-tabs-head"><div><p className="shell-eyebrow">成员负载</p><h2 id="cycle-member-load-title">按成员看待推进压力</h2></div></div><div className="project-tab-panels"><DataTable caption="周期成员负载" rows={cycleMemberLoad} rowKey={(row) => row.key || 'unassigned'} emptyText="当前周期暂无待推进负载。" columns={[{ key: 'member', label: '成员', render: (row) => <><strong>{row.member}</strong><br /><span className="shell-muted">{row.subtitle}</span></> }, { key: 'open', label: '待处理', render: (row) => row.open }, { key: 'in_progress', label: '进行中', render: (row) => row.in_progress }, { key: 'pending_confirmation', label: '待确认', render: (row) => row.pending_confirmation }, { key: 'high', label: '高优先级', render: (row) => row.high }, { key: 'overdue', label: '逾期', render: (row) => row.overdue }, { key: 'active', label: '活跃合计', render: (row) => row.active }]} /></div></section>
              </> : null}
            </section>
    </>
  );
}
