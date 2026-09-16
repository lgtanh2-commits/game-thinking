#!/usr/bin/env node
/**
 * Sinh file `_redirects` (Cloudflare Pages đọc tự động) ánh xạ URL sạch
 * sang file vật lý thật — KHÔNG đổi tên folder/file trên đĩa:
 *   /{book-slug}                    -> /index.html          (200, rewrite)
 *   /{book-slug}/{chapter-slug}     -> /{folder}/{file}      (200, rewrite)
 *
 * "200" nghĩa là rewrite (URL trên thanh địa chỉ giữ nguyên, chỉ đổi nội
 * dung phục vụ) — khác với redirect chuyển hướng thật (301/308).
 *
 * Chạy bởi GitHub Action `regenerate-manifest.yml` cùng lúc với
 * generate-manifest.mjs sau mỗi lần merge — không tay sửa `_redirects`.
 *
 * Usage: node scripts/generate-redirects.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function findBookFolders() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name.normalize('NFC'))
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'meta.json')))
    .sort((a, b) => a.localeCompare(b, 'vi'));
}

function main() {
  const lines = [
    '# File này TỰ SINH bởi scripts/generate-redirects.mjs — ĐỪNG tay sửa.',
    '# Ánh xạ URL sạch /{book-slug}/{chapter-slug} sang file vật lý thật.',
    '',
  ];

  for (const folder of findBookFolders()) {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, folder, 'meta.json'), 'utf8'));
    // Đích KHÔNG được kèm .html/index.html — Cloudflare Pages tự chuẩn hoá
    // (strip .html, quy index.html về "/") RỒI MỚI áp status code, nên đích
    // có .html sẽ biến rewrite "200" thành redirect 308 sai ý muốn. Dùng
    // "/" (đã tự phục vụ index.html mặc định) và tên file không đuôi (đã
    // xác nhận Cloudflare tự khớp {path}.html khi không có đuôi).
    lines.push(`/${meta.slug} / 200`);
    for (const ch of meta.chapters) {
      const fileNoExt = ch.file.replace(/\.html$/, '');
      lines.push(`/${meta.slug}/${ch.slug} /${encodeURI(folder)}/${encodeURI(fileNoExt)} 200`);
    }
  }

  const content = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, '_redirects'), content, 'utf8');
  console.log(`Đã sinh _redirects: ${lines.length - 3} dòng ánh xạ.`);
}

main();
