# Tax Regulation Update Center

A local maintenance system that watches official tax sources, detects changes, prepares reviewed updates and keeps a complete version history — without ever letting an unverified change reach the calculator.

## What it really does (and what it does not)

| It does | It does not |
|---|---|
| Fetch every registered official source (APIs, HTML pages, PDFs, RSS), politely and respecting robots.txt and crawl delays | Interpret legislation with AI or guess values |
| Read specific values from official pages with **value probes** and compare them with the dataset for the year the page describes | Treat a changed web page as a changed tax rule |
| Re-calculate reference salaries with the **official BMF calculator** and compare with NetWorth | Apply announced future rules to the current year |
| Compare **every municipality** with Statistics Denmark and Skatteverket open data | Publish anything without your approval and passing tests |
| Detect new publications (next year's page appearing, new feed items) | Treat a failed retrieval as "no change" |

## Running it

```bash
npm run admin
```

Then open http://localhost:5340/#/admin. The service listens on `127.0.0.1:5341` only.

**Security:** the service requires a random admin token (created in the git-ignored `maintenance/data/.admin-token`). The Vite dev proxy adds it to requests server-side, so it never appears in browser code. Requests with a non-local `Host` (DNS rebinding) or a cross-site `Origin` are refused, inputs are validated, bodies are size-limited. The production build contains neither the admin page nor any route to the service.

## One-click check

**Check for Tax Updates** runs every enabled source of every registered country and shows progress live. For each source:

1. Fetch (respecting robots.txt, crawl-delay, 1.5 s minimum gap per host, one retry on 5xx).
2. Normalise to text (scripts, navigation and page chrome removed) and hash the full text and the tax-relevant lines separately.
3. Classify: `first-snapshot`, `unchanged`, `unrelated-change` (page changed, relevant lines did not), `relevant-change`, `unavailable`, `blocked-by-robots`.
4. Read the tax year the page describes (`yearPattern`) and run the value probes against that year's dataset.
5. Look for next year's publication (`yearUrl`, API table metadata, BMF interface for next year).
6. Create structured change records: country, category, rule path, existing value, proposed value, tax year, effective date, source URL, publication date, explanation, confidence and whether existing calculations are affected.

Change kinds: **modification** (value of an effective year differs), **new-regulation** (a year without data), **future-regulation** (effective after today — stored for that year only), **informational** (relevant text changed or new publication, no value extracted), **calculation-mismatch** (official calculator disagrees).

The same change detected again is not duplicated. Failed sources are listed separately and the report states that those countries are **not** confirmed unchanged.

## Reviewing

Each proposal shows the current and proposed rule, explanation, source link, effective date, affected module/rule path, previous versions and — after an approval attempt — the validation results. Actions: **Approve**, **Reject**, **Mark for research**, **Open official source**, **Previous versions**. Several proposals can be approved together; they become one new version per country and tax year.

## What approval does

1. Builds a candidate dataset: the active version for that year (or, for a new year, the latest earlier year — then marked **incomplete** with every carried-over value listed as unverified).
2. Validates: metadata and rule schema, behavioural invariants (net never falls as gross rises, no negative or non-finite values), and **all golden regression cases** of every other country and version.
3. Writes the new immutable version file, activates it, runs the automated tax test suite.
4. If anything fails: the file is removed and the previous registry restored — the old dataset stays active.
5. On success: records new golden regression cases for the new version, logs the run, and optionally creates a local git commit.

**Rollback:** expand a country and *Restore this version*. Tests run first; versions are never deleted.

## Versioning

`tax-data/<CC>/<taxYear>.<revision>.json`, e.g. `DK/2026.1`, `DK/2026.2`, `DK/2027.1`. Each file has its own metadata (country, year, version, created, effective, approved, sources, description, previous version, verification status). `tax-data/registry.json` says which version is active per year. Saved calculations remember their version and keep working after newer data is published.

## Adding a country

See [ADDING_A_COUNTRY.md](ADDING_A_COUNTRY.md). The Update Center's **Add country** registers the official authority from `maintenance/config/catalog.json`, discovers candidate pages on that authority's own domain, scaffolds the module, a draft dataset with **empty** values and a research checklist, a test file and `docs/countries/<CC>.md`. The country stays *Under Development* (not in the calculator) until a dataset is created from the completed draft and **Publish** succeeds.

## History

Every check, approval, rejection, research flag, rollback, country addition and publication is stored in `maintenance/data/history/` with countries checked, sources succeeded/failed, changes, approvals, rejections, tests and final status. Each report can be exported as JSON.

## Monthly maintenance

- **Local:** enable *Automatic monthly check* (runs once a month on/after the chosen day while the service is running).
- **Unattended:** `.github/workflows/tax-check.yml` runs `npm run tax:check` on the 1st of every month (and on demand), commits updated source snapshots and proposals to a branch and opens a pull request when something needs review. Approve locally, then merge.

## Two operating modes

1. **Local maintenance mode** — `npm run admin`: check, review, approve, roll back, add countries. Approved data is written to `tax-data/` (optionally committed).
2. **Production mode** — the public site is static and can never modify its own data. Publishing approved data = commit → push → the deploy workflow rebuilds the site. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Adding or fixing a monitored source

Edit `scripts/make-sources.mjs` and run `node scripts/make-sources.mjs`. Probes are regular expressions with a named group `value` matched against the normalised page text; use `npx tsx scripts/dump-sources.ts <outDir> <url…>` to see that text. A probe that no longer matches is reported as "not found — the layout may have changed", never as "unchanged".
