/* Developer helper: fetch candidate official pages politely and dump their normalised text for probe design. */
import fs from 'node:fs';
import path from 'node:path';
import { PoliteFetcher } from '../maintenance/engine/fetcher';
import { htmlToText, parseFeed, pdfToText } from '../maintenance/engine/extract';

const out = process.argv[2];
const urls = process.argv.slice(3);
const fetcher = new PoliteFetcher({ root: '', taxDataDir: '', maintDir: '', fetch, now: () => new Date(), runTests: async () => ({ ran: false, passed: false, total: 0, failed: 0, summary: '' }), git: null, hostDelayMs: 1500, log: console.log });
fs.mkdirSync(out, { recursive: true });
for (const [i, url] of urls.entries()) {
  const r = await fetcher.get(url);
  let text = '';
  if (r.body) {
    if (r.contentType.includes('pdf')) text = await pdfToText(r.body);
    else if (r.contentType.includes('xml') || url.endsWith('.xml') || url.includes('rss')) text = JSON.stringify(parseFeed(r.body.toString('utf8')).slice(0, 8), null, 1);
    else text = htmlToText(r.body.toString('utf8'));
  }
  fs.writeFileSync(path.join(out, `${i}.txt`), `${url}\nstatus=${r.status} type=${r.contentType} lm=${r.lastModified} err=${r.error}\n\n${text}`);
  console.log(i, r.status, r.error ?? '', text.length, url);
}
