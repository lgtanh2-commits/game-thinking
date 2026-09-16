#!/usr/bin/env node
/**
 * Quét toàn bộ folder con của Books/ có chứa file meta.json, sinh lại
 * Books/manifest.json (mảng tên folder, sort A-Z). Chạy bởi GitHub Action
 * `regenerate-manifest.yml` sau mỗi lần merge vào main — không tay sửa
 * manifest.json.
 *
 * Usage: node scripts/generate-manifest.mjs
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
    .map((d) => d.name)
    // Quan trọng: macOS (APFS) trả tên file/folder tiếng Việt dạng Unicode
    // NFD (decomposed) qua readdirSync dù git track dạng NFC (precomposed).
    // Chạy script này trên máy Mac sẽ ra chuỗi khác byte so với path git
    // thật -> fetch() 404 khi deploy (Linux không tự normalize như macOS).
    // Luôn ép về NFC để nhất quán, bất kể chạy trên OS nào (CI Linux hay máy Mac).
    .map((name) => name.normalize('NFC'))
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'meta.json')))
    .sort((a, b) => a.localeCompare(b, 'vi'));
}

function main() {
  const folders = findBookFolders();
  const manifestPath = path.join(ROOT, 'manifest.json');
  const content = JSON.stringify(folders, null, 2) + '\n';
  fs.writeFileSync(manifestPath, content, 'utf8');
  console.log(`Đã sinh manifest.json: ${folders.length} sách.`);
  for (const f of folders) console.log('  -', f);
}

main();
