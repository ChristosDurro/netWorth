import fs from 'node:fs';
import path from 'node:path';
import { countryModules } from '../countries';
import { TaxRegistry } from '../engine/registry';
import type { CountryModule } from '../engine/types';

/** Reads tax-data/ from disk. Used by tests and the maintenance engine (never by the browser bundle). */
export function readTaxData(root: string): { registry: unknown; datasets: unknown[] } {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
  const datasets: unknown[] = [];
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(root, dir.name))) {
      if (/^\d{4}\.\d+\.json$/.test(file)) datasets.push(JSON.parse(fs.readFileSync(path.join(root, dir.name, file), 'utf8')));
    }
  }
  return { registry, datasets };
}

export function loadRegistryFromDisk(root = path.resolve(process.cwd(), 'tax-data'), modules: CountryModule[] = countryModules): TaxRegistry {
  const { registry, datasets } = readTaxData(root);
  return new TaxRegistry(modules, registry, datasets);
}
