import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TABLE = { amount: 1, base: 'EUR', date: '2026-11-16', rates: { DKK: 7.4752, SEK: 11.095, NOK: 10.574, GBP: 0.8345, USD: 1.1014 } };

async function mockRates(page: Page, mode: 'ok' | 'down' = 'ok') {
  await page.route('https://api.frankfurter.dev/**', (route) => (mode === 'ok' ? route.fulfill({ json: TABLE }) : route.abort('failed')));
}
const hero = (page: Page) => page.getByTestId('hero-amount');

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('homepage → calculator: Denmark take-home pay in EUR', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await mockRates(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Know what your salary is actually worth.');
  await expect(page.getByTestId('quick-net')).toContainText('€3,493');
  await page.getByRole('link', { name: /See the full breakdown/ }).click();
  await expect(page).toHaveURL(/\/netWorth\/calculator\/\?country=DK&salary=40000/);
  await expect(hero(page)).toContainText('€3,493');
  await expect(page.getByTestId('hero-local')).toContainText('26,114 DKK');
  await expect(page.getByTestId('breakdown-net')).toContainText('26,114 DKK');

  await page.getByLabel('Gross monthly salary in DKK').fill('55000');
  await expect(page.getByText('= 660,000 DKK per year (12 payments)')).toBeVisible();
  await page.getByRole('button', { name: /Employment country/ }).click();
  await page.getByRole('option', { name: /Sweden/ }).click();
  await page.getByLabel('Municipality', { exact: true }).selectOption({ label: 'Stockholm — 30.55%' });
  await expect(hero(page)).toContainText('€');
  expect(errors).toEqual([]);
});

test('a shared link opens the same calculation', async ({ page }) => {
  await mockRates(page);
  await page.goto('calculator/?country=NO&salary=60000&frequency=monthly&year=2026&currency=GBP');
  await expect(page.getByRole('button', { name: /Employment country: Norway/ })).toBeVisible();
  await expect(page.getByLabel('Gross monthly salary in NOK')).toHaveValue('60,000');
  await expect(hero(page)).toContainText('£');
});

test('reverse calculator finds the gross for a take-home target', async ({ page }) => {
  await mockRates(page);
  await page.goto('calculator/');
  await page.getByRole('radio', { name: 'Take-home → gross' }).click();
  await page.getByLabel('Desired take-home monthly pay in DKK').fill('26114');
  await expect(page.getByText('Gross salary you need')).toBeVisible();
  await expect(page.getByTestId('hero-local')).toContainText(/(40,00\d|39,99\d) DKK/);
});

test('compare offers in one currency', async ({ page, isMobile }) => {
  await mockRates(page);
  await page.goto('compare/');
  if (isMobile) {
    await expect(page.getByRole('list', { name: 'Ranked offers' }).getByRole('listitem')).toHaveCount(4);
  } else {
    await expect(page.getByTestId('compare-table').getByRole('row')).toHaveCount(5);
  }
  await expect(page.getByText('Highest net').locator('visible=true').first()).toBeVisible();
  await page.getByLabel('Sort by').selectOption('tax-asc');
  await expect(page.getByText(/leaves you with the most/)).toBeVisible();
});

test('save a calculation, reopen it and export it', async ({ page }) => {
  await mockRates(page);
  await page.goto('calculator/');
  await page.getByLabel('Gross monthly salary in DKK').fill('42000');
  await expect(page.getByText('= 504,000 DKK per year (12 payments)')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Name for this calculation').fill('Copenhagen offer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.goto('saved/');
  await expect(page.getByText('Copenhagen offer')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export JSON/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^networth-calculations-.*\.json$/);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByLabel('Gross monthly salary in DKK')).toHaveValue('42,000');
});

test('works when the exchange-rate service is down', async ({ page }) => {
  await mockRates(page, 'down');
  await page.goto('calculator/');
  await expect(page.getByText('Offline · built-in').first()).toBeVisible();
  await expect(page.getByTestId('breakdown-net')).toContainText('26,114 DKK');
  await page.getByText('Rate options', { exact: true }).click();
  await page.getByRole('switch', { name: 'Automatic currency conversion' }).click();
  await page.getByLabel(/Manual rate/).fill('0.134');
  await expect(hero(page)).toContainText('€3,499');
});

test('theme choice survives a reload', async ({ page }) => {
  await mockRates(page);
  await page.goto('./');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('navigation reaches every section on every screen size', async ({ page, isMobile }) => {
  await mockRates(page);
  await page.goto('./');
  const steps: [RegExp, string][] = [
    [/Compare/, 'Compare job offers'],
    [/Saved/, 'Saved calculations'],
    [/Calculat/, 'Salary calculator'],
  ];
  const nav = isMobile ? page.getByRole('navigation', { name: 'Mobile' }) : page.getByRole('navigation', { name: 'Main' });
  for (const [link, heading] of steps) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
  if (isMobile) {
    await nav.getByRole('button', { name: 'More' }).click();
    await page.getByRole('navigation', { name: 'More pages' }).getByRole('link', { name: 'Methodology' }).click();
  } else {
    await nav.getByRole('link', { name: 'Methodology' }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How NetWorth calculates');
});

const PAGES = ['./', 'calculator/', 'compare/', 'saved/', 'settings/', 'methodology/', 'countries/', 'countries/denmark/', 'countries/greece/', 'privacy/', 'disclaimer/'];

test('every page fits a phone screen, even with a wider system font', async ({ page }) => {
  // Linux and many Android phones use wider fallback fonts. A page wider than the
  // screen makes the browser zoom out and breaks the fixed bottom bar.
  await mockRates(page);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const route of PAGES) {
    await page.goto(route);
    await page.addStyleTag({ content: '*{font-family:Verdana,"DejaVu Sans",sans-serif !important}' });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
  }
});

test('pages have no automatically detectable accessibility violations', async ({ page }) => {
  test.setTimeout(90_000);
  await mockRates(page);
  for (const route of ['./', 'calculator/', 'compare/', 'saved/', 'settings/', 'methodology/', 'countries/sweden/', 'privacy/']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  }
});

test.describe('search engines', () => {
  test.use({ javaScriptEnabled: false });
  test('pages are pre-rendered with content, metadata and structured data', async ({ page, request }) => {
    await page.goto('countries/denmark/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Denmark salary calculator 2026');
    await expect(page.getByRole('heading', { name: 'Salary examples' })).toBeVisible();
    await expect(page).toHaveTitle(/Denmark salary calculator 2026/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://christosdurro.github.io/netWorth/countries/denmark/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png$/);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join('')).toContain('"FAQPage"');
    expect(ld.join('')).toContain('"BreadcrumbList"');

    await page.goto('saved/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');

    const sitemap = await (await request.get('sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://christosdurro.github.io/netWorth/countries/norway/</loc>');
    expect(sitemap).not.toContain('/saved/');
    expect(await (await request.get('robots.txt')).text()).toContain('Sitemap: https://christosdurro.github.io/netWorth/sitemap.xml');
    const manifest = await (await request.get('manifest.webmanifest')).json();
    expect(manifest.start_url).toBe('/netWorth/calculator/');
  });
});

test('the admin tool is not part of the public build', async ({ page, request }) => {
  await mockRates(page);
  await page.goto('admin/');
  await expect(page.getByText('This page doesn’t exist')).toBeVisible();
  const html = await (await request.get('./')).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    const js = await (await request.get(s.replace(/^\/netWorth\//, ''))).text();
    expect(js).not.toContain('admin-api');
    expect(js).not.toContain('Tax Regulation Update Center');
  }
});
