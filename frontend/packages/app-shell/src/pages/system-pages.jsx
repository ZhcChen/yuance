// @ts-check
// 由 app.jsx 拆出的页面（行为不变）：状态与处理函数经 ctx 传入。

import { auditActionLabel, formatTimestamp, projectMemberRoleLabel, systemAccountStatusLabel } from '../app-helpers.jsx';
import { buildSystemApiDocsPath, buildSystemAuditPath, buildSystemOpenApiPath, buildSystemPermissionsPath, buildSystemRolesPath, buildSystemStoragePath, buildSystemUsersPath, routePathForOwner } from '@yuance/frontend-app-core';
import { Button, DataTable, Feedback, Field, FilterBar, FilterField, Modal, Pagination, Panel, Select, StatusPill, TextInput } from '@yuance/frontend-ui';

/** @param {{ ctx: any }} props */
export function SystemPermissionsPage({ ctx }) {
  const { handleNavigate, headingRef, navigate, route, systemPermissionGroups, systemPermissions } = ctx;
  return (
    <>
            <section className="page-stack system-permissions-page" aria-labelledby="system-permissions-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-permissions-title" ref={headingRef} tabIndex={-1}>权限点</h1>
                  <p className="page-head__desc">权限点由 core seed 管理；角色权限维护推荐在角色权限工作台完成。</p>
                </div>
                <div className="page-head__actions">
                  <a className="yc-button yc-button-secondary" href={buildSystemRolesPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildSystemRolesPath({ owner: route.owner }), '正在打开角色权限。')}>返回角色权限</a>
                </div>
              </div>
              <Panel title="权限树" description={`权限点由 core seed 管理，共 ${systemPermissions.length} 项`} flush>
              <FilterBar ariaLabel="权限筛选" onSubmit={(event) => { event.preventDefault(); const input = /** @type {HTMLInputElement | null} */ (event.currentTarget.elements.namedItem('q')); navigate(buildSystemPermissionsPath({ owner: route.owner, q: input?.value || '' }), '正在筛选权限目录。'); }} actions={<><Button type="submit">搜索</Button>{route.q ? <Button variant="secondary" onClick={() => navigate(buildSystemPermissionsPath({ owner: route.owner }), '已清除权限筛选。')}>清除</Button> : null}</>}>
                <FilterField id="system-permissions-query" label="搜索权限"><TextInput name="q" defaultValue={route.q} placeholder="名称、权限键或资源" /></FilterField>
              </FilterBar>
              {systemPermissionGroups.length ? <div className="permission-tree" aria-label="系统权限目录">{systemPermissionGroups.map((group) => <section className="permission-group" key={group.key}><header className="permission-group-head"><div className="permission-check permission-check-group"><span><strong>{group.key}</strong><em>{group.permissions.length} 个权限点</em></span></div></header><div className="permission-pages">{group.permissions.map((permission) => <article className="permission-page" key={permission.permission_key}><div className="permission-check permission-check-page"><span><strong>{permission.permission_name}</strong><em>{permission.permission_key} · {permission.resource_type === 'page' ? '页面' : '操作'}</em></span></div></article>)}</div></section>)}</div> : <Feedback tone="info" title={route.q ? '没有匹配的权限点。' : '暂无权限点。'} />}
              </Panel>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemDatabaseStatsPage({ ctx }) {
  const { headingRef, refreshSystemDatabaseStats, systemDatabaseStats, systemDatabaseStatsError, systemDatabaseStatsRefreshing, systemDatabaseTables, systemDatabaseTotalRows } = ctx;
  return (
    <>
            <section className="page-stack database-stats-page" aria-labelledby="system-database-stats-title" aria-busy={systemDatabaseStatsRefreshing}>
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-database-stats-title" ref={headingRef} tabIndex={-1}>数据库统计</h1>
                  <p className="page-head__desc">进入页面时仅展示浏览器缓存；点击刷新后才会重新读取最新表清单、备注与数据量。</p>
                </div>
                <div className="page-head__actions">
                  <Button loading={systemDatabaseStatsRefreshing} onClick={() => void refreshSystemDatabaseStats()}>刷新</Button>
                </div>
              </div>
              {systemDatabaseStatsError ? <Feedback tone="danger" title="刷新失败">{systemDatabaseStatsError}{systemDatabaseStats ? ' 当前继续展示上一次缓存。' : ''}</Feedback> : null}
              {systemDatabaseStats ? (
                <>
                  <div className="database-stats-toolbar"><div className="database-stats-summary">
                    <strong>共 {systemDatabaseTables.length.toLocaleString('zh-CN')} 张表，合计 {systemDatabaseTotalRows.toLocaleString('zh-CN')} 行数据</strong>
                    <span className="shell-muted">{systemDatabaseStats.source === 'cache' ? '当前展示宿主缓存' : '已读取最新数据库快照'} · 上次刷新 {formatTimestamp(systemDatabaseStats.snapshot.refreshed_at)}</span>
                  </div></div>
                  <DataTable caption="数据库统计大表" rows={systemDatabaseTables} rowKey={(table) => table.table_name} emptyText="数据库中暂未发现可展示的业务表。" columns={[
                    { key: 'name', label: '表名', render: (table) => <strong>{table.table_name}</strong> },
                    { key: 'remark', label: '备注', render: (table) => table.remark || '业务表（备注待补充）' },
                    { key: 'count', label: '数据量', render: (table) => <><strong>{Number(table.row_count || 0).toLocaleString('zh-CN')}</strong><br /><span className="shell-muted">{Number(table.column_count || 0).toLocaleString('zh-CN')} 个字段</span></> },
                  ]} />
                </>
              ) : (
                <Feedback tone={systemDatabaseStatsError ? 'danger' : 'info'} title={systemDatabaseStatsError ? '刷新失败' : '当前宿主暂无缓存'}>
                  {systemDatabaseStatsError || '点击“刷新”后，系统会读取最新的表清单、表备注和数据量。'}
                </Feedback>
              )}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemAuditPage({ ctx }) {
  const { FormData, headingRef, navigate, route, systemAuditPage } = ctx;
  return (
    <>
            <section className="page-stack audit-page" aria-labelledby="system-audit-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-audit-title" ref={headingRef} tabIndex={-1}>审计日志</h1>
                  <p className="page-head__desc">记录登录、首次初始化、用户角色维护、对象存储配置等关键操作，支持按操作人、动作和对象过滤。</p>
                </div>
              </div>
              <FilterBar className="audit-filter-bar" ariaLabel="审计日志筛选" onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                navigate(buildSystemAuditPath({ owner: route.owner, actor: String(values.get('actor') || ''), action: String(values.get('action') || ''), targetType: String(values.get('target_type') || ''), targetId: String(values.get('target_id') || ''), perPage: route.perPage }), '正在筛选审计日志。');
              }} actions={<><Button type="submit">筛选</Button><Button variant="secondary" onClick={() => navigate(buildSystemAuditPath({ owner: route.owner }), '已重置审计筛选。')}>重置</Button></>}>
                <FilterField id="system-audit-actor" label="操作人"><TextInput name="actor" defaultValue={route.actor} placeholder="用户名或显示名称" /></FilterField>
                <FilterField id="system-audit-action" label="动作"><TextInput name="action" defaultValue={route.action} placeholder="如 auth.login" /></FilterField>
                <FilterField id="system-audit-target-type" label="对象类型"><TextInput name="target_type" defaultValue={route.targetType} placeholder="如 user / project" /></FilterField>
                <FilterField id="system-audit-target-id" label="对象 ID"><TextInput name="target_id" defaultValue={route.targetId} placeholder="对象编号或主键" /></FilterField>
              </FilterBar>
              <DataTable caption="审计日志列表" rows={systemAuditPage?.items || []} rowKey={(log) => log.id} emptyText="暂无审计记录。" columns={[
                { key: 'time', label: '时间', render: (log) => formatTimestamp(log.created_at) },
                { key: 'actor', label: '操作人', render: (log) => log.actor_username ? `${log.actor_display_name} @${log.actor_username}` : log.actor_display_name },
                { key: 'action', label: '动作', render: (log) => <><strong>{auditActionLabel(log.action)}</strong><br /><code>{log.action}</code></> },
                { key: 'target', label: '对象', render: (log) => log.target_type || log.target_id ? `${log.target_type}${log.target_id ? ` / ${log.target_id}` : ''}` : '系统' },
                { key: 'source', label: '来源', render: (log) => <>{log.ip || '-'}<br /><span className="shell-muted">{log.user_agent || '-'}</span></> },
                { key: 'metadata', label: '元数据', render: (log) => <code>{log.metadata || '{}'}</code> },
              ]} />
              {systemAuditPage ? <div className="system-ops-pager"><Pagination page={systemAuditPage.pagination.page} totalPages={systemAuditPage.pagination.total_pages} totalItems={systemAuditPage.pagination.total_items} onPageChange={(page) => navigate(buildSystemAuditPath({ owner: route.owner, actor: route.actor, action: route.action, targetType: route.targetType, targetId: route.targetId, page, perPage: route.perPage }), `正在打开第 ${page} 页审计日志。`)} /><label className="shell-page-size">每页<select value={route.perPage} onChange={(event) => navigate(buildSystemAuditPath({ owner: route.owner, actor: route.actor, action: route.action, targetType: route.targetType, targetId: route.targetId, perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div> : null}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemApiDocsPage({ ctx }) {
  const { OverlayScrollTarget, handleNavigate, route, systemApiDocs } = ctx;
  return (
    <>
            <section className="shell-card shell-panel-wide" aria-labelledby="system-api-docs-title">
              <div className="shell-panel-header">
                <div><h2 id="system-api-docs-title">{systemApiDocs?.title || '系统 API 文档'}</h2><p className="shell-muted">OpenAPI {systemApiDocs?.openapi || '-'} · 契约版本 {systemApiDocs?.version || '-'}</p></div>
                <a className="shell-link" href={buildSystemOpenApiPath(route.owner)} onClick={(event) => handleNavigate(event, buildSystemOpenApiPath(route.owner), '正在打开系统 Token 管理。')}>系统 Token 管理</a>
              </div>
              {systemApiDocs ? <>
                <p>{systemApiDocs.description}</p>
                <nav className="api-docs-nav" aria-label="API 端点导航">
                  {systemApiDocs.operations.map((operation) => <a key={operation.id} className="shell-link" href={`#${operation.id}`}><strong className={`api-docs-method api-docs-method-${operation.method.toLowerCase()}`}>{operation.method}</strong> <code>{operation.path}</code><span>{operation.summary}</span></a>)}
                </nav>
                {systemApiDocs.operations.length === 0 ? <Feedback tone="info" title="当前契约没有登记 API 操作。" /> : null}
                <div className="api-docs-operations" aria-label="API 操作契约">
                  {systemApiDocs.operations.map((operation) => <article id={operation.id} className="api-docs-operation" key={operation.id}>
                    <div className="shell-panel-header"><div className="api-docs-heading"><span className={`api-docs-method api-docs-method-${operation.method.toLowerCase()}`}>{operation.method}</span><h3><code>{operation.path}</code></h3></div><a className="shell-link" href="#system-api-docs-title">返回顶部</a></div>
                    <p><strong>{operation.summary}</strong></p>
                    {operation.description ? <p className="shell-muted">{operation.description}</p> : null}
                    {operation.tags.length ? <p className="shell-muted">标签：{operation.tags.join('、')}</p> : null}
                    <details><summary>查看完整操作契约</summary><OverlayScrollTarget as="pre" axis="both" label="完整操作契约" className="shell-code-block">{operation.contract}</OverlayScrollTarget></details>
                  </article>)}
                </div>
                <details><summary>查看 Components</summary><OverlayScrollTarget as="pre" axis="both" label="Components" className="shell-code-block">{systemApiDocs.components}</OverlayScrollTarget></details>
                <details><summary>查看完整 OpenAPI JSON</summary><OverlayScrollTarget as="pre" axis="both" label="完整 OpenAPI JSON" className="shell-code-block">{systemApiDocs.source}</OverlayScrollTarget></details>
              </> : null}
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemOpenApiPage({ ctx }) {
  const { confirmSystemApiTokenDelete, createdSystemApiToken, handleNavigate, headingRef, openSystemApiTokenCreate, openSystemApiTokenEdit, route, runtime, setCreatedSystemApiToken, setSystemApiTokenDeleteTarget, setSystemApiTokenEditor, setSystemApiTokenError, setSystemApiTokenForm, submitSystemApiToken, systemApiTokenDeleteTarget, systemApiTokenDirty, systemApiTokenEditor, systemApiTokenError, systemApiTokenForm, systemApiTokenSubmitting, systemOpenApiView, toggleSystemApiTokenScope } = ctx;
  return (
    <>
            <section className="page-stack system-openapi-page" aria-labelledby="system-openapi-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-openapi-title" ref={headingRef} tabIndex={-1}>系统 OpenAPI</h1>
                  <p className="page-head__desc">独立于普通业务 OpenAPI，当前用于版本管理自动化接入。适合 GitHub Actions、发布脚本和系统级集成。</p>
                </div>
                <div className="page-head__actions">
                  {systemOpenApiView?.can_manage_tokens ? <Button disabled={systemApiTokenSubmitting || (systemOpenApiView.active_count >= systemOpenApiView.token_limit)} onClick={openSystemApiTokenCreate}>创建系统 Token</Button> : null}
                </div>
              </div>
              <section className="storage-layout system-openapi-layout">
                <section className="shell-card system-openapi-access-panel"><div className="shell-panel-header system-openapi-panel-head"><div><h2>文档与接入</h2><p className="shell-muted">system token 使用 Bearer 认证；第一阶段仅开放版本读取与版本写入能力。</p></div></div><div className="system-openapi-body"><div className="system-openapi-actions"><a className="yc-button yc-button-secondary" href="/api/system/openapi.json" target="_blank" rel="noreferrer">下载 OpenAPI JSON</a><a className="yc-button yc-button-secondary" href={buildSystemApiDocsPath(route.owner)} onClick={(event) => handleNavigate(event, buildSystemApiDocsPath(route.owner), '正在打开系统 API 文档。')}>打开在线文档</a></div><dl className="system-openapi-summary"><div className="system-openapi-summary-item"><dt>认证方式</dt><dd><code>Authorization: Bearer &lt;system_token&gt;</code></dd></div><div className="system-openapi-summary-item"><dt>当前开放</dt><dd><div className="system-openapi-scope-list" aria-label="当前开放接口范围">{['版本列表', '版本详情', '创建版本', '编辑版本', '发布版本', '资产上传签名', '上传确认'].map((label) => <span className="system-openapi-scope" key={label}>{label}</span>)}</div></dd></div><div className="system-openapi-summary-item system-openapi-summary-item-muted"><dt>暂未开放</dt><dd>版本保留策略、对象存储设置、用户 / 角色 / 审计等其它系统接口。</dd></div></dl></div></section>
                <aside className="shell-card storage-side"><h2>接入提示</h2><ul className="check-list"><li>优先为自动化任务创建最小权限 token。</li><li>版本资产上传采用：创建资产 → 获取上传地址 → 上传文件 → 确认已上传。</li><li>{systemOpenApiView?.can_manage_tokens ? 'Token 明文仅在创建成功后展示一次；删除后立即失效。' : '你当前只有查看权限，无法修改 token。'}</li></ul></aside>
              </section>
              <section className="shell-card api-token-panel"><div className="shell-panel-header system-openapi-panel-head"><div><h2>System Access Token</h2><p className="shell-muted">用于 system OpenAPI 的独立访问凭证，和普通用户 PAT 分离。</p></div><div className="token-panel-actions"><span className="token-quota">有效 Token {systemOpenApiView?.active_count || 0}/{systemOpenApiView?.token_limit || 100}</span>{systemOpenApiView?.can_manage_tokens ? <Button disabled={systemApiTokenSubmitting || (systemOpenApiView.active_count >= systemOpenApiView.token_limit)} onClick={openSystemApiTokenCreate}>创建 Token</Button> : null}</div></div>
              {createdSystemApiToken ? <Feedback tone="success" title="系统 Token 已创建"><Field id="system-api-token-created" label="Token 明文" hint="关闭或刷新后不再显示。"><TextInput readOnly value={createdSystemApiToken} onFocus={(event) => event.currentTarget.select()} /></Field></Feedback> : null}
              {systemApiTokenError && !systemApiTokenEditor && !systemApiTokenDeleteTarget ? <Feedback tone="danger" title="系统 Token 操作失败">{systemApiTokenError}</Feedback> : null}
              <DataTable caption="系统 OpenAPI Token 列表" rows={systemOpenApiView?.items || []} rowKey={(item) => item.id} emptyText="暂无系统 Token。" columns={[
                { key: 'name', label: '名称', render: (item) => <><strong>{item.name}</strong><br /><code>****{item.token_suffix}</code></> },
                { key: 'scopes', label: 'Scope', render: (item) => item.scopes.map((scope) => scope === 'system_release:read' ? '版本读取' : '版本写入 / 发布 / 资产上传').join('、') },
                { key: 'creator', label: '创建 / 更新', render: (item) => <>{item.created_by || '系统'}<br /><span className="shell-muted">{item.updated_by || '系统'}</span></> },
                { key: 'activity', label: '最近使用', render: (item) => item.last_used_at ? formatTimestamp(item.last_used_at) : '从未使用' },
                { key: 'created', label: '创建时间', render: (item) => formatTimestamp(item.created_at) },
                { key: 'actions', label: '操作', render: (item) => systemOpenApiView?.can_manage_tokens ? <div className="shell-actions-inline"><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => openSystemApiTokenEdit(item)}>编辑</Button><Button variant="danger" disabled={systemApiTokenSubmitting} onClick={() => { setSystemApiTokenError(''); setCreatedSystemApiToken(''); setSystemApiTokenDeleteTarget(item); }}>删除</Button></div> : '只读' },
              ]} />
              </section>
              <Modal open={Boolean(systemApiTokenEditor)} dirty={systemApiTokenDirty} title={systemApiTokenEditor?.mode === 'create' ? '创建系统 Token' : '编辑系统 Token'} onClose={() => { if (!systemApiTokenSubmitting) { setSystemApiTokenEditor(null); setSystemApiTokenError(''); } }} footer={<><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => setSystemApiTokenEditor(null)}>取消</Button><Button loading={systemApiTokenSubmitting} disabled={!systemApiTokenForm.name.trim() || systemApiTokenForm.scopes.length === 0} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-api-token-form'))?.requestSubmit()}>{systemApiTokenEditor?.mode === 'create' ? '创建' : '保存'}</Button></>}>
                <form id="system-api-token-form" onSubmit={submitSystemApiToken}>
                  <Field id="system-api-token-name" label="名称" required><TextInput maxLength={80} value={systemApiTokenForm.name} onChange={(event) => setSystemApiTokenForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <fieldset disabled={systemApiTokenSubmitting}><legend>Scope</legend>
                    <label><input type="checkbox" checked={systemApiTokenForm.scopes.includes('system_release:read')} onChange={(event) => toggleSystemApiTokenScope('system_release:read', event.target.checked)} /> 版本读取</label>
                    <label><input type="checkbox" checked={systemApiTokenForm.scopes.includes('system_release:write')} onChange={(event) => toggleSystemApiTokenScope('system_release:write', event.target.checked)} /> 版本写入 / 发布 / 资产上传</label>
                  </fieldset>
                  {systemApiTokenError ? <Feedback tone="danger" title="保存失败">{systemApiTokenError}</Feedback> : null}
                </form>
              </Modal>
              <Modal open={Boolean(systemApiTokenDeleteTarget)} title="删除系统 Token" onClose={() => { if (!systemApiTokenSubmitting) { setSystemApiTokenDeleteTarget(null); setSystemApiTokenError(''); } }} footer={<><Button variant="secondary" disabled={systemApiTokenSubmitting} onClick={() => setSystemApiTokenDeleteTarget(null)}>取消</Button><Button variant="danger" loading={systemApiTokenSubmitting} onClick={() => void confirmSystemApiTokenDelete()}>确认删除</Button></>}><p>确认删除 {systemApiTokenDeleteTarget?.name || ''}？使用该 Token 的自动化会立即失去访问权限。</p>{systemApiTokenError ? <Feedback tone="danger" title="删除失败">{systemApiTokenError}</Feedback> : null}</Modal>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemStoragePage({ ctx }) {
  const { closeSystemStorageEdit, confirmSystemStorageAction, headingRef, navigate, openSystemStorageEdit, probeSystemStorage, requestSystemStorageSave, route, setSystemStorageConfirmation, setSystemStorageForm, systemStorageConfirmation, systemStorageDirty, systemStorageEditOpen, systemStorageError, systemStorageForm, systemStorageSubmitting, systemStorageView } = ctx;
  return (
    <>
            <section className="storage-page" aria-label="存储工作台">
              <section className="storage-layout">
                <section className="shell-card storage-form" aria-labelledby="system-storage-title">
                  <div className="shell-panel-header storage-panel-head"><div><h1 id="system-storage-title" ref={headingRef} tabIndex={-1}>阿里云 OSS</h1><p className="shell-muted">长期密钥加密入库，页面只展示 AccessKey ID 脱敏 hint。</p></div>{systemStorageView?.can_manage_storage ? <div className="shell-actions-inline">{systemStorageView.config ? <Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => void probeSystemStorage()}>测试连接</Button> : null}<Button disabled={systemStorageSubmitting} onClick={openSystemStorageEdit}>编辑配置</Button></div> : null}</div>
                  {systemStorageError ? <Feedback tone="danger" title="存储操作需要处理">{systemStorageError}</Feedback> : null}
                  {systemStorageView?.config ? <dl className="config-summary-grid storage-meta">
                    <div className="config-summary-item"><dt>Provider</dt><dd>{systemStorageView.config.provider}</dd></div>
                    <div className="config-summary-item"><dt>状态</dt><dd><StatusPill tone={systemStorageView.config.status === 'active' ? 'success' : 'neutral'}>{systemStorageView.config.status}</StatusPill></dd></div>
                    <div className="config-summary-item"><dt>Bucket</dt><dd>{systemStorageView.config.bucket}</dd></div>
                    <div className="config-summary-item"><dt>AccessKey</dt><dd>{systemStorageView.config.access_key_id_hint || '未配置'}</dd></div>
                    <div className="config-summary-item"><dt>版本</dt><dd>v{systemStorageView.config.version} · {formatTimestamp(systemStorageView.config.updated_at)}</dd></div>
                  </dl> : <div className="storage-empty"><strong>尚未配置对象存储</strong><span>{systemStorageView?.inspection_error || '保存并激活配置后，文件上传底座将使用 OSS 生成短期签名 URL。'}</span></div>}
                </section>
                <aside className="shell-card storage-side"><h2>配置边界</h2><ul className="check-list"><li>长期密钥不进入页面、日志或静态文件。</li><li>业务上传使用服务端短期签名 URL。</li><li>每次保存和回滚都会生成不可变配置快照。</li></ul></aside>
              </section>
              <section className="shell-card storage-bucket-panel" aria-labelledby="system-storage-inspection-title">
                <div className="shell-panel-header storage-panel-head"><div><h2 id="system-storage-inspection-title">桶状态</h2><p className="shell-muted">检测当前激活 Bucket 的读写权限；初始化会按需创建 Bucket、补齐浏览器直传 CORS，并写入元策初始化标记。</p></div>{systemStorageView?.can_manage_storage && systemStorageView.config ? <div className="shell-actions-inline"><Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => void probeSystemStorage()}>检测桶状态</Button><Button disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation({ kind: 'initialize' })}>初始化桶</Button></div> : null}</div>
                {systemStorageView?.inspection ? <div className="storage-bucket-body"><div className="storage-bucket-summary"><div><strong>{systemStorageView.config?.bucket || '未配置 Bucket'}</strong><span>{systemStorageView.config?.provider || 'aliyun_oss'}</span></div><StatusPill tone={systemStorageView.inspection.ok ? 'success' : systemStorageView.inspection.needs_initialization ? 'warning' : 'danger'}>{systemStorageView.inspection.ok ? '运行就绪' : systemStorageView.inspection.needs_initialization ? '需要初始化' : '检测异常'}</StatusPill></div><p className="storage-bucket-message">{systemStorageView.inspection.message}</p>{systemStorageView.inspection.checks?.length ? <div className="storage-check-list" aria-label="存储检查项目">{systemStorageView.inspection.checks.map((item) => <article className="storage-check-row" key={item.code}><StatusPill tone={item.status === 'ok' ? 'success' : item.status === 'missing' ? 'warning' : 'info'}>{item.status}</StatusPill><div><strong>{item.code}</strong><p>{item.message}</p></div></article>)}</div> : null}</div> : systemStorageView?.config ? <div className="storage-bucket-body"><Feedback tone="warning" title="Bucket 检查不可用">{systemStorageView.inspection_error}</Feedback></div> : null}
              </section>
              <section className="shell-card storage-versions-panel" aria-labelledby="system-storage-versions-title">
                <div className="shell-panel-header storage-panel-head"><div><h2 id="system-storage-versions-title">配置版本</h2><p className="shell-muted">按时间倒序保留对象存储快照；回滚会生成新的激活版本，不直接修改历史记录。</p></div></div>
                {(systemStorageView?.versions || []).length ? <div className="storage-version-list" aria-label="存储配置版本">{systemStorageView.versions.map((item) => <article className="storage-version-row" key={item.id}><div className="storage-version-main"><div className="storage-version-title"><strong>v{item.version}</strong><StatusPill tone={item.current_status === 'active' ? 'success' : 'neutral'}>{item.current_status}</StatusPill></div><div className="storage-version-meta"><span>{item.bucket}</span><span>{item.endpoint}</span><span>{item.access_key_id_hint || '未配置'}</span></div><div className="storage-version-foot"><span>{item.provider}</span><span>{item.region || '未填写地域'}</span><span>{item.created_by || '系统'} · {formatTimestamp(item.created_at)}</span></div></div>{systemStorageView?.can_manage_storage ? <div className="storage-version-actions">{item.current_status === 'active' ? <span className="shell-muted">当前激活</span> : <Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation({ kind: 'rollback', version: item.version, bucket: item.bucket })}>回滚到此版本</Button>}</div> : null}</article>)}</div> : <div className="storage-empty"><strong>暂无配置版本</strong><span>保存对象存储配置后，系统会自动记录版本快照。</span></div>}
                {systemStorageView ? <div className="storage-pager"><Pagination page={systemStorageView.pagination.page} totalPages={systemStorageView.pagination.total_pages} totalItems={systemStorageView.pagination.total_items} onPageChange={(page) => navigate(buildSystemStoragePath({ owner: route.owner, page, perPage: systemStorageView.pagination.per_page }), `正在加载第 ${page} 页存储版本。`)} /><label className="shell-page-size">每页<select value={systemStorageView.pagination.per_page} onChange={(event) => navigate(buildSystemStoragePath({ owner: route.owner, perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label></div> : null}
              </section>
              <Modal open={systemStorageEditOpen} dirty={systemStorageDirty} title="编辑阿里云 OSS 配置" onClose={closeSystemStorageEdit} footer={<><Button variant="secondary" disabled={systemStorageSubmitting} onClick={closeSystemStorageEdit}>取消</Button><Button variant="secondary" loading={systemStorageSubmitting} onClick={() => void requestSystemStorageSave(false)}>保存草稿</Button><Button loading={systemStorageSubmitting} onClick={() => void requestSystemStorageSave(true)}>保存并激活</Button></>}>
                <form id="system-storage-form" onSubmit={(event) => { event.preventDefault(); void requestSystemStorageSave(true); }}>
                  <Field id="system-storage-endpoint" label="Endpoint" required><TextInput value={systemStorageForm.endpoint} onChange={(event) => setSystemStorageForm((current) => ({ ...current, endpoint: event.target.value }))} /></Field>
                  <Field id="system-storage-region" label="Region"><TextInput value={systemStorageForm.region} onChange={(event) => setSystemStorageForm((current) => ({ ...current, region: event.target.value }))} /></Field>
                  <Field id="system-storage-bucket" label="Bucket" required><TextInput value={systemStorageForm.bucket} onChange={(event) => setSystemStorageForm((current) => ({ ...current, bucket: event.target.value }))} /></Field>
                  <Field id="system-storage-access-key-id" label="AccessKey ID" hint={systemStorageView?.config?.access_key_id_hint ? `当前仅显示脱敏值：${systemStorageView.config.access_key_id_hint}` : '保存后不再回显明文。'} required><TextInput autoComplete="off" value={systemStorageForm.accessKeyId} onChange={(event) => setSystemStorageForm((current) => ({ ...current, accessKeyId: event.target.value }))} /></Field>
                  <Field id="system-storage-access-key-secret" label="AccessKey Secret" hint="保存后不再回显明文。" required><TextInput type="password" autoComplete="new-password" value={systemStorageForm.accessKeySecret} onChange={(event) => setSystemStorageForm((current) => ({ ...current, accessKeySecret: event.target.value }))} /></Field>
                  {systemStorageError ? <Feedback tone="danger" title="配置保存失败">{systemStorageError}</Feedback> : null}
                </form>
              </Modal>
              <Modal open={Boolean(systemStorageConfirmation)} title={systemStorageConfirmation?.kind === 'save' ? '切换对象存储目标' : systemStorageConfirmation?.kind === 'initialize' ? '初始化对象存储 Bucket' : '回滚对象存储配置'} onClose={() => { if (!systemStorageSubmitting) setSystemStorageConfirmation(null); }} footer={<><Button variant="secondary" disabled={systemStorageSubmitting} onClick={() => setSystemStorageConfirmation(null)}>取消</Button><Button variant={systemStorageConfirmation?.kind === 'save' ? 'primary' : 'danger'} loading={systemStorageSubmitting} onClick={() => void confirmSystemStorageAction()}>确认</Button></>}>
                <p>{systemStorageConfirmation?.kind === 'save' ? 'Endpoint 或 Bucket 已变化。现有对象不会自动迁移，确认保存这个新目标？' : systemStorageConfirmation?.kind === 'initialize' ? '初始化会按需创建 Bucket、配置浏览器直传 CORS 并写入元策初始化标记。' : `确认回滚到 v${systemStorageConfirmation?.kind === 'rollback' ? systemStorageConfirmation.version : ''}（${systemStorageConfirmation?.kind === 'rollback' ? systemStorageConfirmation.bucket : ''}）？系统会生成新的激活版本。`}</p>
                {systemStorageError ? <Feedback tone="danger" title="操作失败">{systemStorageError}</Feedback> : null}
              </Modal>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemRolesPage({ ctx }) {
  const { confirmSystemRoleStatus, handleNavigate, headingRef, navigate, route, runtime, setSystemRoleCreateForm, setSystemRoleCreateOpen, setSystemRoleError, setSystemRoleStatusTarget, submitSystemRoleCreate, submitSystemRolePermissions, systemRoleCreateDirty, systemRoleCreateForm, systemRoleCreateOpen, systemRoleError, systemRolePermissionGroups, systemRolePermissionKeys, systemRoleStatusTarget, systemRoleSubmitting, systemRolesView, toggleSystemRolePermission, toggleSystemRolePermissionGroup } = ctx;
  return (
    <>
            <section className="page-stack system-roles-page" aria-labelledby="system-roles-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-roles-title" ref={headingRef} tabIndex={-1}>角色权限</h1>
                  <p className="page-head__desc">按 RBAC 模型维护角色、状态、数据范围与功能权限树；项目内数据范围仍由项目成员关系控制。</p>
                </div>
                <div className="page-head__actions">
                  <a className="yc-button yc-button-secondary" href={buildSystemPermissionsPath({ owner: route.owner })} onClick={(event) => handleNavigate(event, buildSystemPermissionsPath({ owner: route.owner }), '正在打开权限目录。')}>全部权限点</a>
                </div>
              </div>
              <section className="role-workbench">
              <aside className="shell-card role-workbench-sidebar" aria-label="角色列表">
              <div className="shell-panel-header"><div><h2>角色列表</h2><p className="shell-muted">选择左侧角色后，在右侧直接维护权限树。</p></div>{systemRolesView?.can_manage_roles ? <Button onClick={() => { setSystemRoleError(''); setSystemRoleCreateOpen(true); }}>新建角色</Button> : null}</div>
              {systemRoleError && !systemRoleCreateOpen && !systemRoleStatusTarget ? <Feedback tone="danger" title="角色操作失败">{systemRoleError}</Feedback> : null}
              {(systemRolesView?.items || []).length ? <div className="role-list">{systemRolesView.items.map((item) => <div className={`role-list-row ${item.role_code === systemRolesView.selected_role?.role_code ? 'active' : ''}`} key={item.role_code}><a className="role-list-item" href={buildSystemRolesPath({ owner: route.owner, role: item.role_code, page: systemRolesView.pagination.page, perPage: systemRolesView.pagination.per_page })} onClick={(event) => handleNavigate(event, buildSystemRolesPath({ owner: route.owner, role: item.role_code, page: systemRolesView.pagination.page, perPage: systemRolesView.pagination.per_page }), `正在打开${item.role_name}。`)}><span><strong>{item.role_name}</strong><em>{item.role_code}{item.is_system ? ' · 系统内置' : ''}</em></span><span className="role-list-meta"><StatusPill tone={item.status === 'active' ? 'success' : 'neutral'}>{systemAccountStatusLabel(item.status)}</StatusPill><span>{item.permission_count} 项</span></span></a>{systemRolesView.can_manage_roles && !item.is_system ? <div className="role-status-action"><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => { setSystemRoleError(''); setSystemRoleStatusTarget(item); }}>{item.status === 'active' ? '禁用' : '启用'}</Button></div> : null}</div>)}</div> : <Feedback tone="info" title="暂无角色">运行 core seed 后会生成系统角色。</Feedback>}
              {systemRolesView ? <div className="shell-panel-header">
                <Pagination page={systemRolesView.pagination.page} totalPages={systemRolesView.pagination.total_pages} totalItems={systemRolesView.pagination.total_items} onPageChange={(page) => navigate(buildSystemRolesPath({ owner: route.owner, role: systemRolesView.selected_role?.role_code || '', page, perPage: systemRolesView.pagination.per_page }), `正在加载第 ${page} 页角色。`)} />
                <label className="shell-page-size">每页<select value={systemRolesView.pagination.per_page} onChange={(event) => navigate(buildSystemRolesPath({ owner: route.owner, role: systemRolesView.selected_role?.role_code || '', perPage: Number(event.target.value) }), '正在更新每页数量。')}><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
              </div> : null}
              </aside>
              <section className="shell-card role-permission-panel" aria-label="权限树">
              {systemRolesView?.selected_role ? <form onSubmit={submitSystemRolePermissions} aria-labelledby="system-role-permissions-title"><div className="shell-panel-header role-permission-head"><div><h2 id="system-role-permissions-title">权限树</h2><p className="shell-muted">当前角色：{systemRolesView.selected_role.role_name} · 已授权 {systemRolePermissionKeys.length}/{systemRolesView.permissions.length} 项</p></div><div className="shell-actions-inline"><StatusPill tone={systemRolesView.selected_role.status === 'active' ? 'success' : 'neutral'}>{systemRolesView.selected_role.status}</StatusPill>{systemRolesView.can_edit_permissions ? <Button type="submit" loading={systemRoleSubmitting}>保存权限</Button> : null}</div></div><div className="role-summary-strip"><span>编码 <strong>{systemRolesView.selected_role.role_code}</strong></span><span>数据范围 <strong>{systemRolesView.selected_role.data_scope_type === 'all' ? '全部数据' : '本人数据'}</strong></span><span>已绑定 <strong>{systemRolesView.selected_role.permission_count}</strong> 项权限</span>{systemRolesView.selected_role.is_system ? <span>系统内置角色只读</span> : null}</div>{systemRolePermissionGroups.length ? <div className="permission-tree">{systemRolePermissionGroups.map((group) => { const permissions = [...group.pages, ...group.actions]; const granted = permissions.filter((permission) => systemRolePermissionKeys.includes(permission.permission_key)).length; return <section className="permission-group" key={group.key}><header className="permission-group-head"><label className="permission-check permission-check-group"><input type="checkbox" checked={granted === permissions.length && permissions.length > 0} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} onChange={(event) => toggleSystemRolePermissionGroup(group, event.target.checked)} /><span><strong>{group.key}</strong><em>{granted}/{permissions.length} 项已授权</em></span></label></header><div className="permission-pages">{group.pages.map((permission) => <article className="permission-page" key={permission.permission_key}><label className="permission-check permission-check-page"><input type="checkbox" checked={systemRolePermissionKeys.includes(permission.permission_key)} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} aria-label={`${permission.permission_name} ${systemRolePermissionKeys.includes(permission.permission_key) ? '已授权' : '未授权'}`} onChange={(event) => toggleSystemRolePermission(permission, event.target.checked)} /><span><strong>{permission.permission_name}</strong><em>{permission.permission_key} · {permission.resource_key}</em></span></label></article>)}{group.actions.length ? <article className="permission-page"><div className="permission-actions">{group.actions.map((permission) => <label className="permission-check permission-check-action" key={permission.permission_key}><input type="checkbox" checked={systemRolePermissionKeys.includes(permission.permission_key)} disabled={!systemRolesView.can_edit_permissions || systemRoleSubmitting} aria-label={`${permission.permission_name} ${systemRolePermissionKeys.includes(permission.permission_key) ? '已授权' : '未授权'}`} onChange={(event) => toggleSystemRolePermission(permission, event.target.checked)} /><span><strong>{permission.permission_name}</strong><em>{permission.permission_key}</em></span></label>)}</div></article> : null}</div></section>; })}</div> : <Feedback tone="info" title="暂无权限点">权限点由 core seed 维护。</Feedback>}</form> : <Feedback tone="info" title="请选择角色">当前分页没有可查看的角色。</Feedback>}
              </section>
              </section>
              <Modal open={systemRoleCreateOpen} dirty={systemRoleCreateDirty} title="创建角色" onClose={() => { if (!systemRoleSubmitting) { setSystemRoleCreateOpen(false); setSystemRoleError(''); } }} footer={<><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => setSystemRoleCreateOpen(false)}>取消</Button><Button loading={systemRoleSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-role-create-form'))?.requestSubmit()}>创建</Button></>}>
                <form id="system-role-create-form" onSubmit={submitSystemRoleCreate}>{systemRoleError ? <Feedback tone="danger" title="创建失败">{systemRoleError}</Feedback> : null}<Field id="system-role-code" label="角色编码" required><TextInput value={systemRoleCreateForm.roleCode} maxLength={64} placeholder="project_manager" onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, roleCode: event.target.value }))} /></Field><Field id="system-role-name" label="角色名称" required><TextInput value={systemRoleCreateForm.roleName} maxLength={64} placeholder="项目经理" onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, roleName: event.target.value }))} /></Field><Field id="system-role-scope" label="数据范围"><Select value={systemRoleCreateForm.dataScopeType} onChange={(event) => setSystemRoleCreateForm((current) => ({ ...current, dataScopeType: event.target.value }))}><option value="self">本人数据</option><option value="all">全部数据</option></Select></Field></form>
              </Modal>
              <Modal open={Boolean(systemRoleStatusTarget)} title={systemRoleStatusTarget?.status === 'active' ? '确认禁用角色' : '确认启用角色'} onClose={() => { if (!systemRoleSubmitting) { setSystemRoleStatusTarget(null); setSystemRoleError(''); } }} footer={<><Button variant="secondary" disabled={systemRoleSubmitting} onClick={() => setSystemRoleStatusTarget(null)}>取消</Button><Button variant={systemRoleStatusTarget?.status === 'active' ? 'danger' : 'primary'} loading={systemRoleSubmitting} onClick={() => void confirmSystemRoleStatus()}>确认{systemRoleStatusTarget?.status === 'active' ? '禁用' : '启用'}</Button></>}><p>{systemRoleStatusTarget?.status === 'active' ? `确认禁用角色“${systemRoleStatusTarget?.role_name}”？禁用后该角色授权不会再生效。` : `确认启用角色“${systemRoleStatusTarget?.role_name}”？启用后该角色授权会重新生效。`}</p>{systemRoleError ? <Feedback tone="danger" title="状态更新失败">{systemRoleError}</Feedback> : null}</Modal>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemUsersPage({ ctx }) {
  const { closeSystemUserAction, closeSystemUserCreate, closeSystemUserProjects, confirmSystemUserProjectRemove, confirmSystemUserStatus, headingRef, navigate, openSystemUserProjects, route, runtime, setSystemUserAction, setSystemUserCreateForm, setSystemUserCreateOpen, setSystemUserError, setSystemUserPasswordForm, setSystemUserProjectAssignKeys, setSystemUserProjectAssignRole, setSystemUserProjectDialog, setSystemUserProjectRemoveKeys, setSystemUserProjectRole, setSystemUserRoleCode, submitSystemUserCreate, submitSystemUserPassword, submitSystemUserProjectAssign, submitSystemUserProjectRole, submitSystemUserRole, systemUserAction, systemUserAssignableProjects, systemUserCreateDirty, systemUserCreateForm, systemUserCreateOpen, systemUserError, systemUserPasswordForm, systemUserProjectAssignKeys, systemUserProjectAssignRole, systemUserProjectDialog, systemUserProjectRemoveKeys, systemUserProjectRole, systemUserProjectTarget, systemUserRoleCode, systemUserSubmitting, systemUsersView } = ctx;
  return (
    <>
            <section className="page-stack system-users-page" aria-labelledby="system-users-title">
              <div className="page-head">
                <div className="page-head__text">
                  <h1 id="system-users-title" ref={headingRef} tabIndex={-1}>用户管理</h1>
                  <p className="page-head__desc">维护登录账号、基础资料和系统角色绑定。</p>
                </div>
                <div className="page-head__actions">
                  {systemUsersView?.can_manage_users ? <Button onClick={() => { setSystemUserError(''); setSystemUserCreateForm((current) => ({ ...current, roleCode: current.roleCode || systemUsersView.roles.find((role) => role.status === 'active')?.role_code || '' })); setSystemUserCreateOpen(true); }}>新建用户</Button> : null}
                </div>
              </div>
              <Panel title="用户列表" description={`共 ${systemUsersView?.pagination.total_items || 0} 个账号 · 按创建时间倒序排列`} ariaLabel="系统用户列表" flush>
              {systemUserError && !systemUserCreateOpen && !systemUserAction ? <Feedback tone="danger" title="用户操作失败">{systemUserError}</Feedback> : null}
              <DataTable
                caption="系统用户列表"
                rows={systemUsersView?.items || []}
                rowKey={(item) => item.username}
                emptyText="暂无用户。"
                columns={[
                  { key: 'user', label: '用户', render: (item) => <><strong>{item.display_name}</strong><br /><span className="shell-muted">@{item.username}{item.is_super_admin ? ' · 超级管理员' : ''}</span></> },
                  { key: 'contact', label: '联系方式', render: (item) => item.email || item.mobile || '未填写' },
                  { key: 'projects', label: '项目', render: (item) => item.is_super_admin ? <div className="user-project-stack"><StatusPill tone="info">全项目访问</StatusPill><span className="shell-muted">无需单独加入项目</span></div> : <div className="user-project-stack"><strong>{item.assigned_projects.length} 个项目</strong>{item.assigned_projects.length ? <div className="user-project-chip-list">{item.assigned_projects.slice(0, 2).map((project) => <span className="user-project-chip" title={`${project.key} · ${project.name}`} key={project.key}>{project.key}</span>)}{item.assigned_projects.length > 2 ? <span className="user-project-chip user-project-chip-muted">+{item.assigned_projects.length - 2}</span> : null}</div> : <span className="shell-muted">暂未加入任何项目</span>}</div> },
                  { key: 'roles', label: '角色', render: (item) => item.role_names || '未分配' },
                  { key: 'status', label: '状态', render: (item) => <StatusPill tone={item.status === 'active' ? 'success' : item.status === 'locked' ? 'warning' : 'neutral'}>{systemAccountStatusLabel(item.status)}</StatusPill> },
                  { key: 'updated', label: '更新', render: (item) => formatTimestamp(item.updated_at) },
                  { key: 'actions', label: '操作', render: (item) => systemUsersView?.can_manage_users ? <div className="shell-actions-inline">
                    {systemUsersView.can_manage_user_projects && !item.is_super_admin ? <Button variant="secondary" disabled={systemUserSubmitting} onClick={() => openSystemUserProjects(item)}>项目</Button> : null}
                    {!item.is_super_admin ? <><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserRoleCode(item.role_code); setSystemUserAction({ kind: 'role', user: item }); }}>角色</Button><Button variant={item.status === 'active' ? 'danger' : 'secondary'} disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserAction({ kind: 'status', user: item }); }}>{item.status === 'active' ? '停用' : '启用'}</Button></> : null}
                    <Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserPasswordForm({ password: '', passwordConfirm: '' }); setSystemUserAction({ kind: 'password', user: item }); }}>重置密码</Button>
                  </div> : '无权限' },
                ]}
              />
              {systemUsersView ? <Pagination
                ariaLabel="用户列表分页"
                page={systemUsersView.pagination.page}
                totalPages={systemUsersView.pagination.total_pages}
                totalItems={systemUsersView.pagination.total_items}
                itemLabel="个用户"
                rangeLabel={systemUsersView.pagination.total_items ? `当前显示 ${(systemUsersView.pagination.page - 1) * systemUsersView.pagination.per_page + 1}-${Math.min(systemUsersView.pagination.page * systemUsersView.pagination.per_page, systemUsersView.pagination.total_items)}` : '当前没有用户'}
                pageSize={systemUsersView.pagination.per_page}
                pageSizes={[10, 20, 50, 100]}
                onPageSizeChange={(event) => navigate(buildSystemUsersPath({ owner: route.owner, perPage: Number(event.target.value) }), '正在更新每页数量。')}
                onPageChange={(page) => navigate(buildSystemUsersPath({ owner: route.owner, page, perPage: systemUsersView.pagination.per_page }), `正在加载第 ${page} 页用户。`)}
              /> : null}
              </Panel>
              <Modal open={systemUserCreateOpen} dirty={systemUserCreateDirty} title="新建用户" onClose={closeSystemUserCreate} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserCreate}>取消</Button><Button loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-create-form')); form?.requestSubmit(); }}>创建</Button></>}>
                <form id="system-user-create-form" onSubmit={submitSystemUserCreate}>
                  {systemUserError ? <Feedback tone="danger" title="创建失败">{systemUserError}</Feedback> : null}
                  <Field id="system-user-username" label="用户名" required><TextInput value={systemUserCreateForm.username} maxLength={64} autoComplete="off" onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, username: event.target.value }))} /></Field>
                  <Field id="system-user-display-name" label="显示名称" required><TextInput value={systemUserCreateForm.displayName} maxLength={64} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, displayName: event.target.value }))} /></Field>
                  <Field id="system-user-email" label="邮箱"><TextInput type="email" value={systemUserCreateForm.email} maxLength={254} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                  <Field id="system-user-mobile" label="手机号"><TextInput value={systemUserCreateForm.mobile} maxLength={32} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, mobile: event.target.value }))} /></Field>
                  <Field id="system-user-role" label="全局角色" required><Select value={systemUserCreateForm.roleCode} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, roleCode: event.target.value }))}>{(systemUsersView?.roles || []).filter((role) => role.status === 'active').map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</Select></Field>
                  <Field id="system-user-password" label="初始密码" required><TextInput type="password" autoComplete="new-password" value={systemUserCreateForm.password} maxLength={256} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, password: event.target.value }))} /></Field>
                  <Field id="system-user-password-confirm" label="确认初始密码" required><TextInput type="password" autoComplete="new-password" value={systemUserCreateForm.passwordConfirm} maxLength={256} onChange={(event) => setSystemUserCreateForm((current) => ({ ...current, passwordConfirm: event.target.value }))} /></Field>
                </form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'role'} title="调整全局角色" onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-role-form')); form?.requestSubmit(); }}>保存</Button></>}>
                <form id="system-user-role-form" onSubmit={submitSystemUserRole}>{systemUserError ? <Feedback tone="danger" title="更新失败">{systemUserError}</Feedback> : null}<p>{systemUserAction?.user.display_name} @{systemUserAction?.user.username}</p><Field id="system-user-role-value" label="全局角色" required><Select value={systemUserRoleCode} onChange={(event) => setSystemUserRoleCode(event.target.value)}>{(systemUsersView?.roles || []).filter((role) => role.status === 'active').map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}</Select></Field></form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'password'} title="重置用户密码" onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button variant="danger" loading={systemUserSubmitting} onClick={() => { const form = /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-password-form')); form?.requestSubmit(); }}>确认重置</Button></>}>
                <form id="system-user-password-form" onSubmit={submitSystemUserPassword}>{systemUserError ? <Feedback tone="danger" title="重置失败">{systemUserError}</Feedback> : null}<p>重置“{systemUserAction?.user.display_name}”的密码后，该用户现有会话将立即撤销，新密码不会再次显示。</p><Field id="system-user-new-password" label="新密码" required><TextInput type="password" autoComplete="new-password" maxLength={256} value={systemUserPasswordForm.password} onChange={(event) => setSystemUserPasswordForm((current) => ({ ...current, password: event.target.value }))} /></Field><Field id="system-user-new-password-confirm" label="确认新密码" required><TextInput type="password" autoComplete="new-password" maxLength={256} value={systemUserPasswordForm.passwordConfirm} onChange={(event) => setSystemUserPasswordForm((current) => ({ ...current, passwordConfirm: event.target.value }))} /></Field></form>
              </Modal>
              <Modal open={systemUserAction?.kind === 'status'} title={systemUserAction?.user.status === 'active' ? '停用用户' : '启用用户'} onClose={closeSystemUserAction} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserAction}>取消</Button><Button variant={systemUserAction?.user.status === 'active' ? 'danger' : 'primary'} loading={systemUserSubmitting} onClick={() => void confirmSystemUserStatus()}>确认{systemUserAction?.user.status === 'active' ? '停用' : '启用'}</Button></>}><p>{systemUserAction?.user.status === 'active' ? `停用“${systemUserAction?.user.display_name}”将立即撤销其登录会话和 Token。` : `确认重新启用“${systemUserAction?.user.display_name}”？`}</p>{systemUserError ? <Feedback tone="danger" title="状态更新失败">{systemUserError}</Feedback> : null}</Modal>
              <Modal open={systemUserProjectDialog?.kind === 'manage'} title="管理用户项目" onClose={() => { if (systemUserProjectDialog?.kind === 'manage') closeSystemUserProjects(); }} footer={<Button variant="secondary" disabled={systemUserSubmitting} onClick={closeSystemUserProjects}>关闭</Button>}>
                {systemUserError ? <Feedback tone="danger" title="项目关系操作失败">{systemUserError}</Feedback> : null}
                <div className="system-user-projects">
                <p className="system-user-projects-target"><strong>{systemUserProjectTarget?.display_name}</strong> <span className="shell-muted">@{systemUserProjectTarget?.username}</span></p>
                <form id="system-user-project-assign-form" onSubmit={submitSystemUserProjectAssign}>
                  <fieldset className="system-user-projects-assign" disabled={systemUserSubmitting || systemUserAssignableProjects.length === 0}><legend>分配项目</legend>{systemUserAssignableProjects.length ? systemUserAssignableProjects.map((project) => <label key={project.key} className="system-user-projects-option"><input type="checkbox" checked={systemUserProjectAssignKeys.includes(project.key)} onChange={(event) => setSystemUserProjectAssignKeys((current) => event.target.checked ? [...current, project.key] : current.filter((key) => key !== project.key))} /> {project.key} · {project.name}</label>) : <p className="shell-muted">没有可分配项目。</p>}<Field id="system-user-project-assign-role" label="项目角色"><Select value={systemUserProjectAssignRole} onChange={(event) => setSystemUserProjectAssignRole(event.target.value)}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></Select></Field><div className="system-user-projects-assign-actions"><Button loading={systemUserSubmitting} disabled={systemUserProjectAssignKeys.length === 0} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-project-assign-form'))?.requestSubmit()}>分配所选项目</Button></div></fieldset>
                </form>
                <DataTable caption="已分配项目" rows={systemUserProjectTarget?.assigned_projects || []} rowKey={(project) => project.key} emptyText="尚未分配项目。" columns={[
                  { key: 'select', label: '选择', render: (project) => <input type="checkbox" aria-label={`选择移除 ${project.name}`} disabled={!project.can_remove || systemUserSubmitting} checked={systemUserProjectRemoveKeys.includes(project.key)} title={project.remove_block_reason || ''} onChange={(event) => setSystemUserProjectRemoveKeys((current) => event.target.checked ? [...current, project.key] : current.filter((key) => key !== project.key))} /> },
                  { key: 'project', label: '项目', render: (project) => <><strong>{project.name}</strong><br /><span className="shell-muted">{project.key} · {project.status}</span></> },
                  { key: 'role', label: '角色', render: (project) => projectMemberRoleLabel(project.role_code) },
                  { key: 'constraint', label: '约束', render: (project) => project.remove_block_reason || (project.active_assigned_count ? `${project.active_assigned_count} 个活跃工作项` : '可调整') },
                  { key: 'actions', label: '操作', render: (project) => <div className="shell-actions-inline"><Button variant="secondary" disabled={!project.can_update_role || systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserProjectRole(project.role_code); setSystemUserProjectDialog({ kind: 'role', username: systemUserProjectTarget?.username || '', projectKey: project.key }); }}>角色</Button><Button variant="danger" disabled={!project.can_remove || systemUserSubmitting} onClick={() => { setSystemUserError(''); setSystemUserProjectDialog({ kind: 'remove-one', username: systemUserProjectTarget?.username || '', projectKey: project.key }); }}>移除</Button></div> },
                ]} />
                <div className="system-user-projects-footer"><Button variant="danger" disabled={systemUserProjectRemoveKeys.length === 0 || systemUserSubmitting} onClick={() => setSystemUserProjectDialog({ kind: 'remove-batch', username: systemUserProjectTarget?.username || '' })}>移除所选项目</Button></div>
                </div>
              </Modal>
              <Modal open={systemUserProjectDialog?.kind === 'role'} title="调整项目角色" onClose={() => { if (!systemUserSubmitting && systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { if (systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }}>取消</Button><Button loading={systemUserSubmitting} onClick={() => /** @type {HTMLFormElement | null} */ (runtime.getElementById('system-user-project-role-form'))?.requestSubmit()}>保存</Button></>}><form id="system-user-project-role-form" onSubmit={submitSystemUserProjectRole}><p>{systemUserProjectTarget?.display_name} · {systemUserProjectDialog?.projectKey}</p><Field id="system-user-project-role" label="项目角色"><Select value={systemUserProjectRole} onChange={(event) => setSystemUserProjectRole(event.target.value)}><option value="viewer">只读成员</option><option value="member">项目成员</option><option value="maintainer">项目管理员</option></Select></Field>{systemUserError ? <Feedback tone="danger" title="角色更新失败">{systemUserError}</Feedback> : null}</form></Modal>
              <Modal open={systemUserProjectDialog?.kind === 'remove-one' || systemUserProjectDialog?.kind === 'remove-batch'} title="移除项目关系" onClose={() => { if (!systemUserSubmitting && systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }} footer={<><Button variant="secondary" disabled={systemUserSubmitting} onClick={() => { if (systemUserProjectTarget) setSystemUserProjectDialog({ kind: 'manage', username: systemUserProjectTarget.username }); }}>取消</Button><Button variant="danger" loading={systemUserSubmitting} onClick={() => void confirmSystemUserProjectRemove()}>确认移除</Button></>}><p>确认移除 {systemUserProjectTarget?.display_name} 的 {systemUserProjectDialog?.kind === 'remove-one' ? '1' : systemUserProjectRemoveKeys.length} 个项目关系？目标用户将立即失去对应项目访问和实时订阅。</p>{systemUserError ? <Feedback tone="danger" title="移除失败">{systemUserError}</Feedback> : null}</Modal>
            </section>
    </>
  );
}

/** @param {{ ctx: any }} props */
export function SystemDashboardPage({ ctx }) {
  const { handleNavigate, headingRef, route, systemDashboard } = ctx;
  return (
    <>
            <section className="system-dashboard-page" aria-labelledby="system-dashboard-title">
              <header className="shell-panel-header system-ops-panel-head">
                <div>
                  <h1 id="system-dashboard-title" ref={headingRef} tabIndex={-1}>系统管理</h1>
                  <p className="shell-muted">按当前角色可用的权限进入各管理模块。</p>
                </div>
              </header>
              {systemDashboard?.links.length ? (
                <div className="system-grid">
                  {systemDashboard.links.map((link) => {
                    const path = routePathForOwner(link.path, route.owner);
                    return (
                      <a key={link.id} className="system-card" href={path} onClick={(event) => handleNavigate(event, path, `正在打开${link.title}。`)}>
                        <strong>{link.title}</strong>
                        <span>{link.description}</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <Feedback tone="info" title="暂无可用管理入口">当前角色没有其他系统管理权限。</Feedback>
              )}
            </section>
    </>
  );
}
