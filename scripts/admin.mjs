// Starts the local Tax Maintenance service and the web app together: `npm run admin`.
import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const procs = [
  spawn('npx', ['tsx', 'maintenance/server.ts'], { stdio: 'inherit', shell }),
  spawn('npx', ['vite', '--port', '5340'], { stdio: 'inherit', shell }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && code !== 0 && stop());
