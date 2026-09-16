#!/usr/bin/env node
/**
 * Quét toàn bộ chương HTML trong Books/, kiểm mọi href nội bộ (không phải
 * #anchor, http(s):, mailto:) có thực sự trỏ tới đích tồn tại không —
 * hoặc là file thật trên đĩa, hoặc là URL sạch khớp 1 dòng trong
 * `_redirects` (tự sinh bởi generate-redirects.mjs). Chạy tay sau khi sửa
 * hàng loạt file để chắc không phát sinh link gãy.
 *
 * Usage: node scripts/check-links.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadRedirectSources() {
  const file = path.join(ROOT, '_redirects');
  if (!fs.existsSync(file)) return new Set();
  const sources = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => decodeURIComponent(l.split(/\s+/)[0]));
  return new Set(sources);
}

const redirectSources = loadRedirectSources();

function findBookFolders() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'meta.json')));
}

function findHtmlFiles(folder) {
  const dir = path.join(ROOT, folder);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
}

const folders = findBookFolders();
let totalFiles = 0;
let totalIssues = 0;

for (const folder of folders) {
  const htmlFiles = findHtmlFiles(folder);
  for (const file of htmlFiles) {
    totalFiles++;
    const filePath = path.join(ROOT, folder, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const hrefRe = /href="([^"]+)"/g;
    let m;
    const issuesInFile = [];
    while ((m = hrefRe.exec(html))) {
      const href = m[1];
      if (href.startsWith('#')) continue;
      if (/^[a-z]+:/i.test(href)) continue; // http:, https:, mailto:, etc.
      if (href.startsWith('//')) continue;
      // Strip hash fragment để lấy phần trỏ tới file, vd /the-mom-test#anchor
      const [targetPart] = href.split('#');
      if (targetPart === '') continue; // pure #hash đã bỏ qua ở trên, phòng hờ

      // URL sạch dạng /{book-slug} hoặc /{book-slug}/{chapter-slug} — không
      // trỏ tới file vật lý nào, chỉ hợp lệ qua _redirects. "/" là root,
      // luôn phục vụ index.html mặc định, không cần dòng _redirects riêng.
      if (targetPart.startsWith('/')) {
        if (targetPart !== '/' && !redirectSources.has(decodeURIComponent(targetPart))) {
          issuesInFile.push({ href, resolved: `_redirects thiếu dòng cho ${targetPart}` });
        }
        continue;
      }

      const resolved = path.resolve(path.dirname(filePath), targetPart);
      // Link không đuôi .html — Cloudflare Pages + dev-server.mjs đều tự
      // khớp {path}.html, nên thử thêm đuôi trước khi báo lỗi.
      const existsDirect = fs.existsSync(resolved);
      const existsAsHtml = !existsDirect && !resolved.endsWith('.html') && fs.existsSync(resolved + '.html');
      if (!existsDirect && !existsAsHtml) {
        issuesInFile.push({ href, resolved: path.relative(ROOT, resolved) });
      }
    }
    if (issuesInFile.length > 0) {
      totalIssues += issuesInFile.length;
      console.log(`\n[${folder}/${file}]`);
      for (const issue of issuesInFile) {
        console.log(`  href="${issue.href}" -> KHÔNG tồn tại: ${issue.resolved}`);
      }
    }
  }
}

console.log(`\n---`);
console.log(`Quét ${totalFiles} file HTML trong ${folders.length} sách.`);
console.log(totalIssues === 0 ? '✅ Không phát hiện link nội bộ nào bị lỗi.' : `❌ ${totalIssues} link lỗi.`);
if (totalIssues > 0) process.exit(1);
