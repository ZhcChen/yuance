// @ts-check
// 由 app.jsx 拆出的页面（行为不变）：状态与处理函数经 ctx 传入。

import { dashboardTimestamp, emptyMessageTitle, filterLabel, notificationKindLabel, searchResultKindLabel } from '../app-helpers.jsx';
import { buildProjectDetailPath, buildSearchPath, routePathForOwner } from '@yuance/frontend-app-core';
import { Badge, Button, ContentTab, ContentTabs, EmptyState, Feedback, Field, FilterBar, FilterField, Icon, Metric, Modal, Pagination, Panel, Select, TextInput, UserAvatar } from '@yuance/frontend-ui';

/** @param {{ ctx: any }} props */
export function MessagesPage({ ctx }) {
  const { changeMessageFilter, changeMessagePage, changeMessagePageSize, handleMarkAllRead, handleOpenNotification, headingRef, messageActionError, messageFeed, messageFilter, messageOpeningId, messageReadAllSubmitting, messageRoute, pageRangeEnd, pageRangeStart, pendingCount, refreshing, route } = ctx;
  return (
    <>
            <section className="page-stack messages-page" aria-labelledby="message-center-title" aria-busy={refreshing || messageOpeningId !== null}>
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="message-center-title" ref={headingRef} tabIndex={-1}>消息中心</h1>
                  <p className="page-head__desc">优先查看被提及和被回复的最新讨论，未读状态同时用文字与强调色标注。</p>
                </div>
                <div className="page-head__actions">
                  {(messageFeed?.unread_count || 0) > 0 ? <Button variant="secondary" disabled={messageReadAllSubmitting} onClick={handleMarkAllRead}>{messageReadAllSubmitting ? '处理中…' : '全部标为已读'}</Button> : null}
                </div>
              </div>

              <section className="metric-grid message-metrics" aria-label="消息概览">
                <Metric label="全部消息" value={messageFeed?.total_items || 0} delta="当前数据范围" icon={<Icon name="inbox" />} variant="brand" />
                <Metric label="未读消息" value={messageFeed?.unread_count || 0} delta="需要逐条处理" icon={<Icon name="message" />} variant="warning" />
                <Metric label="待处理讨论" value={pendingCount} delta="指派给我跟进" icon={<Icon name="clock" />} variant="danger" />
                <Metric label="已读消息" value={messageRoute ? Math.max((messageFeed?.total_items || 0) - (messageFeed?.unread_count || 0), 0) : 0} delta="历史记录" icon={<Icon name="check" />} variant="success" />
              </section>

              {messageActionError ? <Feedback tone="danger" title="消息操作失败">{messageActionError}</Feedback> : null}

              <ContentTabs ariaLabel="消息筛选">
                {[
                  { value: 'all', label: '全部消息', count: messageFeed?.total_items || 0 },
                  { value: 'unread', label: '未读消息', count: messageFeed?.unread_count || 0 },
                  { value: 'pending', label: '待处理讨论', count: pendingCount },
                  {
                    value: 'read',
                    label: '已读消息',
                    count: messageRoute ? Math.max((messageFeed?.total_items || 0) - (messageFeed?.unread_count || 0), 0) : 0,
                  },
                ].map((tab) => (
                  <ContentTab
                    key={tab.value}
                    active={messageFilter === tab.value}
                    badge={tab.count}
                    badgeTone={tab.value === 'unread' ? 'danger' : 'neutral'}
                    onClick={() => changeMessageFilter(/** @type {'all' | 'unread' | 'pending' | 'read'} */ (tab.value))}
                  >
                    <span>{tab.label}</span>
                  </ContentTab>
                ))}
              </ContentTabs>

              <Panel title="消息列表" description={`共 ${messageFeed?.items?.length || 0} 条`} flush>
              {messageFeed?.items?.length ? (
                <>
                  <ul className="message-list" aria-label={`${filterLabel(messageFilter)}列表`}>
                    {messageFeed.items.map((item) => (
                      <li key={item.id} className={`message-row ${item.read ? '' : 'unread'}`}>
                        <span className="message-unread-dot" aria-hidden="true" />
                        <span className="message-kind">{notificationKindLabel(item.kind)}</span>
                        <span className="message-content">
                          <strong>{item.title}</strong>
                          <span>{item.body}</span>
                          <small>{item.actor} · {dashboardTimestamp(item.created_at)}</small>
                        </span>
                        <button className="message-open" type="button" aria-label="打开" disabled={messageOpeningId !== null || messageReadAllSubmitting} onClick={() => void handleOpenNotification(item)}>{messageOpeningId === item.id ? '打开中…' : '查看'}</button>
                      </li>
                    ))}
                  </ul>

                  <div className="work-item-list-pager">
                    <Pagination ariaLabel="消息分页" page={messageFeed.page} totalPages={messageFeed.total_pages} totalItems={messageFeed.total_items} rangeLabel={`当前显示 ${pageRangeStart}-${pageRangeEnd}`} pageSize={messageFeed.per_page} onPageSizeChange={changeMessagePageSize} onPageChange={changeMessagePage} />
                  </div>
                </>
              ) : (
                <EmptyState icon={<Icon name="inbox" />} title={emptyMessageTitle(route)} description="新的指派、提及和回复会显示在这里。" />
              )}
              </Panel>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SearchPage({ ctx }) {
  const { handleNavigate, headingRef, homePath, navigate, route, searchPage, searchResultGroups, searchRoute } = ctx;
  return (
    <>
            <section className="page-stack search-page" aria-labelledby="search-page-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="search-page-title" ref={headingRef} tabIndex={-1}>全局搜索</h1>
                  <p className="page-head__desc">{searchRoute?.q ? `「${searchRoute.q}」的搜索结果，按类型分组。` : '输入关键词后搜索项目、需求、任务、Bug 与资料库。'}</p>
                </div>
                <div className="page-head__actions">
                  <a className="yc-button yc-button-secondary" href={homePath} onClick={(event) => handleNavigate(event, homePath, '已返回工作台。')}>返回工作台</a>
                </div>
              </div>
              <Panel title="搜索条件" description={searchRoute?.q ? `关键词：${searchRoute.q}` : '支持按工作项编号、标题、资料标题与项目名称检索。'}>
                <FilterBar className="search-form" role="search" ariaLabel="全局搜索" onSubmit={(event) => { event.preventDefault(); const input = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q')); navigate(buildSearchPath({ owner: route.owner, q: input?.value || '', perPage: searchPage?.pagination.per_page })); }} actions={<Button type="submit">搜索</Button>}>
                  <FilterField id="search-page-input" label="关键词"><TextInput name="q" type="search" defaultValue={searchRoute?.q || ''} placeholder="输入项目编号、工作项编号、资料标题或描述" /></FilterField>
                </FilterBar>
              </Panel>
              {searchPage?.items.length ? (
                <>
                  {searchResultGroups.map((group) => (
                    <Panel key={group.kind} title={searchResultKindLabel(group.kind)} description={`${group.items.length} 条`} flush>
                      <div className="search-result-list" role="list" aria-label={`${searchResultKindLabel(group.kind)}搜索结果`}>
                        {group.items.map((item) => {
                          const target = routePathForOwner(item.target, route.owner);
                          return (
                            <article key={`${item.kind}:${item.key}`} className="search-result" role="listitem"><div><Badge>{searchResultKindLabel(item.kind)}</Badge> <code>{item.key}</code><h3><a href={target} onClick={(event) => handleNavigate(event, target, `已打开 ${item.key}。`)}>{item.title}</a></h3><p>{item.context}</p></div><span className="search-result-time">{dashboardTimestamp(item.updated_at)}</span></article>
                          );
                        })}
                      </div>
                    </Panel>
                  ))}
                  <div className="work-item-list-pager">
                    <Pagination ariaLabel="搜索结果分页" page={searchPage.pagination.page} totalPages={searchPage.pagination.total_pages} totalItems={searchPage.pagination.total_items} onPageChange={(page) => navigate(buildSearchPath({ owner: route.owner, q: searchRoute?.q, page, perPage: searchPage.pagination.per_page }))} />
                  </div>
                </>
              ) : (
                <EmptyState icon={<Icon name="inbox" />} title={searchRoute?.q ? '没有找到结果' : '等待搜索'} description={searchRoute?.q ? '可以换一个项目编号、工作项编号、资料标题或正文关键词。' : '例如搜索 YCE、对象存储、资料库、Bug 或工作项编号。'} />
              )}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function ProfilePage({ ctx }) {
  const { accountConfirmation, accountSecurityError, accountSecuritySubmitting, apiTokens, confirmAccountAction, createdRawToken, dashboard, handleNavigate, headingRef, passwordDirty, passwordForm, passwordModalOpen, profile, profileDirty, profileError, profileForm, profileModalOpen, profileSubmitting, route, runtime, setAccountConfirmation, setAccountSecurityError, setCreatedRawToken, setPasswordForm, setPasswordModalOpen, setProfileError, setProfileForm, setProfileModalOpen, setTokenForm, setTokenModalOpen, submitPassword, submitProfile, submitToken, tokenDirty, tokenForm, tokenModalOpen, user } = ctx;
  return (
    <>
            <section className="page-stack profile-page" aria-labelledby="profile-title">
              <div className="page-head profile-head">
                <div className="page-head__text profile-head__identity">
                  <UserAvatar name={profile?.display_name || profile?.username || ''} fallback="我" className="profile-head-avatar" />
                  <div>
                    <h1 id="profile-title" ref={headingRef} tabIndex={-1}>{profile?.display_name || user?.display_name || user?.username}</h1>
                    <p className="page-head__desc">@{profile?.username || user?.username} · {profile?.roles || '普通成员'} · {profile?.email || '未填写邮箱'}</p>
                  </div>
                </div>
                <div className="page-head__actions">
                  <Button variant="secondary" onClick={() => { setProfileError(''); if (profile) setProfileForm({ displayName: profile.display_name, email: profile.email, mobile: profile.mobile }); setProfileModalOpen(true); }}>编辑资料</Button>
                  <Button variant="secondary" onClick={() => { setAccountSecurityError(''); setPasswordModalOpen(true); }}>修改密码</Button>
                  <Button variant="secondary" disabled={apiTokens.filter((token) => !token.revoked_at).length >= 100} onClick={() => { setAccountSecurityError(''); setTokenForm({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' }); setTokenModalOpen(true); }}>创建访问 Token</Button>
                </div>
              </div>
              <section className="metric-grid profile-metrics" aria-label="我的概览">
                <Metric label="参与项目" value={dashboard?.projects?.length || 0} delta="我可见的项目" icon={<Icon name="folder" />} variant="brand" />
                <Metric label="指派给我" value={dashboard?.metrics?.assigned_total || 0} delta="未完成工作项" icon={<Icon name="task" />} variant="warning" />
                <Metric label="高优先级" value={dashboard?.metrics?.high_priority || 0} delta="P0 / P1" icon={<Icon name="alert" />} variant="danger" />
              </section>
              {accountSecurityError ? <Feedback tone="danger" title="账户安全操作失败">{accountSecurityError}</Feedback> : null}
              {createdRawToken ? <Feedback tone="success" title="访问 Token 仅显示一次"><code>{createdRawToken}</code><Button variant="secondary" onClick={() => setCreatedRawToken('')}>我已保存</Button></Feedback> : null}
              <section className="profile-detail-grid"><div className="profile-detail-main"><Panel title="账号信息" description="账号资料与当前状态">
                <dl className="props">
                  <dt className="props__label">用户名</dt>
                  <dd><code>{profile?.username || user?.username}</code></dd>
                  <dt className="props__label">角色</dt>
                  <dd>{profile?.roles || '普通成员'}{profile?.is_super_admin ? <Badge tone="danger">超级管理员</Badge> : null}</dd>
                  <dt className="props__label">账号状态</dt>
                  <dd><Badge tone="success">{profile?.status === 'active' ? '正常' : profile?.status}</Badge></dd>
                  <dt className="props__label">邮箱</dt>
                  <dd>{profile?.email || '未填写'}</dd>
                  <dt className="props__label">手机号</dt>
                  <dd>{profile?.mobile || '未填写'}</dd>
                  <dt className="props__label">加入时间</dt>
                  <dd className="props__muted">{profile?.created_at ? dashboardTimestamp(profile.created_at) : '-'}</dd>
                  <dt className="props__label">最近更新</dt>
                  <dd className="props__muted">{profile?.updated_at ? dashboardTimestamp(profile.updated_at) : '-'}</dd>
                </dl>
              </Panel><section className="panel api-token-panel">
                <div className="panel-head"><div><h2>Personal Access Token</h2><p>用于 OpenAPI、Codex Skill 或外部脚本调用。</p></div><div className="token-panel-actions"><span>可用 Token {apiTokens.filter((token) => !token.revoked_at).length}/100</span><Button disabled={apiTokens.filter((token) => !token.revoked_at).length >= 100} onClick={() => { setAccountSecurityError(''); setTokenForm({ id: 0, name: '', scopes: ['project:read'], projectScope: 'all', expiresAt: '' }); setTokenModalOpen(true); }}>创建 Token</Button></div></div>
                {apiTokens.length ? <div className="account-security-list">{apiTokens.map((token) => <div className="account-security-row" key={token.id}><div><strong>{token.name}</strong><p className="shell-muted">尾号 {token.token_suffix} · {token.scopes.join('、')}</p></div><div className="shell-actions-inline"><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => { setTokenForm({ id: token.id, name: token.name, scopes: token.scopes, projectScope: token.project_scope, expiresAt: '' }); setTokenModalOpen(true); }}>编辑</Button><Button variant="danger" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation({ kind: 'token', id: token.id, label: token.name })}>删除</Button></div></div>)}</div> : <div className="empty-state"><strong>暂无访问 Token</strong><span>如需让 AI Agent 或脚本访问元策 API，可以创建最小权限 Token。</span></div>}
              </section></div><aside className="profile-detail-side"><section className="panel"><div className="panel-head compact"><h2>我的项目</h2></div>{dashboard?.projects?.length ? <ol className="activity-list">{dashboard.projects.map((project) => { const path = buildProjectDetailPath({ owner: route.owner, projectKey: project.key }); return <li key={project.key}><span className="activity-dot" aria-hidden="true" /><strong><a href={path} onClick={(event) => handleNavigate(event, path, `已打开 ${project.key}。`)}>{project.name}</a></strong><span>{project.key} · {project.status} · {project.active_work_item_count} 个活跃工作项</span></li>; })}</ol> : <div className="empty-state"><strong>暂无项目</strong><span>加入项目后会出现在这里。</span></div>}</section></aside></section>
              <section className="panel profile-security-panel"><div className="panel-head"><div><h2>账户安全</h2><p>修改登录密码并管理访问 Token。</p></div></div>
              </section>
              <Modal open={Boolean(accountConfirmation)} title="删除访问 Token" onClose={() => { if (!accountSecuritySubmitting) setAccountConfirmation(null); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setAccountConfirmation(null)}>取消</Button><Button variant="danger" loading={accountSecuritySubmitting} onClick={() => void confirmAccountAction()}>确认</Button></>}><p>确认处理“{accountConfirmation?.label}”？此操作会立即失效且不可撤销。</p></Modal>
              <Modal open={passwordModalOpen} dirty={passwordDirty} title="修改密码" onClose={() => { if (!accountSecuritySubmitting) setPasswordModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setPasswordModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('password-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="password-form" onSubmit={submitPassword}><Field id="current-password" label="当前密码" required><TextInput id="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} /></Field><Field id="new-password" label="新密码" required><TextInput id="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} /></Field><Field id="new-password-confirm" label="确认新密码" required><TextInput id="new-password-confirm" type="password" value={passwordForm.newPasswordConfirm} onChange={(event) => setPasswordForm((current) => ({ ...current, newPasswordConfirm: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={tokenModalOpen} dirty={tokenDirty} title={tokenForm.id ? '编辑访问 Token' : '新建访问 Token'} onClose={() => { if (!accountSecuritySubmitting) setTokenModalOpen(false); }} footer={<><Button variant="secondary" disabled={accountSecuritySubmitting} onClick={() => setTokenModalOpen(false)}>取消</Button><Button loading={accountSecuritySubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('token-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="token-form" onSubmit={submitToken}>
                  <Field id="token-name" label="名称" required><TextInput id="token-name" value={tokenForm.name} onChange={(event) => setTokenForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <fieldset className="account-security-options"><legend>权限</legend>{[['project:read', '读取项目'], ['work_item:read', '读取工作项'], ['work_item:write', '修改工作项'], ['comment:write', '发表评论'], ['resource:read', '读取资源'], ['resource:write', '修改资源'], ['resource:unlock', '解锁资源'], ['notification:read', '读取通知']].map(([scope, label]) => <label key={scope}><input type="checkbox" checked={tokenForm.scopes.includes(scope)} onChange={(event) => setTokenForm((current) => ({ ...current, scopes: event.target.checked ? [...current.scopes, scope] : current.scopes.filter((value) => value !== scope) }))} />{label}</label>)}</fieldset>
                  <Field id="token-project-scope-mode" label="项目范围" required><Select value={tokenForm.projectScope === 'all' ? 'all' : 'selected'} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value === 'all' ? 'all' : '' }))}><option value="all">全部项目（含后续新增）</option><option value="selected">指定项目</option></Select></Field>
                  {tokenForm.projectScope !== 'all' ? <Field id="token-project-scope" label="项目 Key（逗号分隔）" required><TextInput placeholder="YCE, DEMO" value={tokenForm.projectScope} onChange={(event) => setTokenForm((current) => ({ ...current, projectScope: event.target.value }))} /></Field> : null}
                  {!tokenForm.id ? <Field id="token-expires-at" label="到期时间"><TextInput type="datetime-local" value={tokenForm.expiresAt} onChange={(event) => setTokenForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field> : null}
                </form>
              </Modal>
              <Modal
                open={profileModalOpen}
                dirty={profileDirty}
                title="编辑个人资料"
                onClose={() => { if (!profileSubmitting) setProfileModalOpen(false); }}
                footer={(
                  <>
                    <Button variant="secondary" disabled={profileSubmitting} onClick={() => setProfileModalOpen(false)}>取消</Button>
                    <Button loading={profileSubmitting} ariaLabel="保存个人资料" onClick={() => {
                      const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('profile-form'));
                      form?.requestSubmit();
                    }}>保存</Button>
                  </>
                )}
              >
                <form id="profile-form" onSubmit={submitProfile}>
                  {profileError ? <Feedback tone="danger" title="保存失败">{profileError}</Feedback> : null}
                  <Field id="profile-display-name" label="显示名称" required>
                    <TextInput value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} />
                  </Field>
                  <Field id="profile-email" label="邮箱">
                    <TextInput type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
                  </Field>
                  <Field id="profile-mobile" label="手机号">
                    <TextInput value={profileForm.mobile} onChange={(event) => setProfileForm((current) => ({ ...current, mobile: event.target.value }))} />
                  </Field>
                </form>
              </Modal>
            </section>
    </>
  );
}
