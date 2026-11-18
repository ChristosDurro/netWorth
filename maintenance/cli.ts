/**
 * Command-line entry points (used locally and by GitHub Actions):
 *   npm run tax:check            check every official source, write a report and proposals
 *   npm run tax:check -- DK SE   check only some countries
 *   npm run tax:status           summary of datasets, pending reviews and failing sources
 *   npm run tax:golden           regenerate golden regression cases for the active datasets
 */
import fs from 'node:fs';
import { loadProposals, runCheck } from './engine/checker';
import { defaultContext } from './engine/defaultContext';
import { countryOverview } from './engine/scaffold';
import { goldenCasesFor, writeGolden } from './engine/validate';
import { loadRegistry } from './engine/registryAccess';

const [cmd, ...args] = process.argv.slice(2);
const ctx = defaultContext();

async function main() {
  if (cmd === 'check') {
    const record = await runCheck(ctx, { countries: args.length ? args.map((a) => a.toUpperCase()) : undefined });
    const pending = loadProposals(ctx).filter((p) => p.status === 'pending' || p.status === 'research');
    const md = [
      `## Tax source check — ${record.finishedAt?.slice(0, 16).replace('T', ' ')} UTC`,
      '',
      record.summary,
      '',
      '| Source | Result |',
      '|---|---|',
      ...(record.results ?? []).map((r) => `| ${r.sourceId} | ${r.ok ? r.classification : `**unavailable** — ${r.error}`} |`),
      '',
      `### Open items (${pending.length})`,
      ...pending.map((p) => `- **${p.country}** ${p.kind}${p.taxYear ? ` (${p.taxYear})` : ''}: ${p.explanation}`),
    ].join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    fs.writeFileSync(`${ctx.maintDir}/data/last-check.md`, md + '\n');
    console.log(md);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_items=${record.proposalsCreated.length}\nfailed_sources=${record.sourcesFailed.length}\n`);
  } else if (cmd === 'status') {
    for (const c of countryOverview(ctx)) {
      console.log(`${c.code} ${c.name.padEnd(14)} ${c.status.padEnd(18)} active=${JSON.stringify(c.active)} lastCheck=${c.lastSuccessfulCheck ?? 'never'} failing=${c.failingSources.length}`);
    }
    const p = loadProposals(ctx);
    console.log(`Proposals: ${p.filter((x) => x.status === 'pending').length} pending, ${p.filter((x) => x.status === 'research').length} research, ${p.length} total`);
  } else if (cmd === 'golden') {
    const reg = loadRegistry(ctx);
    const cases = Object.entries(reg.registry.countries).flatMap(([code, e]) => Object.entries(e.active).flatMap(([y, v]) => goldenCasesFor(reg, code, Number(y), v)));
    writeGolden(ctx, { note: 'Regression lock: outputs of each dataset version at the time it was approved. Independent reference values live in tests/tax/*.test.ts.', cases });
    console.log(`Wrote ${cases.length} golden cases.`);
  } else {
    console.log('Usage: tsx maintenance/cli.ts <check|status|golden> [country codes]');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
