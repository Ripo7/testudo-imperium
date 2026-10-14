// Shared helpers for the browser tests and tools: serve dist/, launch headless Chromium with software WebGL.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

/** Serve a directory (dist/ by default) on a free port. */
export function serve(dir = path.join(ROOT, 'dist')) {
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`${dir}/index.html is missing: run "npm run build" first`);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, url === '/' ? 'index.html' : url);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

/** Headless Chromium with software WebGL (works on CI machines without a GPU). */
export function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** Open the game with its test hook (window.__T) and wait until a map exists. */
export async function openGame(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1000, height: 640 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'test', { timeout: 120000 });
  await page.waitForFunction(() => window.__T && window.__T.MAP, null, { timeout: 120000 });
  return { ctx, page, errors };
}

/** Replace Math.random in the page with a seeded generator, so two runs make the same choices. */
export const SEED_RANDOM = `(seed) => { let s = seed >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }`;

let failures = 0;
export function check(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; return cond; }
export const failed = () => failures;

/** Run a function given as source text in the page (keeps long scenarios readable as strings). */
export const run = (page, fnSource, arg) => page.evaluate(([src, a]) => (0, eval)('(' + src + ')')(a), [fnSource, arg]);
