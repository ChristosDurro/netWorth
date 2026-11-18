import fs from 'node:fs';
import path from 'node:path';
import { countryModules } from '../../src/countries';
import { readTaxData } from '../../src/data/nodeLoader';
import { TaxRegistry } from '../../src/engine/registry';
import { registrySchema } from '../../src/engine/schema';
import type { CountryModule, RegistryFile, TaxDataset } from '../../src/engine/types';
import { paths, writeJsonFile, type MaintenanceContext } from './context';

export function loadRegistry(ctx: MaintenanceContext, modules: CountryModule[] = countryModules): TaxRegistry {
  const { registry, datasets } = readTaxData(ctx.taxDataDir);
  return new TaxRegistry(modules, registry, datasets);
}

export function readRegistryFile(ctx: MaintenanceContext): RegistryFile {
  return registrySchema.parse(JSON.parse(fs.readFileSync(paths(ctx).registry, 'utf8')));
}

export function writeRegistryFile(ctx: MaintenanceContext, reg: RegistryFile): void {
  writeJsonFile(paths(ctx).registry, registrySchema.parse(reg));
}

export function datasetFile(ctx: MaintenanceContext, country: string, version: string): string {
  if (!/^[A-Z]{2}$/.test(country) || !/^\d{4}\.\d+$/.test(version)) throw new Error('Invalid country or version identifier.');
  return path.join(ctx.taxDataDir, country, `${version}.json`);
}

export function readDataset(ctx: MaintenanceContext, country: string, version: string): TaxDataset {
  return JSON.parse(fs.readFileSync(datasetFile(ctx, country, version), 'utf8')) as TaxDataset;
}

/** Latest tax year with an active dataset, or null for countries without data. */
export function latestActiveYear(reg: RegistryFile, country: string): number | null {
  const years = Object.keys(reg.countries[country]?.active ?? {}).map(Number);
  return years.length ? Math.max(...years) : null;
}

export function allVersions(ctx: MaintenanceContext, country: string): string[] {
  const dir = path.join(ctx.taxDataDir, country);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}\.\d+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ''));
}
