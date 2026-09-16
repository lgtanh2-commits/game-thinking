#!/usr/bin/env node
/**
 * Local dev server mô phỏng cách Cloudflare Pages phục vụ static asset:
 * URL không có đuôi .html sẽ tự khớp file {path}.html nếu tồn tại (đúng
 * hành vi "html_handling: auto-trailing-slash" mặc định của Cloudflare
 * Pages — đã xác nhận qua production: request .html trực tiếp bị 308
 * redirect sang bản không đuôi, request bản không đuôi trả 200 thẳng).
 * Dùng thay cho `python3 -m http.server` để test local giống hệt production
 * — nếu không, link nội bộ (đã bỏ .html) sẽ 404 khi chạy python http.server.
 *
 * Usage: node scripts/dev-server.mjs [port]   (mặc định 8000)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 8000;

// Đọc _redirects (tự sinh bởi generate-redirects.mjs) — chỉ hỗ trợ các dòng
// dạng "source destination 200" (rewrite) mà site này dùng, đủ để test local
// khớp hành vi Cloudflare Pages, không cần implement toàn bộ spec _redirects.
function loadRedirectRules() {
  const file = path.join(ROOT, '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const parts = l.split(/\s+/);
      return { source: parts[0], destination: parts[1], status: parts[2] || '301' };
    });
}

const redirectRules = loadRedirectRules();

function matchRedirect(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  for (const rule of redirectRules) {
    if (decodeURIComponent(rule.source) === decodedPath) return rule;
  }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = decoded.replace(/^\/+/, '') || 'index.html';
  const direct = path.resolve(ROOT, rel);

  // Chặn path traversal ra ngoài ROOT.
  if (!direct.startsWith(ROOT)) return null;

  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;

  const withHtml = direct + '.html';
  if (fs.existsSync(withHtml)) return withHtml;

  const indexInDir = path.join(direct, 'index.html');
  if (fs.existsSync(indexInDir)) return indexInDir;

  return null;
}

const server = http.createServer((req, res) => {
  const rule = matchRedirect(req.url);
  const lookupUrl = rule && rule.status === '200' ? rule.destination : req.url;
  const file = resolveFile(lookupUrl);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + req.url);
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Dev server (mô phỏng Cloudflare Pages clean URL): http://localhost:${PORT}/`);
});
