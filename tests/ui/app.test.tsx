// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TABLE = { amount: 1, base: 'EUR', date: '2026-11-16', rates: { DKK: 7.4752, SEK: 11.095, NOK: 10.574, GBP: 0.8345, USD: 1.1014 } };
let fetchMock: ReturnType<typeof vi.fn>;

async function renderApp(path = '/') {
  window.history.replaceState(null, '', path);
  vi.resetModules(); // fresh currency-service cache and app state per test
  const { App } = await import('../../src/App');
  const user = userEvent.setup();
  render(<App />);
  return { user };
}
const hero = () => screen.findByTestId('hero-amount');
const openDetails = (summaryText: RegExp) => {
  const summary = screen.getByText(summaryText).closest('summary') as HTMLElement;
  const details = summary.parentElement as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event('toggle'));
};

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
    await renderApp('/calculator');
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€3,493/));
    expect(screen.getByTestId('hero-local').textContent).toMatch(/26,114 DKK/);
    expect(screen.getByTestId('breakdown-net').textContent).toMatch(/26,114 DKK/);
    expect(screen.getByText('Your net take-home pay')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?base=EUR', expect.anything());
  });

  it('switches country with the flag picker', async () => {
    const { user } = await renderApp('/calculator');
    await user.click(screen.getByRole('button', { name: /Employment country: Denmark/ }));
    await user.click(screen.getByRole('option', { name: /Sweden/ }));
    expect(screen.getByRole('button', { name: /Employment country: Sweden/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Gross monthly salary in SEK')).toBeInTheDocument();
    expect(await screen.findByLabelText('Municipality')).toBeInTheDocument();
  });

  it('updates the result while typing and shows the annual equivalent', async () => {
    const { user } = await renderApp('/calculator');
    const input = screen.getByLabelText('Gross monthly salary in DKK');
    await user.clear(input);
    await user.type(input, '55000');
    expect(await screen.findByText('= 660,000 DKK per year (12 payments)')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('breakdown-net').textContent).not.toMatch(/26,114/));
  });

  it('switching to annual keeps the same salary', async () => {
    const { user } = await renderApp('/calculator');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Salary frequency' })).getByRole('radio', { name: 'Annual' }));
    expect(screen.getByLabelText('Gross annual salary in DKK')).toHaveValue('480,000');
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€3,493/));
  });

  it('validates the salary field', async () => {
    const { user } = await renderApp('/calculator');
    const input = screen.getByLabelText('Gross monthly salary in DKK');
    await user.clear(input);
    await user.tab();
    expect(await screen.findByText('Enter an amount greater than zero.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('reverse mode finds the gross salary for a desired take-home pay', async () => {
    const { user } = await renderApp('/calculator');
    await user.click(screen.getByRole('radio', { name: 'Take-home → gross' }));
    const input = screen.getByLabelText('Desired take-home monthly pay in DKK');
    await user.clear(input);
    await user.type(input, '26114');
    expect(await screen.findByText('Gross salary you need')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('hero-local').textContent).toMatch(/40,00\d DKK|39,99\d DKK/));
  });

  it('a manual exchange rate replaces the published rate', async () => {
    const { user } = await renderApp('/calculator');
    await hero();
    openDetails(/Rate options/);
    await user.click(screen.getByRole('switch', { name: 'Automatic currency conversion' }));
    await user.type(screen.getByLabelText(/Manual rate/), '0.134');
    await waitFor(async () => expect((await hero()).textContent).toMatch(/^€3,499/));
  });

  it('keeps calculating and offers a manual rate when exchange rates cannot be loaded', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('network down');
    });
    await renderApp('/calculator');
    // Built-in fallback rates are used and labelled; tax results are unaffected.
    expect((await screen.findAllByText('Offline · built-in')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('breakdown-net').textContent).toMatch(/26,114 DKK/);
  });

  it('personal circumstances change the result', async () => {
    const { user } = await renderApp('/calculator');
    await hero();
    const before = screen.getByTestId('breakdown-net').textContent;
    openDetails(/Your circumstances/);
    await user.click(screen.getByRole('switch', { name: 'Member of the Church of Denmark' }));
    await waitFor(() => expect(screen.getByTestId('breakdown-net').textContent).not.toBe(before));
  });

  it('expands a deduction to explain how it was calculated', async () => {
    const { user } = await renderApp('/calculator');
    await hero();
    const row = screen.getByRole('button', { name: /Labour market contribution/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens a shared link with its inputs and keeps the address bar shareable', async () => {
    const { user } = await renderApp('/calculator?country=SE&salary=45000&frequency=monthly&year=2026&currency=USD&p.churchMember=true');
    expect(await screen.findByRole('button', { name: /Employment country: Sweden/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Gross monthly salary in SEK')).toHaveValue('45,000');
    await waitFor(() => expect(window.location.search).toContain('currency=USD'));
    const input = screen.getByLabelText('Gross monthly salary in SEK');
    await user.clear(input);
    await user.type(input, '50000');
    await waitFor(() => expect(window.location.search).toContain('salary=50000'));
  });

  it('ignores invalid link parameters and says so', async () => {
    await renderApp('/calculator?country=DK&salary=abc&currency=XYZ');
    expect(await screen.findByText(/were not valid and were ignored: salary, currency/)).toBeInTheDocument();
  });
});

describe('saved calculations', () => {
  it('saves, lists, renames, edits and deletes a calculation', async () => {
    const { user } = await renderApp('/calculator');
    await hero();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const name = screen.getByLabelText('Name for this calculation');
    await user.clear(name);
    await user.type(name, 'Copenhagen offer{Enter}');
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Saved' }));
    expect(await screen.findByText('Copenhagen offer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Rename/ }));
    const field = screen.getByLabelText('New name');
    await user.clear(field);
    await user.type(field, 'Aarhus offer{Enter}');
    expect(await screen.findByText('Aarhus offer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Edit/ }));
    expect(await screen.findByText(/Editing saved calculation/)).toBeInTheDocument();
    const input = screen.getByLabelText('Gross monthly salary in DKK');
    await user.clear(input);
    await user.type(input, '50000');
    await user.click(screen.getByRole('button', { name: 'Update saved' }));
    const stored = JSON.parse(localStorage.getItem('networth.saved') as string);
    expect(stored[0].draft.amount).toBe(50000);

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Saved' }));
    await user.click(await screen.findByRole('button', { name: 'Delete Aarhus offer' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No saved calculations yet')).toBeInTheDocument();
  });
});

describe('comparison', () => {
  it('ranks four offers in one currency and highlights the highest take-home pay', async () => {
    await renderApp('/compare');
    const table = await screen.findByTestId('compare-table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(5));
    expect(within(table).getByText('Highest net')).toBeInTheDocument();
    expect(screen.getByText(/leaves you with the most/)).toBeInTheDocument();
  });

  it('adds, renames, sorts and removes offers', async () => {
    const { user } = await renderApp('/compare');
    await user.click(screen.getByRole('button', { name: /Add offer/ }));
    expect(screen.getAllByLabelText(/^Name \(optional\)/)).toHaveLength(5);
    await user.type(screen.getAllByLabelText(/^Name \(optional\)/)[4], 'Oslo startup');
    expect(within(screen.getByTestId('compare-table')).getByText('Oslo startup')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Sort by'), 'tax-asc');
    await user.click(screen.getByRole('button', { name: /Remove offer 5/ }));
    expect(screen.getAllByLabelText(/^Name \(optional\)/)).toHaveLength(4);
  });
});

describe('navigation, pages and preferences', () => {
  it('mobile navigation and the More sheet switch pages', async () => {
    const { user } = await renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Mobile' });
    await user.click(within(nav).getByRole('link', { name: 'Compare' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Compare job offers' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/compare/');
    await user.click(within(nav).getByRole('button', { name: 'More' }));
    await user.click(within(screen.getByRole('navigation', { name: 'More pages' })).getByRole('link', { name: 'Methodology' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'How NetWorth calculates' })).toBeInTheDocument();
  });

  it('redirects old hash links and shows a 404 page for unknown paths', async () => {
    window.location.hash = '#/compare';
    await renderApp('/#/compare');
    expect(await screen.findByRole('heading', { level: 1, name: 'Compare job offers' })).toBeInTheDocument();
    cleanup();
    await renderApp('/nope');
    expect(await screen.findByText('This page doesn’t exist')).toBeInTheDocument();
  });

  it('toggles between dark and light themes and remembers it', async () => {
    const { user } = await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(JSON.parse(localStorage.getItem('networth.settings') as string).theme).toBe('light');
  });

  it('home quick calculator shows take-home pay and links to the full breakdown', async () => {
    await renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Know what your salary is actually worth.' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('quick-net').textContent).toMatch(/€3,493/));
    expect(screen.getByRole('link', { name: /See the full breakdown/ })).toHaveAttribute('href', expect.stringContaining('/calculator/?country=DK&salary=40000'));
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0);
  });

  it('country page shows engine-calculated examples, FAQ and official sources', async () => {
    await renderApp('/countries/norway');
    expect(screen.getByRole('heading', { level: 1, name: 'Norway salary calculator 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salary examples' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Frequently asked questions' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /skatteetaten|Skatteetaten/i }).length).toBeGreaterThan(0);
  });

  it('methodology lists the official sources and the disclaimer', async () => {
    await renderApp('/methodology');
    expect(screen.getByText(/does not replace professional tax advice/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Skattestyrelsen|Belastingdienst|Skatteverket/ }).length).toBeGreaterThan(2);
  });

  it('settings: default country is used for new calculations and all data can be deleted', async () => {
    const { user } = await renderApp('/settings');
    await user.click(screen.getByRole('button', { name: /Default country: Denmark/ }));
    await user.click(screen.getByRole('option', { name: /Germany/ }));
    expect(JSON.parse(localStorage.getItem('networth.settings') as string).country).toBe('DE');
    await user.click(screen.getByRole('button', { name: /Delete all data in this browser/ }));
    await user.click(screen.getByRole('button', { name: /Delete everything/ }));
    expect(await screen.findByText(/All NetWorth data has been removed/)).toBeInTheDocument();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('networth.') && k !== 'networth.settings')).toEqual([]);
  });

  it('the admin tool is not part of the public app', async () => {
    await renderApp('/admin');
    expect(await screen.findByText('This page doesn’t exist')).toBeInTheDocument();
    expect(screen.queryByText(/Update Center/)).toBeNull();
  });
});
