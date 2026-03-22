#!/usr/bin/env node
/**
 * Minimal static file server. No dependencies — Node built-ins only.
 *
 * Usage:
 *   node scripts/serve.js [dir] [port]
 *
 * Defaults: dir = dist, port = 3069
 *
 * Examples:
 *   node scripts/serve.js               → serves ./dist on :3069
 *   node scripts/serve.js dist 8090     → serves ./dist on :8090
 *   node scripts/serve.js . 3069        → serves project root on :3069 (legacy)
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const args    = process.argv.slice(2);
const dirArg  = args.find(a => isNaN(a));
const portArg = args.find(a => !isNaN(a) && a !== '');
const PORT    = parseInt(portArg || '3069', 10);
const ROOT    = path.resolve(dirArg || 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'text/javascript; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.png' : 'image/png',
  '.txt' : 'text/plain; charset=utf-8',
  '.md'  : 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback — serve index.html so HashRouter can handle the route
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
      } else {
        res.writeHead(500); res.end('Server error');
      }
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nClaude Exam Guide`);
  console.log(`─────────────────`);
  console.log(`Serving: ${ROOT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});
