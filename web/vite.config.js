import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.YUANCE_WEB_PROXY_TARGET || 'http://127.0.0.1:33033';

function localDevelopmentProxy() {
  return {
    target: proxyTarget,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyRes', (response) => {
        const cookies = response.headers['set-cookie'];
        if (!cookies) return;
        response.headers['set-cookie'] = cookies.map((cookie) => cookie.replace(/;\s*Secure(?=;|$)/giu, ''));
      });
    },
  };
}

function devWebBaseRedirect() {
  return {
    name: 'yuance-dev-web-base-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/web' || pathname === '/web/' || pathname === '/web/app') {
          res.statusCode = 302;
          res.setHeader('Location', '/web/app/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/web/app/',
  plugins: [devWebBaseRedirect(), react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': localDevelopmentProxy(),
      '/web/login': localDevelopmentProxy(),
      '/web/messages': localDevelopmentProxy(),
      '/web/work-items': localDevelopmentProxy(),
      '/version.json': localDevelopmentProxy(),
      '/favicon.ico': localDevelopmentProxy(),
      '/static': localDevelopmentProxy(),
      '/web/app/favicon.ico': {
        ...localDevelopmentProxy(),
        rewrite: (path) => path.replace(/^\/web\/app\/favicon\.ico$/u, '/favicon.ico'),
      },
      '/web/app/static': {
        ...localDevelopmentProxy(),
        rewrite: (path) => path.replace(/^\/web\/app\/static/u, '/static'),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: 'dist',
    manifest: 'manifest.json',
    emptyOutDir: true,
  },
});
