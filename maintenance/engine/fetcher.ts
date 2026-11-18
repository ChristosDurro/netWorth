import type { MaintenanceContext } from './context';

export const USER_AGENT = 'NetWorthTaxMonitor/1.0 (local tax-data maintenance tool; respects robots.txt)';
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

export interface FetchOutcome {
  ok: boolean;
  status: number | null;
  url: string;
  contentType: string;
  lastModified: string | null;
  body: Buffer | null;
  error: string | null;
  blockedByRobots: boolean;
}

/* ---------------- robots.txt ---------------- */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  /** Seconds between requests requested by the site (capped at 60). */
  crawlDelay: number;
}

/** Parses the rule group that applies to our user agent (or `*`). */
export function parseRobots(text: string, agent = 'NetWorthTaxMonitor'): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: 0 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    if (key === 'disallow' && value) current.disallow.push(value);
    if (key === 'crawl-delay' && Number.isFinite(Number(value))) current.delay = Math.min(60, Math.max(0, Number(value)));
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  const g = specific ?? star;
  return { allow: g?.allow ?? [], disallow: g?.disallow ?? [], crawlDelay: g?.delay ?? 0 };
}

const ruleMatches = (rule: string, p: string): boolean => {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(p);
};

/** Longest matching rule wins; Allow wins ties (Google/RFC 9309 semantics). */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules.allow) if (ruleMatches(r, pathAndQuery) && (!best || r.length >= best.len)) best = { len: r.length, allow: true };
  for (const r of rules.disallow) if (ruleMatches(r, pathAndQuery) && (!best || r.length > best.len)) best = { len: r.length, allow: false };
  return best ? best.allow : true;
}

/* ---------------- polite fetcher ---------------- */

export class PoliteFetcher {
  private robots = new Map<string, Promise<RobotsRules>>();
  private lastRequest = new Map<string, number>();

  constructor(private ctx: MaintenanceContext) {}

  private crawlDelayMs = new Map<string, number>();

  private async wait(host: string) {
    const last = this.lastRequest.get(host);
    const gap = Math.max(this.ctx.hostDelayMs, this.crawlDelayMs.get(host) ?? 0);
    const delay = last === undefined ? 0 : last + gap - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    this.lastRequest.set(host, Date.now());
  }

  private async raw(url: string, accept: string): Promise<Response> {
    const host = new URL(url).host;
    await this.wait(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await this.ctx.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private rulesFor(origin: string): Promise<RobotsRules> {
    let p = this.robots.get(origin);
    if (!p) {
      p = (async () => {
        try {
          const res = await this.raw(`${origin}/robots.txt`, 'text/plain');
          // RFC 9309: 4xx means no restrictions; 5xx/unreachable means assume full disallow.
          if (res.status >= 500) return { allow: [], disallow: ['/'], crawlDelay: 0 };
          if (!res.ok) return { allow: [], disallow: [], crawlDelay: 0 };
          return parseRobots(await res.text());
        } catch {
          return { allow: [], disallow: [], crawlDelay: 0 };
        }
      })();
      this.robots.set(origin, p);
    }
    return p;
  }

  async get(url: string, accept = 'text/html,application/xhtml+xml,application/json,application/pdf;q=0.9,*/*;q=0.5'): Promise<FetchOutcome> {
    const u = new URL(url);
    const base: Omit<FetchOutcome, 'ok' | 'status' | 'body' | 'error' | 'blockedByRobots'> = { url, contentType: '', lastModified: null };
    const rules = await this.rulesFor(u.origin);
    if (rules.crawlDelay > 0) this.crawlDelayMs.set(u.host, rules.crawlDelay * 1000);
    if (!isAllowed(rules, u.pathname + u.search)) {
      return { ...base, ok: false, status: null, body: null, error: 'Disallowed by robots.txt — not fetched.', blockedByRobots: true };
    }
    let lastError = 'unknown error';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.raw(url, accept);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) return { ...base, ok: false, status: res.status, body: null, error: 'Response too large.', blockedByRobots: false };
        const out: FetchOutcome = {
          url: res.url || url,
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get('content-type') ?? '',
          lastModified: res.headers.get('last-modified'),
          body: buf,
          error: res.ok ? null : `HTTP ${res.status}`,
          blockedByRobots: false,
        };
        // Retry once on server errors / rate limiting; never on 4xx.
        if (res.status >= 500 || res.status === 429) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        return out;
      } catch (e) {
        lastError = e instanceof Error ? (e.name === 'AbortError' ? 'Timed out' : e.message) : String(e);
      }
    }
    return { ...base, ok: false, status: null, body: null, error: lastError, blockedByRobots: false };
  }
}
