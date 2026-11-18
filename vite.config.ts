/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const MAINTENANCE_PORT = Number(process.env.NETWORTH_MAINTENANCE_PORT ?? 5341);
const tokenFile = path.resolve(import.meta.dirname, 'maintenance/data/.admin-token');
const readToken = (): string | null => {
  try {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  } catch {
    return null;
  }
};

// `base: './'` keeps every asset URL relative, so the build works unchanged on
// GitHub Pages project sites, Cloudflare Pages and any other static host.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5340,
    strictPort: false,
    // Dev-only bridge to the local Tax Maintenance service. The admin token is
    // read from a git-ignored file and added here, server-side, so it never
    // appears in browser code. Production builds have no proxy and no admin UI.
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
  test: {
    globals: true,
    // UI tests opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
  },
});
