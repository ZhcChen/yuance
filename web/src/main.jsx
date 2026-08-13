import React from 'react';
import ReactDOM from 'react-dom/client';
import { APP_UPDATE_CHECK_INTERVAL_MS } from '@yuance/frontend-app-core';
import App from './app.jsx';
import { webApi } from './lib/api.js';
import { createBrowserEvents } from './platform/browser/events.js';
import { createBrowserFilePlatform } from './platform/browser/files.js';
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

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App services={services} />
  </React.StrictMode>,
);
