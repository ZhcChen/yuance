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

export function ProjectResourceDetailSkeleton() {
  return (
    <div className="resource-detail-skeleton" role="region" aria-busy="true" aria-label="正在加载资料详情">
      <p className="shell-live-region" role="status" aria-live="polite">正在加载资料详情。</p>
      <div className="resource-detail-skeleton-header" aria-hidden="true">
        <div className="resource-detail-skeleton-context">
          <span className="app-skeleton-block resource-detail-skeleton-back" />
          <span className="app-skeleton-block resource-detail-skeleton-meta" />
        </div>
        <div className="resource-detail-skeleton-actions">
          <span className="app-skeleton-block resource-detail-skeleton-action" />
          <span className="app-skeleton-block resource-detail-skeleton-action" />
        </div>
      </div>
      <span className="app-skeleton-block resource-detail-skeleton-title" aria-hidden="true" />
      <div className="project-tabs-card resource-content-card resource-detail-skeleton-content" aria-hidden="true">
        <div className="resource-detail-skeleton-toc">
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
          <span className="app-skeleton-block resource-detail-skeleton-toc-line" />
        </div>
        <div className="resource-detail-skeleton-body">
          <span className="app-skeleton-block resource-detail-skeleton-heading" />
          <span className="app-skeleton-block resource-detail-skeleton-line" />
          <span className="app-skeleton-block resource-detail-skeleton-line" />
          <span className="app-skeleton-block resource-detail-skeleton-line resource-detail-skeleton-line-short" />
          <span className="app-skeleton-block resource-detail-skeleton-subheading" />
          <span className="app-skeleton-block resource-detail-skeleton-table" />
          <span className="app-skeleton-block resource-detail-skeleton-line" />
          <span className="app-skeleton-block resource-detail-skeleton-line resource-detail-skeleton-line-medium" />
          <span className="app-skeleton-block resource-detail-skeleton-subheading" />
          <span className="app-skeleton-block resource-detail-skeleton-line" />
          <span className="app-skeleton-block resource-detail-skeleton-line resource-detail-skeleton-line-short" />
        </div>
      </div>
    </div>
  );
}
