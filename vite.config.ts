/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Public website. Pages use real paths (/calculator, /countries/denmark …) and are
 * pre-rendered to static HTML by scripts/prerender.mjs, so the site works on any
 * static host. BASE_PATH is the folder the site is served from: "/" locally and on
 * a custom domain, "/<repo>/" for a GitHub Pages project site.
 *
 * The private tax-administration tool has its own config in tools/tax-admin/ and is
 * never part of this build.
 */
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { port: 5340, strictPort: false },
  preview: { port: 5350 },
  build: { chunkSizeWarningLimit: 700 },
  test: {
    globals: true,
    // UI tests opt into jsdom with a `// @vitest-environment jsdom` header.
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
  },
});
