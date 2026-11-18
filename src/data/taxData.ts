import { countryModules } from '../countries';
import { TaxRegistry } from '../engine/registry';
import registryJson from '../../tax-data/registry.json';

// Every dataset version is bundled so saved calculations keep resolving the
// exact rules they were made with, even after newer versions are published.
const files = import.meta.glob('../../tax-data/*/*.json', { eager: true, import: 'default' });
const datasets = Object.entries(files)
  .filter(([file]) => /\/\d{4}\.\d+\.json$/.test(file))
  .map(([, data]) => data);

export const taxRegistry = new TaxRegistry(countryModules, registryJson, datasets);
