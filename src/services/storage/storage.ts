import type { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  exportFileSchema,
  savedCalculationSchema,
  settingsSchema,
  type CalcDraft,
  type ExportFile,
  type SavedCalculation,
  type Settings,
} from './models';

/** All persistence is localStorage on the user's own device — there is no server. */

const SETTINGS_KEY = 'networth.settings';
const SAVED_KEY = 'networth.saved';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = store()?.getItem(key);
    if (!raw) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    store()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = (): Settings => {
  try {
    const raw = store()?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // Merge so settings added in later versions get their defaults.
    const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};
export const saveSettings = (s: Settings): boolean => writeJson(SETTINGS_KEY, s);

export const loadSaved = (): SavedCalculation[] => readJson(SAVED_KEY, savedCalculationSchema.array(), []);
export const persistSaved = (list: SavedCalculation[]): boolean => writeJson(SAVED_KEY, list);

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Pure list operations so they are trivially testable. */
export const savedOps = {
  add(list: SavedCalculation[], name: string, draft: CalcDraft, snapshot: SavedCalculation['snapshot'], now = new Date()): SavedCalculation[] {
    const iso = now.toISOString();
    return [{ id: newId(), name: name.trim() || 'Untitled calculation', createdAt: iso, updatedAt: iso, draft, snapshot }, ...list];
  },
  rename(list: SavedCalculation[], id: string, name: string, now = new Date()): SavedCalculation[] {
    const clean = name.trim();
    if (!clean) return list;
    return list.map((c) => (c.id === id ? { ...c, name: clean, updatedAt: now.toISOString() } : c));
  },
  remove(list: SavedCalculation[], id: string): SavedCalculation[] {
    return list.filter((c) => c.id !== id);
  },
  duplicate(list: SavedCalculation[], id: string, now = new Date()): SavedCalculation[] {
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return list;
    const iso = now.toISOString();
    const copy: SavedCalculation = { ...structuredClone(list[i]), id: newId(), name: `${list[i].name} (copy)`, createdAt: iso, updatedAt: iso };
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  },
  export(list: SavedCalculation[], now = new Date()): ExportFile {
    return { app: 'networth', formatVersion: 1, exportedAt: now.toISOString(), calculations: list };
  },
  /** Validates an export file and merges it; entries whose id already exists get a fresh id. */
  import(list: SavedCalculation[], json: string): { list: SavedCalculation[]; imported: number } {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    const parsed = exportFileSchema.safeParse(data);
    if (!parsed.success) throw new Error('That file is not a NetWorth export, or it is damaged.');
    const ids = new Set(list.map((c) => c.id));
    const incoming = parsed.data.calculations.map((c) => (ids.has(c.id) ? { ...c, id: newId() } : c));
    return { list: [...incoming, ...list], imported: incoming.length };
  },
};
