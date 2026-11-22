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

test('calculate take-home pay in Denmark and see it in EUR', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await mockRates(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Understand what you actually earn.');
  await expect(hero(page)).toContainText('€3,493');
  await expect(page.getByTestId('hero-local')).toContainText('26,114 DKK');
  await expect(page.getByTestId('breakdown-net')).toContainText('26,114 DKK');
  await expect(page.getByText('1 DKK = 0.13378 EUR').first()).toBeVisible();

  const amount = page.getByLabel('Gross monthly salary in DKK');
  await amount.fill('55000');
  await expect(page.getByText('Based on 55,000 DKK gross monthly salary')).toBeVisible();

  await page.getByRole('button', { name: /Employment country/ }).click();
  await page.getByRole('option', { name: /Sweden/ }).click();
  await page.getByLabel('Municipality').selectOption({ label: 'Stockholm — 30.55%' });
  await expect(hero(page)).toContainText('€');
  await expect(page.getByText(/Tax rates for Stockholm/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('compare countries in one currency', async ({ page }) => {
  await mockRates(page);
  await page.goto('/#/compare');
  const table = page.getByTestId('compare-table');
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByText('Highest net')).toBeVisible();
  await page.getByRole('radio', { name: 'Annual' }).click();
  await expect(page.getByText(/per year · EUR/)).toBeVisible();
});

test('save a calculation, reopen it and export it', async ({ page }) => {
  await mockRates(page);
  await page.goto('/');
  await page.getByLabel('Gross monthly salary in DKK').fill('42000');
  await expect(page.getByText('Based on 42,000 DKK gross monthly salary')).toBeVisible();
  await page.getByRole('button', { name: 'Save calculation' }).click();
  await page.getByLabel('Name for this calculation').fill('Copenhagen offer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.goto('/#/saved');
  await expect(page.getByText('Copenhagen offer')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export JSON/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^networth-calculations-.*\.json$/);

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText('Based on 42,000 DKK gross monthly salary')).toBeVisible();
});

test('works when the exchange-rate service is down', async ({ page }) => {
  await mockRates(page, 'down');
  await page.goto('/');
  await expect(page.getByText('Offline · built-in').first()).toBeVisible();
  await page.getByRole('switch', { name: 'Automatic currency conversion' }).click();
  await page.getByLabel(/Manual rate/).fill('0.134');
  await expect(hero(page)).toContainText('€3,499');
});

test('theme choice survives a reload', async ({ page }) => {
  await mockRates(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('the admin Update Center is not part of the public build', async ({ page }) => {
  await mockRates(page);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Understand what you actually earn.');
  await expect(page.getByText('Tax Update Center')).toHaveCount(0);
});

test('navigation works on every screen size without horizontal scrolling', async ({ page, isMobile }) => {
  await mockRates(page);
  await page.goto('/');
  await expect(hero(page)).toBeVisible();
  const nav = isMobile ? page.getByRole('navigation', { name: 'Mobile' }) : page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  for (const [link, heading] of [
    [/Compar/, 'Compare countries side by side.'],
    [/Saved/, 'Saved calculations'],
    [/Settings/, 'Settings'],
    [/About/, 'How NetWorth calculates'],
  ] as const) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('every page fits a phone screen even with a wider system font', async ({ page }) => {
  // Linux and many Android phones fall back to wider fonts than Windows/macOS. A page
  // wider than the screen makes the browser zoom out and breaks the fixed bottom bar.
  await mockRates(page);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const route of ['/', '/#/compare', '/#/saved', '/#/settings', '/#/methodology']) {
    await page.goto(route);
    await page.addStyleTag({ content: '*{font-family:Verdana,"DejaVu Sans",sans-serif !important}' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
  }
});
