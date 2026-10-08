// Tiny static file server for docs/ so screenshots can be viewed in a browser.
// Usage: node scripts/serve-docs.mjs [port]   (default 4173)
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const port = Number(process.argv[2]) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`docs server on http://127.0.0.1:${port}/screenshots/`));
