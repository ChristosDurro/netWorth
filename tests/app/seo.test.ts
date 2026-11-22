import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { countryContent, publicCountries } from '../../src/content/countries';
import { HOME_FAQ } from '../../src/content/home';
import { href, legacyHashTarget, normalisePath, stripBase } from '../../src/router';
import { allPagePaths, matchRoute, pageMeta, structuredData } from '../../src/seo/routes';
import { reg } from '../tax/helpers';

describe('routing', () => {
  it('normalises paths and builds deploy-relative links', () => {
    expect(normalisePath('/compare/')).toBe('/compare');
    expect(normalisePath('')).toBe('/');
    expect(href('/')).toBe('/');
    expect(href('/countries/denmark')).toBe('/countries/denmark/');
    expect(href('/calculator?country=DK')).toBe('/calculator/?country=DK');
    expect(stripBase('/countries/denmark/')).toBe('/countries/denmark');
  });
  it('maps old hash links to real paths', () => {
    expect(legacyHashTarget('#/compare')).toBe('/compare');
    expect(legacyHashTarget('#/')).toBe('/');
    expect(legacyHashTarget('#/admin')).toBe('/');
    expect(legacyHashTarget('#sources')).toBeNull();
  });
  it('matches every public page and nothing else', () => {
    expect(matchRoute('/').name).toBe('home');
    expect(matchRoute('/countries/sweden')).toEqual({ name: 'country', path: '/countries/sweden', code: 'SE' });
    expect(matchRoute('/countries/atlantis').name).toBe('notFound');
    expect(matchRoute('/admin').name).toBe('notFound');
    expect(allPagePaths()).toEqual(expect.arrayContaining(['/', '/calculator', '/compare', '/saved', '/settings', '/methodology', '/countries', '/privacy', '/disclaimer', '/countries/denmark', '/countries/germany', '/countries/netherlands', '/countries/sweden', '/countries/norway', '/countries/greece']));
  });
});

describe('page metadata', () => {
  const metas = allPagePaths().map((p) => pageMeta(matchRoute(p)));
  it('gives every page a unique title and description of sensible length', () => {
    expect(new Set(metas.map((m) => m.title)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => m.description)).size).toBe(metas.length);
    for (const m of metas) {
      expect(m.title.length).toBeLessThanOrEqual(80);
      expect(m.description.length).toBeGreaterThan(50);
      expect(m.description.length).toBeLessThanOrEqual(200);
    }
  });
  it('keeps personal utility pages out of the index', () => {
    expect(pageMeta(matchRoute('/saved')).index).toBe(false);
    expect(pageMeta(matchRoute('/settings')).index).toBe(false);
    expect(pageMeta(matchRoute('/countries/norway')).index).toBe(true);
  });
  it('emits structured data that matches visible content', () => {
    const home = structuredData(pageMeta(matchRoute('/')), 'https://example.org/nw');
    const faq = home.find((o) => (o as { '@type': string })['@type'] === 'FAQPage') as { mainEntity: { name: string }[] };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(HOME_FAQ.map((f) => f.q));
    const dk = structuredData(pageMeta(matchRoute('/countries/denmark')), 'https://example.org/nw');
    const crumbs = dk.find((o) => (o as { '@type': string })['@type'] === 'BreadcrumbList') as { itemListElement: { item: string }[] };
    expect(crumbs.itemListElement.map((i) => i.item)).toEqual(['https://example.org/nw/', 'https://example.org/nw/countries/', 'https://example.org/nw/countries/denmark/']);
  });
});

describe('country content', () => {
  it('exists for every supported country', () => {
    expect(publicCountries().map((c) => c.code).sort()).toEqual(['DE', 'DK', 'GR', 'NL', 'NO', 'SE']);
  });
  it('quotes rates straight from the active dataset', () => {
    const dk = countryContent('DK', 2026)!;
    const rules = reg.getDataset('DK', 2026).rules as { amBidragRate: number; personalAllowance: number };
    const text = JSON.stringify(dk);
    expect(text).toContain(`${rules.amBidragRate * 100}%`);
    expect(text).toContain(new Intl.NumberFormat('en-US').format(rules.personalAllowance));
  });
  it('has substantial, non-duplicated content and FAQs on every page', () => {
    const all = publicCountries().map((c) => countryContent(c.code, c.year)!);
    for (const c of all) {
      expect(c.sections.length).toBeGreaterThanOrEqual(4);
      expect(c.faq.length).toBeGreaterThanOrEqual(3);
      expect(c.examples.length).toBeGreaterThanOrEqual(3);
      for (const ex of c.examples) expect(reg.calculateNetSalary({ country: c.code, taxYear: 2026, grossAnnual: ex * 12 }).netAnnual).toBeGreaterThan(0);
    }
    expect(new Set(all.map((c) => c.intro)).size).toBe(all.length);
  });
});

describe('design tokens', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/index.css'), 'utf8');
  const block = (selector: string) => {
    const m = new RegExp(`${selector.replace('.', '\\.')} \\{([\\s\\S]*?)\\n\\}`).exec(css)!;
    return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], x[2]]));
  };
  const lum = (hex: string) => {
    const c = hex.slice(1).match(/../g)!.map((x) => {
      const v = parseInt(x, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  it.each([':root', '.dark'])('%s: every text colour meets WCAG AA on every surface it is used on', (sel) => {
    const t = block(sel);
    for (const fg of ['ink', 'muted', 'faint', 'accent', 'pos', 'neg', 'warn']) {
      for (const bg of ['bg', 'surface', 'surface-2']) expect(contrast(t[fg], t[bg]), `${sel} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t['accent-ink'], t.accent), `${sel} button text`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.control, t.surface), `${sel} input borders`).toBeGreaterThanOrEqual(3);
  });
});
