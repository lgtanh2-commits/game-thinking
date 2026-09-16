#!/usr/bin/env node
/**
 * Chuyển 1 sách sang dùng chung assets/theme.css: chèn <link> theme.css vào
 * <head>, xoá các rule CSS trong <style> riêng của file đã trùng lặp với
 * theme.css (theo danh sách selector do người curate xác nhận), và đổi màu
 * hex cũ sang token mới (var(--color-...)) cho phần CSS đặc thù còn lại
 * (card/diagram/box riêng của sách).
 *
 * Không tự đoán rule nào "trùng" — removeSelectors và colorMap đều đọc từ
 * 1 file JSON cấu hình do người review sách đó soạn trước (xem
 * scripts/retheme-maps/{folder}.json làm ví dụ thật).
 *
 * An toàn nội dung (hard gate): toàn bộ phần từ <body> trở đi phải giữ
 * NGUYÊN VĂN, byte-for-byte, trước và sau khi sửa — script chỉ được đụng
 * <head> (chèn <link>) và nội dung trong <style>...</style>. Sai lệch dù 1
 * ký tự cũng abort, không ghi file nào trong lượt chạy đó.
 *
 * Usage:
 *   node scripts/retheme-chapter.mjs "<Tên Folder Sách>" scripts/retheme-maps/<file>.json [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => a !== '--dry-run');
const [folder, mapPath] = positional;

if (!folder || !mapPath) {
  console.error('Usage: node scripts/retheme-chapter.mjs "<Tên Folder Sách>" <map.json> [--dry-run]');
  process.exit(1);
}

const bookDir = path.join(ROOT, folder);
if (!fs.existsSync(path.join(bookDir, 'meta.json'))) {
  console.error(`Không tìm thấy meta.json trong: ${folder}`);
  process.exit(1);
}

const mapConfig = JSON.parse(fs.readFileSync(path.resolve(mapPath), 'utf8'));
const removeSelectors = new Set((mapConfig.removeSelectors || []).map(normalizeSelector));
const colorMap = mapConfig.colorMap || {};

function normalizeSelector(sel) {
  return sel.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Tách các rule top-level trong khối CSS (kể cả @media bọc nhiều rule con)
// bằng đếm độ sâu ngoặc {} — không dùng regex đơn thuần vì @media lồng nhau.
function splitTopLevelRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        rules.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start);
  return { rules, tail };
}

function ruleSelector(rule) {
  const idx = rule.indexOf('{');
  return normalizeSelector(rule.slice(0, idx));
}

function applyColorMap(text) {
  let out = text;
  let replacedCount = 0;
  for (const [from, to] of Object.entries(colorMap)) {
    const re = new RegExp(escapeRegExp(from), 'gi');
    const matches = out.match(re);
    if (matches) replacedCount += matches.length;
    out = out.replace(re, to);
  }
  return { out, replacedCount };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');

  const bodyIdx = original.search(/<body[\s>]/i);
  if (bodyIdx === -1) {
    return { file: filePath, skipped: true, reason: 'Không tìm thấy thẻ <body> — bỏ qua.' };
  }
  const headPart = original.slice(0, bodyIdx);
  const bodyPart = original.slice(bodyIdx);

  const styleMatch = headPart.match(/<style>([\s\S]*?)<\/style>/i);
  if (!styleMatch) {
    return { file: filePath, skipped: true, reason: 'Không tìm thấy <style> trong <head> — bỏ qua.' };
  }

  const { rules, tail } = splitTopLevelRules(styleMatch[1]);
  const keptRules = [];
  let removedCount = 0;
  for (const rule of rules) {
    if (removeSelectors.has(ruleSelector(rule))) {
      removedCount++;
      continue;
    }
    keptRules.push(rule);
  }

  const { out: newCssRules, replacedCount } = applyColorMap(keptRules.join('\n\n'));
  const newStyleBlock = `<style>\n${newCssRules}${tail.trim() ? '\n' + tail : ''}\n</style>`;

  let newHead = headPart.slice(0, styleMatch.index) + newStyleBlock + headPart.slice(styleMatch.index + styleMatch[0].length);

  // Chèn <link> theme.css trước <style> nếu chưa có sẵn.
  if (!/href="\.\.\/assets\/theme\.css"/.test(newHead)) {
    newHead = newHead.replace(/<style>/i, '<link rel="stylesheet" href="../assets/theme.css">\n<style>');
  }

  const newContent = newHead + bodyPart;

  // ── Hard gate: phần từ <body> trở đi phải NGUYÊN VĂN ──
  const afterBodyIdx = newContent.search(/<body[\s>]/i);
  const newBodyPart = newContent.slice(afterBodyIdx);
  if (newBodyPart !== bodyPart) {
    return { file: filePath, error: 'CONTENT MISMATCH — phần <body> bị đổi, huỷ ghi file này.' };
  }

  return { file: filePath, newContent, removedCount, replacedCount, unchanged: newContent === original };
}

function main() {
  // "files" (tuỳ chọn trong map JSON): giới hạn chỉ xử lý đúng danh sách tên
  // file này — dùng khi 1 sách trộn lẫn nhiều kiểu CSS gốc khác nhau giữa
  // các chương (mỗi nhóm cần 1 map riêng, không thể áp 1 map cho cả folder).
  const onlyFiles = mapConfig.files ? new Set(mapConfig.files) : null;
  const files = fs
    .readdirSync(bookDir)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !onlyFiles || onlyFiles.has(f))
    .map((f) => path.join(bookDir, f));

  console.log(`Sách: ${folder} — ${files.length} file HTML.`);
  console.log(`removeSelectors: ${removeSelectors.size} · colorMap: ${Object.keys(colorMap).length} màu${dryRun ? ' · [DRY RUN]' : ''}\n`);

  const results = files.map(processFile);
  let hasError = false;

  for (const r of results) {
    const rel = path.relative(ROOT, r.file);
    if (r.error) {
      hasError = true;
      console.error(`  ❌ ${rel}: ${r.error}`);
    } else if (r.skipped) {
      console.warn(`  ⚠️  ${rel}: ${r.reason}`);
    } else {
      console.log(`  ✓ ${rel} — xoá ${r.removedCount} rule trùng, thay ${r.replacedCount} chỗ màu${r.unchanged ? ' (không đổi gì)' : ''}`);
    }
  }

  if (hasError) {
    console.error('\n❌ Có file lỗi content-mismatch — KHÔNG ghi file nào trong lượt chạy này.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Không ghi file nào. Bỏ --dry-run để áp dụng thật.');
    return;
  }

  for (const r of results) {
    if (r.newContent && !r.unchanged) {
      fs.writeFileSync(r.file, r.newContent, 'utf8');
    }
  }
  console.log('\n✅ Đã ghi xong.');
}

main();
