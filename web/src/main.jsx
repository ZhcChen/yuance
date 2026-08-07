import React from 'react';
import ReactDOM from 'react-dom/client';
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
    getElementById: (id) => document.getElementById(id),
    readFormValue: (form, name) => String(new FormData(form).get(name) || ''),
    readTheme: () => localStorage.getItem('yuance-theme') === 'dark' ? 'dark' : 'light',
    writeTheme: (theme) => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('yuance-theme', theme);
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
