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
  const size = statSync(filePath).size;
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  // Range support so <video> can seek (e.g. product-tour.mp4)
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
      if (start === null) { start = size - end; end = size - 1; }
      if (start >= 0 && start <= end) {
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`docs server on http://127.0.0.1:${port}/screenshots/`));
