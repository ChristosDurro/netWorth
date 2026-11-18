/** Dot-path helpers for dataset rules ("bracketTax.2.rate"). */

export function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Returns a deep copy with `path` set; throws if the path does not already exist (no silent new fields). */
export function setByPath<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as unknown;
  const keys = path.split('.');
  let cur = copy as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    if (next === null || typeof next !== 'object') throw new Error(`Rule path "${path}" does not exist in the dataset.`);
    cur = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (!(last in cur)) throw new Error(`Rule path "${path}" does not exist in the dataset.`);
  cur[last] = value;
  return copy as T;
}

export const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return JSON.stringify(a) === JSON.stringify(b);
};
