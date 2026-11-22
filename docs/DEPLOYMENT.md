# Deploying NetWorth for free

The public site is fully static. `npm run build` type-checks, builds the app, renders every page on the server side and writes one HTML file per route (`dist/calculator/index.html`, `dist/countries/denmark/index.html` …) plus `404.html`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest` and the offline service worker. Search engines and link previews get complete HTML; the app takes over in the browser.

Two environment variables describe where the site lives:

| Variable | Example | Used for |
|---|---|---|
| `BASE_PATH` | `/netWorth/` (GitHub project site) or `/` (custom domain) | asset URLs, links, service-worker scope |
| `SITE_URL` | `https://christosdurro.github.io/netWorth` | canonical URLs, Open Graph, sitemap (omitted when unset) |

The private tax-administration tool lives in `tools/tax-admin/` and is never part of this build.

## Cloudflare Pages

1. Push the repository to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repository.
3. Build command `npm run build`, output directory `dist`, environment variables `NODE_VERSION=22`, `BASE_PATH=/` and `SITE_URL=https://<your-project>.pages.dev`.
4. Every push to the main branch redeploys. A custom domain is optional (the only possible cost).

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes on every push to `main`. It reads the base path and site URL from `actions/configure-pages`, so a renamed repository or a custom domain needs no code change.

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Push to `main`. The site appears at `https://<user>.github.io/<repo>/`.

## Publishing tax-data updates

The website can never change its own tax data. Updates flow through the repository:

1. Locally: `npm run admin` → http://127.0.0.1:5342 → check → review → approve (validated and tested before activation).
2. Commit the changed `tax-data/`, `tests/tax/golden.json` and `maintenance/data/` (or enable *Create a git commit on approval*).
3. Push / merge → CI runs all tests → the deploy workflow rebuilds the site with the new data.

The monthly `tax-check.yml` workflow opens a pull request when official sources show changes, so nothing is missed even if nobody runs the local tool.

## Continuous integration

`.github/workflows/ci.yml` type-checks, runs the unit/UI tests, builds, and runs the Playwright journeys on every push and pull request. All workflows use only free GitHub-hosted runners and need no secrets beyond the automatic `GITHUB_TOKEN`.
