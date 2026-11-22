import { changeId, loadProposals, saveProposals } from './checker';
import { isoNow, makeId, type MaintenanceContext } from './context';
import { getByPath, sameValue } from './paths';
import { readDataset, readRegistryFile } from './registryAccess';
import type { Proposal } from './types';

export interface ManualChangeInput {
  country: string;
  taxYear: number;
  rulePath: string;
  value: number | string | boolean;
  sourceUrl: string;
  reason: string;
}

/**
 * A value typed in by the maintainer. It never edits a dataset directly: it becomes a
 * pending proposal and goes through exactly the same review → validate → test →
 * approve pipeline as a change detected on an official website.
 */
export function proposeManualChange(ctx: MaintenanceContext, input: ManualChangeInput): Proposal {
  const reg = readRegistryFile(ctx);
  const entry = reg.countries[input.country];
  if (!entry) throw new Error(`Unknown country ${input.country}.`);
  const version = entry.active[String(input.taxYear)];
  if (!version) throw new Error(`${input.country} has no active dataset for ${input.taxYear}. Create the year from the Update Center first.`);
  const dataset = readDataset(ctx, input.country, version);
  const existing = getByPath(dataset.rules, input.rulePath);
  if (existing === undefined) throw new Error(`Rule path "${input.rulePath}" does not exist in ${input.country} ${version}.`);
  if (existing !== null && typeof existing === 'object') throw new Error(`"${input.rulePath}" is a group of values; choose a single value inside it.`);
  if (existing !== null && typeof existing !== typeof input.value) throw new Error(`"${input.rulePath}" holds a ${typeof existing}; the new value must be a ${typeof existing} too.`);
  if (sameValue(existing, input.value)) throw new Error('The new value is the same as the current one.');

  const now = isoNow(ctx);
  const base = { country: input.country, rulePath: input.rulePath, sourceId: 'manual', taxYear: input.taxYear, proposedValue: input.value, kind: 'modification' as const };
  const proposal: Proposal = {
    ...base,
    id: changeId(base),
    category: 'Manual edit',
    existingValue: existing,
    effectiveDate: `${input.taxYear}-01-01`,
    sourceUrl: input.sourceUrl,
    publicationDate: null,
    explanation: `Manual edit of ${input.rulePath} in ${input.country} ${version}: ${input.reason}`,
    confidence: 'extracted-value',
    affectsExistingCalculations: true,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    runId: makeId('manual', ctx),
    note: null,
    resultVersion: null,
    validation: null,
  };
  const proposals = loadProposals(ctx);
  if (proposals.some((p) => p.id === proposal.id && p.status === 'pending')) throw new Error('An identical manual change is already waiting for review.');
  saveProposals(ctx, [...proposals.filter((p) => p.id !== proposal.id), proposal]);
  return proposal;
}
