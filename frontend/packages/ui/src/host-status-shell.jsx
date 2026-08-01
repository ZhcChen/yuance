// @ts-check

import React from 'react';

/**
 * @param {{ productName: string, hostLabel: string, status: string, title: string, detail: string, context?: string, primaryAction?: { label: string, onClick: () => void }, secondaryAction?: { label: string, onClick: () => void }, actionsDisabled?: boolean }} props
 */
export function HostStatusShell({ productName, hostLabel, status, title, detail, context, primaryAction, secondaryAction, actionsDisabled = false }) {
  return (
    <main className="host-status-shell">
      <header className="host-status-header">
        <div className="host-status-brand-mark" aria-hidden="true">Y</div>
        <div className="host-status-brand-copy">
          <strong>{productName}</strong>
          <span>{hostLabel}</span>
        </div>
      </header>
      <section className="host-status-panel" aria-live="polite">
        <span className={`host-status-indicator host-status-${status}`} aria-hidden="true" />
        <p className="host-status-label">{title}</p>
        <h1>{detail}</h1>
        {context ? <p className="host-status-context">{context}</p> : null}
        {primaryAction || secondaryAction ? (
          <div className="host-status-actions">
            {primaryAction ? <button type="button" disabled={actionsDisabled} onClick={primaryAction.onClick}>{primaryAction.label}</button> : null}
            {secondaryAction ? <button className="host-status-secondary" type="button" disabled={actionsDisabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
