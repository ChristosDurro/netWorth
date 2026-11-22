// Pre-renders every public page to static HTML after `vite build`.
//
//   dist/index.html, dist/calculator/index.html, dist/countries/denmark/index.html …
//   dist/404.html, dist/sitemap.xml, dist/robots.txt, dist/manifest.webmanifest, dist/sw.js
//
// Inputs (environment):
//   BASE_PATH  folder the site is served from ("/" or "/<repo>/"), same as for vite build
//   SITE_URL   absolute origin + base without trailing slash, e.g. https://user.github.io/repo
//              (canonical URLs, Open Graph and the sitemap need it; omitted when unset)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const ssrEntry = path.join(root, 'dist-ssr', 'entry-server.js');
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '');

const { render, allPagePaths, matchRoute, pageMeta, structuredData } = await import(pathToFileURL(ssrEntry).href);
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pageUrl = (p) => `${siteUrl}${p === '/' ? '/' : `${p}/`}`;
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function headTags(meta) {
  const tags = [];
  if (!meta.index) tags.push('<meta name="robots" content="noindex" />');
  if (siteUrl) {
    tags.push(`<link rel="canonical" href="${esc(pageUrl(meta.path))}" />`);
    tags.push(`<meta property="og:url" content="${esc(pageUrl(meta.path))}" />`);
    tags.push(`<meta property="og:image" content="${esc(`${siteUrl}/og.png`)}" />`);
    tags.push('<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />');
    tags.push(`<meta name="twitter:image" content="${esc(`${siteUrl}/og.png`)}" />`);
  }
  tags.push('<meta property="og:site_name" content="NetWorth" />');
  tags.push(`<meta property="og:type" content="${meta.kind === 'article' ? 'article' : 'website'}" />`);
  tags.push(`<meta property="og:title" content="${esc(meta.title)}" />`);
  tags.push(`<meta property="og:description" content="${esc(meta.description)}" />`);
  tags.push('<meta property="og:locale" content="en_GB" />');
  tags.push('<meta name="twitter:card" content="summary_large_image" />');
  tags.push(`<meta name="twitter:title" content="${esc(meta.title)}" />`);
  tags.push(`<meta name="twitter:description" content="${esc(meta.description)}" />`);
  if (siteUrl) for (const o of structuredData(meta, siteUrl)) tags.push(`<script type="application/ld+json">${jsonLd(o)}</script>`);
  return tags.join('\n    ');
}

function page(appPath) {
  const meta = pageMeta(matchRoute(appPath));
  const html = render(appPath);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(meta.description)}" />`)
    .replace('<!--head-tags-->', headTags(meta))
    .replace('<!--app-html-->', html);
}

const written = [];
for (const p of allPagePaths()) {
  const file = p === '/' ? path.join(dist, 'index.html') : path.join(dist, ...p.slice(1).split('/'), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(p));
  written.push(p);
}
// GitHub Pages serves 404.html for unknown paths; it renders the not-found page and the app takes over.
fs.writeFileSync(path.join(dist, '404.html'), page('/__not-found__'));

const indexable = written.filter((p) => pageMeta(matchRoute(p)).index);
const today = new Date().toISOString().slice(0, 10);
if (siteUrl) {
  const urls = indexable.map((p) => `  <url><loc>${esc(pageUrl(p))}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);

fs.writeFileSync(
  path.join(dist, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'NetWorth — take-home pay calculator',
      short_name: 'NetWorth',
      description: 'Know what your salary is actually worth: take-home pay after tax, compared across countries and currencies.',
      start_url: `${base}calculator/`,
      scope: base,
      display: 'standalone',
      background_color: '#090d14',
      theme_color: '#090d14',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ),
);

// Service worker: precache the pages and the app shell so the calculator works offline.
// Exchange rates are NOT cached here — the app keeps its own dated rate cache and labels it.
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else files.push(path.relative(dist, full).split(path.sep).join('/'));
  }
};
walk(dist);
const precache = files
  .filter((f) => /(^|\/)index\.html$/.test(f) || /\.(js|css|svg|webmanifest)$/.test(f) || /latin-(wght|400|500)-normal[^/]*\.woff2$/.test(f) || /^icon-192\.png$/.test(f))
  .filter((f) => f !== 'sw.js')
  .map((f) => base + f.replace(/(^|\/)index\.html$/, '$1'));
const version = createHash('sha256').update(precache.join('\n') + files.length).digest('hex').slice(0, 12);
const sw = fs.readFileSync(path.join(root, 'scripts', 'sw-template.js'), 'utf8').replace('__VERSION__', version).replace('__BASE__', base).replace('__PRECACHE__', JSON.stringify(precache));
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

console.log(`Pre-rendered ${written.length} pages + 404 (base ${base}${siteUrl ? `, site ${siteUrl}` : ', no SITE_URL: canonical/sitemap omitted'}); precached ${precache.length} files.`);
