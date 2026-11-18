import type { CountryModule } from '../engine/types';
import { denmark } from './dk';
import { germany } from './de';
import { netherlands } from './nl';
import { sweden } from './se';
import { norway } from './no';
import { greece } from './gr';
// <networth:country-imports> — the maintenance engine adds scaffolded countries below this line
// </networth:country-imports>

/**
 * Every registered country module. The calculator, comparison view and
 * maintenance engine discover countries exclusively through this list and
 * tax-data/registry.json — adding a country never requires UI changes.
 */
export const countryModules: CountryModule[] = [
  denmark,
  germany,
  netherlands,
  sweden,
  norway,
  greece,
  // <networth:country-list>
  // </networth:country-list>
] as CountryModule[];
