// Builds the site exactly as GitHub Pages serves it (under /<repo>/), for local previews
// and the end-to-end tests: `npm run build:pages`, then `npx vite preview --base /netWorth/`.
// CI uses `npm run build` with BASE_PATH and SITE_URL from actions/configure-pages instead.
import { execSync } from 'node:child_process';

const env = { ...process.env, BASE_PATH: process.env.BASE_PATH ?? '/netWorth/', SITE_URL: process.env.SITE_URL ?? 'https://christosdurro.github.io/netWorth' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });
run('npx vite build');
run('npx vite build --ssr src/entry-server.tsx --outDir dist-ssr');
run('node scripts/prerender.mjs');
