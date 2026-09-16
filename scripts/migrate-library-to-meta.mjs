#!/usr/bin/env node
/**
 * Migration 1-lần: trích mảng `const LIBRARY = [...]` đang hand-edit trong
 * index.html, ghi ra 1 file Books/{folder}/meta.json cho mỗi sách, và sinh
 * Books/manifest.json (danh sách folder, sort A-Z).
 *
 * Không đụng gì tới index.html (refactor sang fetch() là bước riêng, sau khi
 * script này verify PASS). Chạy 1 lần, an toàn để chạy lại (idempotent —
 * ghi đè cùng nội dung nếu chạy lần nữa mà LIBRARY chưa đổi).
 *
 * Usage: node scripts/migrate-library-to-meta.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // .../02 - Output/Books
const INDEX_HTML = path.join(ROOT, 'index.html');
const BOOKS_DIR = ROOT;

// Sách duy nhất không nằm trong subfolder riêng (file cũ, trước khi có quy ước
// nav book-topline/chapnav). Dời vào 1 subfolder = tên slug để glob
// Books/*/meta.json bắt được nó.
const SPECIAL_CASE_SLUG = 'game-thinking-blueprint';

function extractLibraryArray(html) {
  const startMarker = 'const LIBRARY = [';
  const startIdx = html.indexOf(startMarker);
  assert.ok(startIdx !== -1, 'Không tìm thấy "const LIBRARY = [" trong index.html');

  // Đếm độ sâu ngoặc vuông để tìm đúng "];" đóng mảng (không dùng regex vì
  // nội dung chứa chuỗi có thể chứa ký tự ] bên trong).
  const arrayStart = startIdx + 'const LIBRARY = '.length; // trỏ vào ký tự '['
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let stringChar = '';
  for (let i = arrayStart; i < html.length; i++) {
    const c = html[i];
    const prev = html[i - 1];
    if (inString) {
      if (c === stringChar && prev !== '\\') inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  assert.ok(endIdx !== -1, 'Không tìm thấy dấu ] đóng mảng LIBRARY');

  const snippet = html.slice(arrayStart, endIdx + 1);
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return (${snippet});`)();
  assert.ok(Array.isArray(arr) && arr.length > 0, 'LIBRARY trích ra rỗng hoặc không phải mảng');
  return arr;
}

function main() {
  console.log('== Bước 1: đọc index.html, trích LIBRARY ==');
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const rawLibrary = extractLibraryArray(html);
  // Normalize qua JSON để chắc chắn chỉ còn data JSON-safe (loại bỏ mọi thứ
  // không phải string/number/array/object nếu lỡ có).
  const library = JSON.parse(JSON.stringify(rawLibrary));
  console.log(`  Trích được ${library.length} sách.`);

  console.log('\n== Bước 2: xử lý case đặc biệt (game-thinking-blueprint) ==');
  const specialEntry = library.find((b) => b.slug === SPECIAL_CASE_SLUG);
  if (specialEntry) {
    assert.equal(specialEntry.chapters.length, 1, `${SPECIAL_CASE_SLUG} phải chỉ có 1 chapter`);
    const oldRelPath = specialEntry.chapters[0].file; // 'game-thinking-blueprint.html'
    const oldAbsPath = path.join(BOOKS_DIR, oldRelPath);
    const newFolder = SPECIAL_CASE_SLUG;
    const newAbsDir = path.join(BOOKS_DIR, newFolder);
    const newAbsPath = path.join(newAbsDir, path.basename(oldRelPath));

    assert.ok(fs.existsSync(oldAbsPath), `Không tìm thấy file gốc: ${oldAbsPath}`);
    if (!fs.existsSync(newAbsPath)) {
      fs.mkdirSync(newAbsDir, { recursive: true });
      fs.renameSync(oldAbsPath, newAbsPath);
      console.log(`  Đã dời: ${oldRelPath} -> ${newFolder}/${path.basename(oldRelPath)}`);
    } else {
      console.log(`  (Đã dời từ trước, bỏ qua) ${newFolder}/${path.basename(oldRelPath)}`);
    }
    // Cập nhật lại data trong bộ nhớ để bước 3 dùng đúng path mới.
    specialEntry.chapters[0].file = path.basename(oldRelPath);
    specialEntry.__folder = newFolder;
  } else {
    console.log(`  Không tìm thấy entry slug="${SPECIAL_CASE_SLUG}" — bỏ qua bước này.`);
  }

  console.log('\n== Bước 3: xác định folder + ghi meta.json cho từng sách ==');
  const folders = [];
  for (const book of library) {
    let folder = book.__folder;
    delete book.__folder;
    if (!folder) {
      const dirnames = new Set(book.chapters.map((c) => path.dirname(c.file)));
      assert.equal(
        dirnames.size,
        1,
        `Sách "${book.slug}" có chapters nằm ở nhiều folder khác nhau: ${[...dirnames].join(', ')}`,
      );
      folder = [...dirnames][0];
      assert.notEqual(folder, '.', `Sách "${book.slug}" có file nằm thẳng trong Books/ (không subfolder) — cần xử lý case đặc biệt như game-thinking-blueprint`);
    }

    // meta.json lưu `file` KHÔNG kèm path folder (đã ở trong đúng folder sách,
    // theo schema đã ghi trong CONTRIBUTING.md).
    const chapters = book.chapters.map((c) => ({
      n: c.n,
      title: c.title,
      sub: c.sub ?? '',
      file: path.basename(c.file),
    }));

    const meta = {
      slug: book.slug,
      title: book.title,
      author: book.author,
      tag: book.tag,
      chapters,
    };

    const metaPath = path.join(BOOKS_DIR, folder, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    console.log(`  ${folder}/meta.json  (slug=${book.slug}, ${chapters.length} chương)`);
    folders.push(folder);
  }

  console.log('\n== Bước 4: sinh Books/manifest.json ==');
  const sortedFolders = [...new Set(folders)].sort((a, b) => a.localeCompare(b, 'vi'));
  const manifestPath = path.join(BOOKS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(sortedFolders, null, 2) + '\n', 'utf8');
  console.log(`  manifest.json: ${sortedFolders.length} folder.`);

  console.log('\n== Bước 5: verify — đọc lại từ đĩa, so khớp với dữ liệu gốc ==');
  const rereadManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rebuilt = rereadManifest.map((folder) => {
    const meta = JSON.parse(fs.readFileSync(path.join(BOOKS_DIR, folder, 'meta.json'), 'utf8'));
    return { folder, meta };
  });

  const originalBySlug = new Map(library.map((b) => [b.slug, b]));
  const rebuiltBySlug = new Map(rebuilt.map((r) => [r.meta.slug, r]));

  let ok = true;
  assert.equal(originalBySlug.size, rebuiltBySlug.size, 'Số lượng sách gốc và sau khi rebuild không khớp');

  for (const [slug, original] of originalBySlug) {
    const r = rebuiltBySlug.get(slug);
    if (!r) { console.error(`  MISMATCH: sách "${slug}" không thấy sau khi rebuild`); ok = false; continue; }
    const expectedChapters = original.chapters.map((c) => ({
      n: c.n, title: c.title, sub: c.sub ?? '', file: path.basename(c.file),
    }));
    const originalNormalized = { slug: original.slug, title: original.title, author: original.author, tag: original.tag, chapters: expectedChapters };
    const rebuiltNormalized = { slug: r.meta.slug, title: r.meta.title, author: r.meta.author, tag: r.meta.tag, chapters: r.meta.chapters };
    const a = JSON.stringify(originalNormalized);
    const b = JSON.stringify(rebuiltNormalized);
    if (a !== b) {
      console.error(`  MISMATCH slug="${slug}":`);
      console.error(`    original: ${a}`);
      console.error(`    rebuilt : ${b}`);
      ok = false;
    }
  }

  if (!ok) {
    console.error('\n❌ VERIFY FAILED — có sai lệch giữa dữ liệu gốc và file đã ghi. KHÔNG đi tiếp bước sau.');
    process.exit(1);
  }

  console.log(`\n✅ VERIFY PASS — ${originalBySlug.size} sách khớp tuyệt đối giữa LIBRARY gốc và meta.json/manifest.json vừa sinh.`);
  console.log('index.html CHƯA bị đụng tới (refactor sang fetch() là bước riêng).');
}

main();
