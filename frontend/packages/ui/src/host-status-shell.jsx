// @ts-check

import React from 'react';

/**
 * @param {{ productName: string, hostLabel: string, status: string, title: string, detail: string }} props
 */
export function HostStatusShell({ productName, hostLabel, status, title, detail }) {
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
      </section>
    </main>
  );
}
