/**
 * Local Tax Maintenance service. Run with `npm run maintenance` (or `npm run admin`
 * to start it together with the web app). Listens on 127.0.0.1 only.
 */
import http from 'node:http';
import { createApi, ensureToken } from './engine/api';
import { defaultContext } from './engine/defaultContext';
import { loadState } from './engine/checker';

export const MAINTENANCE_PORT = Number(process.env.NETWORTH_MAINTENANCE_PORT ?? 5341);

const base = defaultContext();
const ctx = { ...base, git: loadState(base).settings.commitOnApprove ? defaultContext(base.root, { commit: true }).git : null };
const token = ensureToken(ctx);
const api = createApi(ctx, { token, port: MAINTENANCE_PORT });

const server = http.createServer((req, res) => void api.handle(req, res));
server.listen(MAINTENANCE_PORT, '127.0.0.1', () => {
  console.log(`[maintenance] Tax Maintenance service on http://127.0.0.1:${MAINTENANCE_PORT} (local only)`);
  console.log('[maintenance] Open the Update Center at http://localhost:5340/#/admin');
});

// Monthly automatic check (if enabled in the Update Center): evaluated hourly.
setTimeout(() => api.maybeRunScheduled() && console.log('[maintenance] Scheduled monthly check started'), 5_000);
setInterval(() => api.maybeRunScheduled() && console.log('[maintenance] Scheduled monthly check started'), 60 * 60 * 1000).unref();
