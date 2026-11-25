import React from 'react';
import ReactDOM from 'react-dom/client';
import { APP_UPDATE_CHECK_INTERVAL_MS } from '@yuance/frontend-app-core';
import App from './app.jsx';
import { webApi } from './lib/api.js';
import { createBrowserEvents } from './platform/browser/events.js';
import { createBrowserFilePlatform } from './platform/browser/files.js';
import {
  mountBrowserDocumentViewer,
  resolveBrowserPreviewSource,
} from './platform/browser/document-viewer.js';
import { createBrowserRouter } from './platform/browser/router.js';
import './app.css';

const rootElement = document.getElementById('root');
const DATABASE_STATS_CACHE_PREFIX = 'yuance:database-stats:v1:';

if (!rootElement) {
  throw new Error('缺少 #root 挂载点');
}

const services = {
  api: webApi,
  events: createBrowserEvents(),
  files: createBrowserFilePlatform({ refreshCsrfToken: webApi.refreshCsrfToken }),
  documentViewer: mountBrowserDocumentViewer,
  previewSourceResolver: resolveBrowserPreviewSource,
  router: createBrowserRouter(),
  runtime: {
    scheduleFrame: (callback) => window.requestAnimationFrame(callback),
    observeResize: (elements, callback) => {
      const observer = new ResizeObserver(callback);
      elements.forEach((element) => observer.observe(element));
      return () => observer.disconnect();
    },
    getElementById: (id) => document.getElementById(id),
    readFormValue: (form, name) => String(new FormData(form).get(name) || ''),
    createSessionId: () => `web:${crypto.randomUUID()}`,
    readTheme: () => localStorage.getItem('yuance-theme') === 'dark' ? 'dark' : 'light',
    writeTheme: (theme) => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('yuance-theme', theme);
    },
    readAppReleaseVersion: () => {
      const value = /** @type {Record<string, unknown>} */ (globalThis).__YUANCE_APP_RELEASE_VERSION__;
      if (typeof value !== 'string') return '';
      return value.startsWith('__YUANCE_') ? '' : value.trim();
    },
    openAppUpdateManifest: async () => {
      const response = await fetch('/version.json', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return null;
      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    reloadPage: () => window.location.reload(),
    subscribeAppUpdateChecks: (check) => {
      const onFocus = () => check();
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') check();
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibilityChange);
      const interval = setInterval(check, APP_UPDATE_CHECK_INTERVAL_MS);
      const initial = setTimeout(check, 0);
      return () => {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        clearInterval(interval);
        clearTimeout(initial);
      };
    },
    readDatabaseStatsCache: async (username) => {
      try {
        const value = JSON.parse(localStorage.getItem(`${DATABASE_STATS_CACHE_PREFIX}${username}`) || 'null');
        return value && typeof value === 'object' && Array.isArray(value.tables) ? value : null;
      } catch (_error) {
        return null;
      }
    },
    writeDatabaseStatsCache: async (username, snapshot) => {
      try { localStorage.setItem(`${DATABASE_STATS_CACHE_PREFIX}${username}`, JSON.stringify(snapshot)); } catch (_error) {
        // Cache persistence is best-effort; a fresh snapshot remains usable in memory.
      }
    },
  },
};

services.runtime.writeTheme(services.runtime.readTheme());

// 发布后旧标签页按需加载的代码块已不存在：首次失败时自动刷新一次拿到新版本，
// 60 秒内不重复刷新，避免网络故障时循环刷新（之后由根部错误边界提示）。
const CHUNK_RELOAD_KEY = 'yuance.chunk-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  let lastReload = 0;
  try { lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0); } catch (_error) { lastReload = 0; }
  if (Date.now() - lastReload < 60_000) return;
  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch (_error) {
    // 无法记录时仍刷新一次；下次失败将交给错误边界。
  }
  event.preventDefault();
  window.location.reload();
});

/** 根部错误边界：渲染异常（如代码块加载失败）时提示刷新，而不是整页白屏。 */
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('应用渲染失败', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-crash" role="alert">
        <h1>页面已更新或加载失败</h1>
        <p>请刷新页面后重试。</p>
        <button type="button" className="yc-button yc-button-primary" onClick={() => window.location.reload()}>刷新页面</button>
      </main>
    );
  }
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App services={services} />
    </RootErrorBoundary>
  </React.StrictMode>,
);
