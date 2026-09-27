#!/usr/bin/env node
// Minimal static server for local review (standard library only). Serves the repository root so the site
// can link receipts in ../benchmark-package/ in place, bound to 127.0.0.1 only.
//
//   node site/scripts/serve.mjs [port]      then open http://127.0.0.1:8000/site/
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = +(process.argv[2] || process.env.PORT || 8000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip', '.sh': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8' };

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/site/' }); return res.end(); }
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403); return res.end('forbidden'); }
  let target = file;
  try { if (statSync(target).isDirectory()) target = join(target, 'index.html'); statSync(target); }
  catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
  const name = target.split(sep).pop();
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || (name === 'SHA256SUMS' ? 'text/plain; charset=utf-8' : 'application/octet-stream'), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  createReadStream(target).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => console.log(`RiNGSiDE review site: http://127.0.0.1:${PORT}/site/  (Ctrl+C to stop)`));
