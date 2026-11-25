// @ts-check
/* 页面按需加载：页面模块在首次进入对应路由时下载；路由加载数据时可并行预加载，就绪后同步渲染。 */

import React, { Suspense, lazy, useState } from 'react';

/** 同一模块加载器的结果在所有页面间共享：任一页面预加载后，同模块的其他页面也同步可用。 */
const loadedModules = new Map();
const pendingModules = new Map();

/** @param {() => Promise<Record<string, any>>} loader */
function loadModule(loader) {
  if (!pendingModules.has(loader)) {
    pendingModules.set(loader, loader().then((module) => {
      loadedModules.set(loader, module);
      return module;
    }, (error) => {
      pendingModules.delete(loader);
      throw error;
    }));
  }
  return pendingModules.get(loader);
}

/**
 * @param {() => Promise<Record<string, any>>} loader
 * @param {string} name
 */
export function lazyPage(loader, name) {
  const Page = lazy(() => loadModule(loader).then((module) => ({ default: module[name] })));
  /** @param {any} props */
  function LazyPageBoundary(props) {
    // 渲染形态在首次挂载时确定并保持：避免模块加载完成后从 Suspense 切换到直接渲染导致整页重新挂载。
    const [eager] = useState(() => loadedModules.has(loader));
    const module = eager ? loadedModules.get(loader) : null;
    // 模块已加载：直接渲染，避免 Suspense 在首帧显示加载占位。
    if (module) {
      const Resolved = module[name];
      return <Resolved {...props} />;
    }
    return <Suspense fallback={<div className="yc-lazy-loading" role="status" aria-live="polite">加载中…</div>}><Page {...props} /></Suspense>;
  }
  LazyPageBoundary.displayName = `Lazy(${name})`;
  /** 预加载页面模块；失败时吞掉错误，由渲染时的 lazy 加载再次尝试并报告。 */
  LazyPageBoundary.preload = () => loadModule(loader).then(() => undefined, () => undefined);
  return LazyPageBoundary;
}
