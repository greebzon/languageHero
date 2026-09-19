import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the API under /admin/ in production; in dev the proxy keeps the panel and the API
// on one origin, so the session cookie and the Origin check work without CORS.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/v1': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
