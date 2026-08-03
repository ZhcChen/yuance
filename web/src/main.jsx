import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app.jsx';
import { webApi } from './lib/api.js';
import { createBrowserEvents } from './platform/browser/events.js';
import { createBrowserFilePlatform } from './platform/browser/files.js';
import { createBrowserRouter } from './platform/browser/router.js';
import './app.css';

const rootElement = document.getElementById('root');

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
  },
};

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App services={services} />
  </React.StrictMode>,
);
