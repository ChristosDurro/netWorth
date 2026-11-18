import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MaintenanceContext } from './context';
import { vitestRunner } from './validate';

const exec = promisify(execFile);

/** Commits only the given paths with the local git identity; never pushes, never touches credentials. */
export function gitCommitter(root: string): MaintenanceContext['git'] {
  return {
    async commit(message, files) {
      await exec('git', ['add', '--', ...files], { cwd: root });
      const { stdout: staged } = await exec('git', ['diff', '--cached', '--name-only'], { cwd: root });
      if (!staged.trim()) return 'nothing to commit';
      await exec('git', ['commit', '-m', message, '--', ...files], { cwd: root });
      const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: root });
      return stdout.trim();
    },
  };
}

export function defaultContext(root = path.resolve(import.meta.dirname, '..', '..'), opts: { commit?: boolean } = {}): MaintenanceContext {
  return {
    root,
    taxDataDir: path.join(root, 'tax-data'),
    maintDir: path.join(root, 'maintenance'),
    fetch: globalThis.fetch,
    now: () => new Date(),
    runTests: vitestRunner(root),
    git: opts.commit ? gitCommitter(root) : null,
    hostDelayMs: 1500,
    log: (m) => console.log(`[maintenance] ${m}`),
  };
}
