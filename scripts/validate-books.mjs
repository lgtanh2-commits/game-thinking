#!/usr/bin/env node
/**
 * Validate sách trong Books/ trước khi cho merge PR.
 *
 * Mặc định: chỉ kiểm các sách có file thay đổi trong PR (so với base ref),
 * dùng git diff — không hồi tố lỗi ở sách cũ chưa đổi gì. Truyền --all để
 * kiểm toàn bộ (hữu ích khi chạy tay/local sau khi vừa migrate).
 *
 * Usage:
 *   node scripts/validate-books.mjs --base origin/main
 *   node scripts/validate-books.mjs --all
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const allMode = args.includes('--all');
const baseIdx = args.indexOf('--base');
const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : 'origin/main';

const errors = [];

function annotate(file, message) {
  // GitHub Actions annotation format — hiện lỗi trực tiếp trên tab
  // "Files changed" của PR. Chạy local thì chỉ in ra dạng thường.
  const inCI = !!process.env.GITHUB_ACTIONS;
  if (inCI) {
    console.log(`::error file=${file}::${message}`);
  } else {
    console.error(`  [${file}] ${message}`);
  }
  errors.push({ file, message });
}

function findAllBookFolders() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name.normalize('NFC'))
    .filter((name) => fs.existsSync(path.join(ROOT, name, 'meta.json')));
}

function changedBookFolders() {
  let changedFiles;
  try {
    // 3 nguồn gộp lại: (1) diff giữa base và HEAD (trường hợp CI — PR đã
    // commit đầy đủ), (2) working tree vs HEAD (staged+unstaged, tiện khi
    // test tay local trước khi commit), (3) file mới chưa track.
    const fromBase = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`, '--', '.'], { cwd: ROOT, encoding: 'utf8' });
    const fromWorkingTree = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', '.'], { cwd: ROOT, encoding: 'utf8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', '.'], { cwd: ROOT, encoding: 'utf8' });
    changedFiles = [...new Set([...fromBase.split('\n'), ...fromWorkingTree.split('\n'), ...untracked.split('\n')])];
  } catch (err) {
    console.error(`Không chạy được "git diff" với base "${baseRef}":`, err.message);
    console.error('Fallback: kiểm toàn bộ sách (--all).');
    return { folders: findAllBookFolders(), changedHtmlFiles: null };
  }
  changedFiles = changedFiles.filter(Boolean).map((f) => f.normalize('NFC'));
  const folderSet = new Set();
  const changedHtmlFiles = new Set();
  for (const f of changedFiles) {
    const parts = f.split('/');
    if (parts.length < 2) continue; // file ở root (index.html, CONTRIBUTING.md...) — bỏ qua
    const folder = parts[0];
    if (fs.existsSync(path.join(ROOT, folder, 'meta.json'))) {
      folderSet.add(folder);
      if (f.endsWith('.html')) changedHtmlFiles.add(f);
    }
  }
  return { folders: [...folderSet], changedHtmlFiles };
}

function loadMeta(folder) {
  const metaPath = path.join(ROOT, folder, 'meta.json');
  let raw;
  try {
    raw = fs.readFileSync(metaPath, 'utf8');
  } catch {
    annotate(`${folder}/meta.json`, 'Không đọc được file (thiếu?).');
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    annotate(`${folder}/meta.json`, `JSON không hợp lệ: ${err.message}`);
    return null;
  }
}

const VALID_CATEGORIES = ['BFSI', 'UX/UI', 'Game Design', 'Product Management'];

function validateMetaShape(folder, meta) {
  const relFile = `${folder}/meta.json`;
  const requiredFields = ['slug', 'title', 'author', 'tag', 'category', 'chapters'];
  for (const field of requiredFields) {
    if (!(field in meta)) {
      annotate(relFile, `Thiếu field bắt buộc "${field}".`);
    }
  }
  if (typeof meta.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) {
    annotate(relFile, `"slug" phải là kebab-case (a-z, 0-9, dấu -). Giá trị hiện tại: ${JSON.stringify(meta.slug)}`);
  }
  for (const field of ['title', 'author', 'tag']) {
    if (meta[field] !== undefined && (typeof meta[field] !== 'string' || meta[field].trim() === '')) {
      annotate(relFile, `"${field}" phải là chuỗi không rỗng.`);
    }
  }
  if (meta.category !== undefined && !VALID_CATEGORIES.includes(meta.category)) {
    annotate(relFile, `"category" phải là 1 trong: ${VALID_CATEGORIES.join(', ')}. Giá trị hiện tại: ${JSON.stringify(meta.category)}`);
  }
  if (!Array.isArray(meta.chapters) || meta.chapters.length === 0) {
    annotate(relFile, '"chapters" phải là mảng có ít nhất 1 phần tử.');
    return;
  }
  const seenChapterSlugs = new Set();
  meta.chapters.forEach((c, i) => {
    const ctx = `${relFile} chapters[${i}]`;
    if (typeof c.n !== 'number') annotate(ctx, '"n" phải là số.');
    if (typeof c.title !== 'string' || c.title.trim() === '') annotate(ctx, '"title" phải là chuỗi không rỗng.');
    if (typeof c.sub !== 'string') annotate(ctx, '"sub" phải là chuỗi (có thể rỗng "").');
    if (typeof c.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) {
      annotate(ctx, `"slug" phải là kebab-case (a-z, 0-9, dấu -), dùng cho URL /${meta.slug}/{slug}. Giá trị hiện tại: ${JSON.stringify(c.slug)}`);
    } else if (seenChapterSlugs.has(c.slug)) {
      annotate(ctx, `"slug" chương bị trùng trong cùng sách: "${c.slug}"`);
    } else {
      seenChapterSlugs.add(c.slug);
    }
    if (typeof c.file !== 'string' || c.file.trim() === '') {
      annotate(ctx, '"file" phải là chuỗi không rỗng.');
      return;
    }
    if (c.file.includes('../')) {
      annotate(ctx, `"file" không được chứa "../" (không trỏ ra ngoài folder sách): ${c.file}`);
      return;
    }
    const chapterPath = path.join(ROOT, folder, c.file);
    if (!fs.existsSync(chapterPath)) {
      annotate(ctx, `File chương không tồn tại: ${folder}/${c.file}`);
    }
  });
}

function validateChapterHtml(relPath) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) return; // đã báo lỗi ở validateMetaShape nếu thiếu
  const html = fs.readFileSync(absPath, 'utf8');
  if (html.trim().length === 0) {
    annotate(relPath, 'File rỗng.');
    return;
  }
  if (!/<\/body>\s*<\/html>\s*$/i.test(html.trim())) {
    annotate(relPath, 'File không kết thúc bằng </body></html> — có thể bị cắt cụt.');
  }
  const hasBookTopline = /<p\s+class="book-topline">\s*<a\s+href="[^"]+"/i.test(html);
  if (!hasBookTopline) {
    annotate(relPath, 'Thiếu <p class="book-topline"><a href="...">...</a></p> (link quay về mục lục) — xem templates/chapter-template.html.');
  }
  const chapnavMatch = html.match(/<nav\s+class="chapnav">([\s\S]*?)<\/nav>/i);
  if (!chapnavMatch) {
    annotate(relPath, 'Thiếu <nav class="chapnav">...</nav> ở cuối chương.');
  } else if (!/<a\s+href="[^"]+"/i.test(chapnavMatch[1])) {
    annotate(relPath, '<nav class="chapnav"> không chứa link <a href="..."> nào thật (chỉ có span giả?).');
  }
}

function checkSlugUniqueness(allFolders) {
  const slugToFolders = new Map();
  for (const folder of allFolders) {
    const meta = loadMeta(folder);
    if (!meta || typeof meta.slug !== 'string') continue;
    if (!slugToFolders.has(meta.slug)) slugToFolders.set(meta.slug, []);
    slugToFolders.get(meta.slug).push(folder);
  }
  for (const [slug, folders] of slugToFolders) {
    if (folders.length > 1) {
      for (const folder of folders) {
        annotate(`${folder}/meta.json`, `slug "${slug}" bị trùng với: ${folders.filter((f) => f !== folder).join(', ')}`);
      }
    }
  }
}

function main() {
  const allFolders = findAllBookFolders();
  console.log(`Tổng số sách trong repo: ${allFolders.length}`);

  // Check trùng slug luôn chạy trên TOÀN BỘ cây (nguồn sự thật luôn là toàn
  // bộ tập meta.json hiện có), không chỉ sách đổi trong PR.
  checkSlugUniqueness(allFolders);

  let targetFolders;
  let changedHtmlFiles;
  if (allMode) {
    targetFolders = allFolders;
    changedHtmlFiles = null; // null = kiểm HTML của mọi chương trong các folder target
    console.log('Chế độ --all: kiểm toàn bộ sách.');
  } else {
    const result = changedBookFolders();
    targetFolders = result.folders;
    changedHtmlFiles = result.changedHtmlFiles;
    console.log(`Sách thay đổi trong PR (so với ${baseRef}): ${targetFolders.length ? targetFolders.join(', ') : '(không có)'}`);
  }

  for (const folder of targetFolders) {
    const meta = loadMeta(folder);
    if (!meta) continue;
    validateMetaShape(folder, meta);

    // Chỉ check nội dung HTML của các file THỰC SỰ đổi trong PR (grandfather
    // clause — sách cũ có thể chưa theo đúng convention book-topline/chapnav
    // và không nên bị fail hồi tố). --all thì check hết mọi chương.
    if (Array.isArray(meta.chapters)) {
      for (const c of meta.chapters) {
        if (typeof c.file !== 'string') continue;
        const relPath = `${folder}/${c.file}`;
        if (changedHtmlFiles === null || changedHtmlFiles.has(relPath)) {
          validateChapterHtml(relPath);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} lỗi. PR không thể merge cho tới khi sửa hết.`);
    process.exit(1);
  }
  console.log('\n✅ Không phát hiện lỗi.');
}

main();
