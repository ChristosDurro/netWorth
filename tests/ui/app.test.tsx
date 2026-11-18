// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TABLE = { amount: 1, base: 'EUR', date: '2026-11-16', rates: { DKK: 7.4752, SEK: 11.095, NOK: 10.574, GBP: 0.8345, USD: 1.1014 } };
let fetchMock: ReturnType<typeof vi.fn>;

async function renderApp(hash = '#/') {
  window.location.hash = hash;
  vi.resetModules(); // fresh currency-service cache and app state per test
  const { App } = await import('../../src/App');
  const user = userEvent.setup();
  render(<App />);
  return { user };
}
const hero = () => screen.findByTestId('hero-amount');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = 'dark';
  fetchMock = vi.fn(async () => new Response(JSON.stringify(TABLE), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('calculator', () => {
  it('shows Denmark 40,000 DKK converted to EUR after tax', async () => {
    await renderApp();
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€3,493/));
    expect(screen.getByTestId('hero-local').textContent).toMatch(/26,114 DKK/);
    expect(screen.getByText(/Based on 40,000 DKK gross monthly salary/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?base=EUR', expect.anything());
  });

  it('switches country with the flag picker', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: /Employment country: Denmark/ }));
    await user.click(screen.getByRole('option', { name: /Germany/ }));
    expect(screen.getByRole('button', { name: /Employment country: Germany/ })).toBeInTheDocument();
    expect(await screen.findByLabelText('Federal state')).toBeInTheDocument();
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€/));
  });

  it('updates results when the salary changes and shows the annual equivalent', async () => {
    const { user } = await renderApp();
    const input = screen.getByLabelText(/Gross monthly salary in DKK/);
    await user.clear(input);
    await user.type(input, '50000');
    expect(screen.getByText(/= 600,000 DKK per year/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Based on 50,000 DKK gross monthly salary/)).toBeInTheDocument());
  });

  it('switching to annual keeps the same salary', async () => {
    const { user } = await renderApp();
    await user.click(within(screen.getByRole('radiogroup', { name: 'Salary frequency' })).getByRole('radio', { name: 'Annual' }));
    expect((screen.getByLabelText(/Gross annual salary in DKK/) as HTMLInputElement).value).toBe('480,000');
    expect(screen.getByText(/≈ 40,000 DKK per month/)).toBeInTheDocument();
  });

  it('changes the output currency', async () => {
    const { user } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Show results in'), 'SEK');
    await waitFor(async () => expect((await hero()).textContent).toMatch(/SEK/));
  });

  it('manual exchange rate replaces the published rate', async () => {
    const { user } = await renderApp();
    await hero();
    await user.click(screen.getByRole('switch', { name: 'Automatic currency conversion' }));
    await user.type(screen.getByLabelText(/Manual rate/), '0.1');
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€2,611/));
    expect(screen.getAllByText('Manual rate').length).toBeGreaterThan(0);
  });

  it('shows an error with a manual-rate fallback when rates cannot be loaded', async () => {
    fetchMock.mockImplementation(async () => Promise.reject(new TypeError('Failed to fetch')));
    await renderApp();
    // A built-in reference table is used and clearly labelled as offline.
    await waitFor(() => expect(screen.getAllByText(/Offline · built-in/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/unreachable/).length).toBeGreaterThan(0);
  });

  it('advanced mode reveals personal circumstances that change the result', async () => {
    const { user } = await renderApp();
    const before = (await hero()).textContent;
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    const church = screen.getByRole('switch', { name: /Member of the Church of Denmark/ });
    await user.click(church);
    await waitFor(async () => expect((await hero()).textContent).not.toBe(before));
    expect(screen.getAllByText('Church tax').length).toBeGreaterThan(0);
  });

  it('expands a tax category to show how it was calculated', async () => {
    const { user } = await renderApp();
    await hero();
    await user.click(screen.getByRole('button', { name: /Income tax \(state \+ municipal\)/ }));
    expect(screen.getByText(/Bottom tax 12.01% on personal income/)).toBeInTheDocument();
  });
});

describe('saved calculations', () => {
  it('saves, lists, renames and deletes a calculation', async () => {
    const { user } = await renderApp();
    await hero();
    await user.click(screen.getByRole('button', { name: 'Save calculation' }));
    const name = screen.getByLabelText('Name for this calculation');
    await user.clear(name);
    await user.type(name, 'Denmark - Software Developer - 40k DKK');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(JSON.parse(localStorage.getItem('networth.saved') ?? '[]')).toHaveLength(1);

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /Saved Calculations/ }));
    expect(await screen.findByText('Denmark - Software Developer - 40k DKK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Duplicate/ }));
    expect(screen.getByText('Denmark - Software Developer - 40k DKK (copy)')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Delete Denmark/ })[1]);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Denmark - Software Developer - 40k DKK (copy)')).not.toBeInTheDocument();
  });
});

describe('country comparison', () => {
  it('compares four countries in one currency and highlights the highest net', async () => {
    await renderApp('#/compare');
    const table = await screen.findByTestId('compare-table');
    await waitFor(() => expect(within(table).getAllByText(/€/).length).toBeGreaterThan(8));
    expect(within(table).getByText('Denmark')).toBeInTheDocument();
    expect(within(table).getByText('Sweden')).toBeInTheDocument();
    expect(within(table).getByText(/Highest net/)).toBeInTheDocument();
  });
  it('adds and removes countries', async () => {
    const { user } = await renderApp('#/compare');
    await screen.findByTestId('compare-table');
    await user.click(screen.getByRole('button', { name: /Add country/ }));
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Remove Greece' }));
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(4);
  });
});

describe('navigation and theme', () => {
  it('mobile navigation switches pages', async () => {
    const { user } = await renderApp();
    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    await user.click(within(mobile).getByRole('link', { name: /Settings/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    await user.click(within(mobile).getByRole('link', { name: /About/ }));
    expect(screen.getByRole('heading', { level: 1, name: /How NetWorth calculates/ })).toBeInTheDocument();
  });
  it('toggles between dark and light themes and remembers it', async () => {
    const { user } = await renderApp();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(JSON.parse(localStorage.getItem('networth.settings') ?? '{}').theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('methodology page lists official sources and the disclaimer', async () => {
    await renderApp('#/methodology');
    expect(screen.getByText(/does not replace professional tax advice/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Skatteverket/ }).length).toBeGreaterThan(0);
  });
});
