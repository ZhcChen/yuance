import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.YUANCE_WEB_PROXY_TARGET || 'http://127.0.0.1:33033';

export default defineConfig({
  base: '/web/app/',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': proxyTarget,
      '/web/login': proxyTarget,
      '/web/messages': proxyTarget,
      '/web/work-items': proxyTarget,
      '/version.json': proxyTarget,
      '/static': proxyTarget,
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
