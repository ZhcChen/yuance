// @ts-check

/**
 * 会话恢复阶段的全局应用外壳骨架屏。
 * 视觉部分对辅助技术隐藏，只保留一条礼貌的恢复状态提示。
 */
export function AppShellSkeleton() {
  return (
    <div className="app-shell app-shell-skeleton" aria-busy="true">
      <p className="shell-live-region" role="status" aria-live="polite">正在恢复当前会话，正在加载用户、项目上下文和消息状态。</p>
      <div className="app-skeleton-nav" aria-hidden="true">
        <div className="app-skeleton-nav-brand">
          <span className="app-skeleton-block app-skeleton-mark" />
          <span className="app-skeleton-block app-skeleton-name" />
        </div>
        <div className="app-skeleton-nav-links">
          <span className="app-skeleton-block" />
          <span className="app-skeleton-block" />
          <span className="app-skeleton-block" />
          <span className="app-skeleton-block" />
        </div>
        <div className="app-skeleton-nav-tools">
          <span className="app-skeleton-block app-skeleton-search" />
          <span className="app-skeleton-block app-skeleton-avatar" />
        </div>
      </div>
      <div className="app-skeleton-main" aria-hidden="true">
        <div className="app-skeleton-content">
          <div className="app-skeleton-hero">
            <div className="app-skeleton-hero-copy">
              <span className="app-skeleton-block app-skeleton-eyebrow" />
              <span className="app-skeleton-block app-skeleton-title" />
              <span className="app-skeleton-block app-skeleton-subtitle" />
            </div>
            <span className="app-skeleton-block app-skeleton-action" />
          </div>
          <div className="app-skeleton-grid">
            <section className="app-skeleton-card">
              <span className="app-skeleton-block app-skeleton-card-title" />
              <span className="app-skeleton-block app-skeleton-card-line" />
              <span className="app-skeleton-block app-skeleton-card-line" />
              <span className="app-skeleton-block app-skeleton-card-line" />
            </section>
            <section className="app-skeleton-card">
              <span className="app-skeleton-block app-skeleton-card-title" />
              <span className="app-skeleton-block app-skeleton-card-line" />
              <span className="app-skeleton-block app-skeleton-card-line" />
              <span className="app-skeleton-block app-skeleton-card-line" />
            </section>
            <section className="app-skeleton-card app-skeleton-card-wide">
              <span className="app-skeleton-block app-skeleton-card-title" />
              <div className="app-skeleton-table">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
