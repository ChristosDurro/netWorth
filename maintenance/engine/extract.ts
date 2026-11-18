import { createHash } from 'node:crypto';
import type { Probe } from './types';

export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', ndash: '–', mdash: '—', euro: '€', sect: '§', aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', uuml: 'ü', szlig: 'ß' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

// Attribute values may contain ">" (e.g. Tailwind classes such as "[&>span]:…"),
// so every tag pattern skips over quoted strings instead of stopping at the first ">".
const ATTRS = String.raw`(?:"[^"]*"|'[^']*'|[^'">])*`;
const tagRe = (names: string): RegExp => new RegExp(String.raw`<\/?(?:${names})\b${ATTRS}>`, 'gi');
const anyTag = new RegExp(String.raw`<\/?[a-zA-Z!][^\s>/]*${ATTRS}>`, 'g');

/**
 * Turns an HTML page into stable plain text: drops scripts, styles, navigation
 * and page chrome (which change for reasons unrelated to tax rules), keeps one
 * line per block element and normalises whitespace.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(tagRe('br|hr'), '\n');
  s = s.replace(tagRe('p|div|li|ul|ol|tr|table|section|article|h[1-6]|dd|dt|dl|caption|thead|tbody|main|blockquote'), '\n');
  s = s.replace(tagRe('td|th'), ' | ');
  s = s.replace(anyTag, ' ');
  s = decodeEntities(s);
  return normaliseText(s);
}

export function normaliseText(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .split(/\n/)
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').replace(/^[\s|]+|[\s|]+$/g, '').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export async function pdfToText(buf: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n';
      out += item.str + ' ';
      lastY = y;
    }
    out += '\n';
  }
  await doc.destroy();
  return normaliseText(out);
}

export interface RssItem {
  id: string;
  title: string;
  link: string;
  date: string | null;
}

/** Minimal RSS 2.0 / Atom reader — enough for government news feeds. */
export function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const tag = (b: string, name: string): string | null => {
    const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(b);
    if (!m) return null;
    return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).trim();
  };
  for (const b of blocks) {
    const atomLink = /<link\b[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? null;
    const link = tag(b, 'link') || atomLink || '';
    const title = tag(b, 'title') ?? '';
    const id = tag(b, 'guid') ?? tag(b, 'id') ?? (link || title);
    const date = tag(b, 'pubDate') ?? tag(b, 'updated') ?? tag(b, 'published') ?? tag(b, 'dc:date');
    items.push({ id, title, link, date });
  }
  return items;
}

/** Lines that mention any keyword (case-insensitive). Their hash ignores layout noise elsewhere. */
export function relevantText(text: string, keywords: string[]): string {
  if (keywords.length === 0) return text;
  const k = keywords.map((w) => w.toLowerCase());
  return text
    .split('\n')
    .filter((l) => {
      const low = l.toLowerCase();
      return k.some((w) => low.includes(w));
    })
    .join('\n');
}

export function parseFormatted(raw: string, format: Probe['format']): number | null {
  let s = raw.replace(/[\s  ]/g, '');
  switch (format) {
    case 'space-thousands':
      s = s.replace(/,/g, '.');
      break;
    case 'dot-thousands':
      s = s.replace(/\./g, '').replace(/,/g, '.');
      break;
    case 'comma-thousands':
      s = s.replace(/,/g, '');
      break;
    case 'decimal-comma':
      s = s.replace(/\./g, '').replace(',', '.');
      break;
    case 'decimal-dot':
      break;
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Applies a probe to page text. Returns null when the pattern is not found (layout changed?). */
export function runProbe(text: string, probe: Pick<Probe, 'pattern' | 'format' | 'scale'>): number | null {
  let re: RegExp;
  try {
    re = new RegExp(probe.pattern, 'iu');
  } catch {
    return null;
  }
  const raw = re.exec(text)?.groups?.value;
  if (!raw) return null;
  const n = parseFormatted(raw, probe.format);
  return n === null ? null : Math.round(n * probe.scale * 1e10) / 1e10;
}

/** First four-digit year captured by `pattern` (group `value`), or null. */
export function findYear(text: string, pattern: string | undefined): number | null {
  if (!pattern) return null;
  try {
    const v = new RegExp(pattern, 'iu').exec(text)?.groups?.value;
    const y = v ? Number(v) : NaN;
    return Number.isInteger(y) && y > 1990 && y < 2200 ? y : null;
  } catch {
    return null;
  }
}
