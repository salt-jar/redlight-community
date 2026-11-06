import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { badRequest } from '../utils/errors.js';

const EXECUTABLE_EXT = /\.(exe|sh|bat|cmd|ps1|com|scr|msi|dll|vbs|wsf|jar|jsp|php|asp|aspx)$/i;
const BOOK_EXT = /\.(pdf|epub)$/i;

function isSymlink(entry) {
  // Unix mode 存储在 attr 高 16 位；S_IFLNK = 0o120000
  const mode = (entry.header.attr >>> 16) & 0o170000;
  return mode === 0o120000;
}

function normalizeEntryName(entryName) {
  return String(entryName || '').replace(/\\/g, '/');
}

/**
 * 校验并安全解压图书 ZIP。
 * 防御：路径穿越、绝对路径、符号链接、可执行文件、条目数/解压体积阈值、zip bomb 压缩比。
 * @returns {{ bookFile: string, format: string, entries: number, uncompressedSize: number }}
 */
export function extractBookArchive({ zipPath, extractDir, config }) {
  const zipSize = fs.statSync(zipPath).size;
  if (zipSize <= 0) throw badRequest('上传的 ZIP 文件为空');
  if (zipSize > config.limits.zipSize) throw badRequest('图书压缩包不能超过 100MB');

  const fd = fs.openSync(zipPath, 'r');
  const magic = Buffer.alloc(4);
  fs.readSync(fd, magic, 0, 4, 0);
  fs.closeSync(fd);
  if (magic[0] !== 0x50 || magic[1] !== 0x4b || !((magic[2] === 0x03 && magic[3] === 0x04) || (magic[2] === 0x05 && magic[3] === 0x06))) {
    throw badRequest('文件不是有效的 ZIP 压缩包');
  }

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw badRequest('ZIP 压缩包已损坏，无法解析');
  }

  const entries = zip.getEntries();
  if (entries.length === 0) throw badRequest('ZIP 压缩包为空');
  if (entries.length > config.limits.zipEntries) {
    throw badRequest(`ZIP 内文件数量超过上限（${config.limits.zipEntries} 个）`);
  }

  let declaredSize = 0;
  for (const entry of entries) {
    const name = normalizeEntryName(entry.entryName);
    if (!name || name === '/') continue;
    if (name.includes('\0')) throw badRequest('ZIP 内包含非法文件名');
    if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) {
      throw badRequest(`ZIP 内包含路径穿越条目，已拒绝：${name}`);
    }
    if (isSymlink(entry)) throw badRequest(`ZIP 内包含符号链接，已拒绝：${name}`);
    if (EXECUTABLE_EXT.test(name)) throw badRequest(`ZIP 内包含可执行文件，已拒绝：${name}`);
    if (!entry.isDirectory) declaredSize += Number(entry.header.size) || 0;
  }

  if (declaredSize > config.limits.zipUncompressed) {
    throw badRequest('ZIP 解压后的总体积超过 500MB 上限');
  }
  if (declaredSize > zipSize * 200 && declaredSize > 50 * 1024 * 1024) {
    throw badRequest('ZIP 压缩比异常，疑似 zip bomb，已拒绝');
  }

  const root = path.resolve(extractDir);
  fs.mkdirSync(root, { recursive: true });
  let written = 0;

  for (const entry of entries) {
    const name = normalizeEntryName(entry.entryName);
    if (!name || name === '/') continue;
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw badRequest(`ZIP 解压路径非法：${name}`);
    }
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    const data = entry.getData();
    written += data.length;
    if (written > config.limits.zipUncompressed) {
      throw badRequest('ZIP 解压后的总体积超过 500MB 上限');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { mode: 0o644 });
  }

  const bookFile = findBookFile(root);
  if (!bookFile) {
    throw badRequest('ZIP 内未找到 PDF 或 EPUB 文件');
  }
  return {
    bookFile,
    format: path.extname(bookFile).slice(1).toLowerCase(),
    entries: entries.length,
    uncompressedSize: written,
  };
}

/** 递归查找首个 PDF/EPUB（忽略 __MACOSX 与隐藏文件，路径排序保证结果稳定） */
export function findBookFile(dir) {
  const found = [];
  const walk = (current) => {
    const items = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      if (item.name === '__MACOSX') continue;
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.isFile() && BOOK_EXT.test(item.name) && fs.statSync(full).size > 0) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found[0] || null;
}

/** 递归删除目录，失败时静默（用于上传失败后的清理） */
export function removeDirQuietly(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响主流程返回的错误
  }
}
