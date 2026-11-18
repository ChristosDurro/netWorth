import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGolden, type GoldenFile } from '../../maintenance/engine/validate';
import { reg } from './helpers';

/**
 * Regression lock: the results of every approved dataset version, recorded when
 * it was approved. A failure means a code or data change altered results that
 * users may have saved — this must be deliberate, never accidental.
 */
const golden = JSON.parse(fs.readFileSync('tests/tax/golden.json', 'utf8')) as GoldenFile;

describe('golden regression cases', () => {
  it('covers every active dataset', () => {
    for (const [code, e] of Object.entries(reg.registry.countries)) {
      for (const v of Object.values(e.active)) expect(golden.cases.some((c) => c.country === code && c.version === v)).toBe(true);
    }
  });
  it('all recorded results are reproduced exactly', () => {
    const r = checkGolden(reg, golden.cases);
    expect(r.failures).toEqual([]);
    expect(r.checked).toBeGreaterThan(50);
  });
});
