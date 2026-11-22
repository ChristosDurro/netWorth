import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Private tax-administration tool — local development server only, never built or
 * deployed. It talks to the maintenance service (maintenance/server.ts) on
 * 127.0.0.1 through this dev proxy, which adds the admin token server-side so the
 * token never reaches browser code.
 */
const repo = path.resolve(import.meta.dirname, '..', '..');
const MAINTENANCE_PORT = Number(process.env.NETWORTH_MAINTENANCE_PORT ?? 5341);
const tokenFile = path.join(repo, 'maintenance/data/.admin-token');
const readToken = (): string | null => {
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return null;
  }
};

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5342,
    strictPort: true,
    fs: { allow: [repo] },
    proxy: {
      '/admin-api': {
        target: `http://127.0.0.1:${MAINTENANCE_PORT}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            const token = readToken();
            if (token) req.setHeader('x-networth-admin-token', token);
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
