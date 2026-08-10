// @ts-check

import React from 'react';

/**
 * @param {{ productName: string, hostLabel: string, status: string, title: string, detail: string, description?: string, context?: string, primaryAction?: { label: string, onClick: () => void }, secondaryAction?: { label: string, onClick: () => void }, actionsDisabled?: boolean }} props
 */
export function HostStatusShell({ productName, hostLabel, status, title, detail, description, context, primaryAction, secondaryAction, actionsDisabled = false }) {
  const authorizationActive = ['starting', 'unauthenticated', 'authorizing'].includes(status);
  const connectionActive = ['authenticated', 'locked', 'reauthorization_required', 'fatal'].includes(status);

  return (
    <main className="host-status-shell">
      <div className="host-status-workspace">
        <aside className="host-status-guide" aria-label="设备连接进度">
          <div>
            <p className="host-status-kicker">SECURE DESKTOP</p>
            <h2>设备连接</h2>
            <p className="host-status-guide-copy">通过浏览器确认身份后，桌面端将建立独立的设备会话。</p>
          </div>
          <ol className="host-status-steps">
            <li className={authorizationActive ? 'is-active' : 'is-complete'}>
              <span aria-hidden="true">01</span>
              <div><strong>浏览器授权</strong><small>确认当前设备</small></div>
            </li>
            <li className={connectionActive ? 'is-active' : authorizationActive ? '' : 'is-complete'}>
              <span aria-hidden="true">02</span>
              <div><strong>安全连接</strong><small>建立设备会话</small></div>
            </li>
            <li className={!authorizationActive && !connectionActive ? 'is-active' : ''}>
              <span aria-hidden="true">03</span>
              <div><strong>进入工作台</strong><small>同步项目数据</small></div>
            </li>
          </ol>
          <p className="host-status-guide-foot">{productName} / {hostLabel}</p>
        </aside>
        <section className="host-status-panel" aria-live="polite">
          <div className="host-status-content">
            <div className="host-status-state">
              <span className={`host-status-indicator host-status-${status}`} aria-hidden="true" />
              <span>{title}</span>
            </div>
            <h1>{detail}</h1>
            {description ? <p className="host-status-description">{description}</p> : null}
            {context ? <p className="host-status-context">{context}</p> : null}
          </div>
          {primaryAction || secondaryAction ? (
            <div className="host-status-actions">
              {primaryAction ? <button type="button" disabled={actionsDisabled} onClick={primaryAction.onClick}>{primaryAction.label}</button> : null}
              {secondaryAction ? <button className="host-status-secondary" type="button" disabled={actionsDisabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
