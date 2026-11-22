// Renders the app icons and the social preview image into public/ with Playwright.
// Run after changing the logo or brand colours: `npm run images`.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const out = path.resolve(import.meta.dirname, '..', 'public');
const ACCENT = '#22d3ee';
const INK = '#04222a';
const BG = '#090d14';
const mark = (size, stroke = INK) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}"><path d="M10.5 22V10l11 12V10" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${ACCENT}"/><path d="M10.5 22V10l11 12V10" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
fs.writeFileSync(path.join(out, 'favicon.svg'), favicon);

const icon = (size, padding, radius) => `<html><body style="margin:0;background:transparent">
  <div style="width:${size}px;height:${size}px;background:${radius === 0 ? ACCENT : 'transparent'};display:flex;align-items:center;justify-content:center">
    <div style="width:${size - padding * 2}px;height:${size - padding * 2}px;border-radius:${radius}px;background:${ACCENT};display:flex;align-items:center;justify-content:center">${mark(Math.round((size - padding * 2) * 0.9))}</div>
  </div></body></html>`;

const og = `<html><head><style>
  body{margin:0;width:1200px;height:630px;background:${BG};font-family:'Segoe UI',Inter,system-ui,sans-serif;color:#f1f5f9;display:flex;flex-direction:column;justify-content:space-between;padding:72px 80px;box-sizing:border-box}
  .brand{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:600;letter-spacing:-0.02em}
  .logo{width:60px;height:60px;border-radius:14px;background:${ACCENT};display:flex;align-items:center;justify-content:center}
  h1{font-size:76px;line-height:1.04;letter-spacing:-0.035em;margin:0;font-weight:650;max-width:900px}
  p{font-size:30px;color:#a5b0c0;margin:22px 0 0;max-width:880px;line-height:1.35}
  .row{display:flex;gap:14px;font-size:24px;color:#a5b0c0}
  .chip{border:1px solid #3a485c;border-radius:10px;padding:10px 16px}
</style></head><body>
  <div class="brand"><div class="logo">${mark(54)}</div>NetWorth</div>
  <div><h1>Know what your salary is actually worth.</h1><p>Take-home pay after tax, compared across countries and converted into your currency.</p></div>
  <div class="row"><span class="chip">Denmark</span><span class="chip">Germany</span><span class="chip">Netherlands</span><span class="chip">Sweden</span><span class="chip">Norway</span><span class="chip">Greece</span></div>
</body></html>`;

const browser = await chromium.launch();
const shot = async (html, w, h, file, transparent = false) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(out, file), omitBackground: transparent });
  await page.close();
};
await shot(icon(192, 0, 40), 192, 192, 'icon-192.png', true);
await shot(icon(512, 0, 108), 512, 512, 'icon-512.png', true);
await shot(icon(512, 0, 0), 512, 512, 'icon-maskable-512.png');
await shot(icon(180, 0, 0), 180, 180, 'apple-touch-icon.png');
await shot(og, 1200, 630, 'og.png');
await browser.close();
console.log('Wrote favicon.svg, icons and og.png to public/');
