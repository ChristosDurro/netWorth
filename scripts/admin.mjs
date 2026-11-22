// Starts the private tax-administration tool: `npm run admin`.
//   maintenance service  http://127.0.0.1:5341  (token-protected API, local only)
//   admin interface      http://127.0.0.1:5342  (separate app in tools/tax-admin, never deployed)
import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const procs = [
  spawn('npx', ['tsx', 'maintenance/server.ts'], { stdio: 'inherit', shell }),
  spawn('npx', ['vite', '--config', 'tools/tax-admin/vite.config.ts'], { stdio: 'inherit', shell }),
];
console.log('\n  NetWorth tax administration → http://127.0.0.1:5342\n');
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && code !== 0 && stop());
