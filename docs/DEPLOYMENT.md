# Deploying NetWorth for free

The public app is a static site (`npm run build` → `dist/`). All asset paths are relative, so it works at a domain root or in a sub-folder. Routing uses the URL hash, so no server rewrites are needed. The admin Update Center is excluded from production builds.

## Cloudflare Pages

1. Push the repository to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repository.
3. Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
4. Every push to the main branch redeploys. A custom domain is optional (the only possible cost).

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes on every push to `main`.

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Push to `main`. The site appears at `https://<user>.github.io/<repo>/`.

## Publishing tax-data updates

The website can never change its own tax data. Updates flow through the repository:

1. Locally: `npm run admin` → check → review → approve (validated and tested before activation).
2. Commit the changed `tax-data/`, `tests/tax/golden.json` and `maintenance/data/` (or enable *Create a git commit on approval*).
3. Push / merge → CI runs all tests → the deploy workflow rebuilds the site with the new data.

The monthly `tax-check.yml` workflow opens a pull request when official sources show changes, so nothing is missed even if nobody runs the local tool.

## Continuous integration

`.github/workflows/ci.yml` type-checks, runs the unit/UI tests, builds, and runs the Playwright journeys on every push and pull request. All workflows use only free GitHub-hosted runners and need no secrets beyond the automatic `GITHUB_TOKEN`.
