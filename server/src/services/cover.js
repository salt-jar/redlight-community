import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

let pdfToolsPromise = null;

async function loadPdfTools() {
  if (!pdfToolsPromise) {
    pdfToolsPromise = (async () => {
      const canvas = await import('@napi-rs/canvas');
      // pdfjs 在 Node 端需要这几个 Web API 的 polyfill
      globalThis.DOMMatrix ??= canvas.DOMMatrix;
      globalThis.ImageData ??= canvas.ImageData;
      globalThis.Path2D ??= canvas.Path2D;
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      return { canvas, pdfjs };
    })();
  }
  return pdfToolsPromise;
}

/**
 * 尽力提取封面：PDF 渲染第 1 页为 PNG，EPUB 读取内置封面；
 * 任何失败都回退到占位封面，不阻断图书上架。
 * @returns {Promise<string>} 可直接访问的封面 URL
 */
export async function extractCover({ format, filePath, outDir, publicPrefix, config, logger = console }) {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    if (format === 'pdf') {
      const outFile = path.join(outDir, 'cover.png');
      await renderPdfCover(filePath, outFile, config.limits.coverWidth);
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        return `${publicPrefix}/cover.png`;
      }
    } else if (format === 'epub') {
      const coverFile = extractEpubCover(filePath, outDir);
      if (coverFile) return `${publicPrefix}/${path.basename(coverFile)}`;
    }
  } catch (error) {
    logger.warn(`[cover] 封面提取失败，使用占位封面：${error.message}`);
  }
  return config.placeholderCoverUrl;
}

async function renderPdfCover(filePath, outFile, maxWidth) {
  const { canvas: canvasLib, pdfjs } = await loadPdfTools();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.2, maxWidth / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = canvasLib.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const png = await canvas.encode('png');
    fs.writeFileSync(outFile, png);
  } finally {
    await doc.destroy();
  }
}

function readEntryText(zip, entryName) {
  const entry = zip.getEntry(entryName);
  return entry ? entry.getData().toString('utf8') : '';
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function resolveInside(baseDir, href) {
  const clean = decodeXml(href).split('#')[0];
  const resolved = path.posix.normalize(path.posix.join(baseDir, clean));
  return resolved.replace(/^\/+/, '');
}

function extractEpubCover(epubPath, outDir) {
  const zip = new AdmZip(epubPath);
  const container = readEntryText(zip, 'META-INF/container.xml');
  const rootMatch = container.match(/<rootfile\b[^>]*>/i);
  if (!rootMatch) return null;
  const opfPath = attr(rootMatch[0], 'full-path');
  if (!opfPath) return null;
  const opfText = readEntryText(zip, opfPath);
  if (!opfText) return null;
  const opfDir = path.posix.dirname(opfPath);
  const items = [...opfText.matchAll(/<item\b[^>]*>/gi)].map((match) => match[0]);

  let coverHref = '';
  const metaTags = [...opfText.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const coverMeta = metaTags.find((tag) => attr(tag, 'name').toLowerCase() === 'cover');
  if (coverMeta) {
    const coverId = attr(coverMeta, 'content');
    const item = items.find((tag) => attr(tag, 'id') === coverId);
    if (item) coverHref = attr(item, 'href');
  }
  if (!coverHref) {
    const item = items.find((tag) => /(^|\s)cover-image(\s|$)/i.test(attr(tag, 'properties')));
    if (item) coverHref = attr(item, 'href');
  }
  if (!coverHref) {
    const item = items.find((tag) => /cover/i.test(attr(tag, 'href')) && /image\//i.test(attr(tag, 'media-type')));
    if (item) coverHref = attr(item, 'href');
  }
  if (!coverHref) {
    const item = items.find((tag) => /image\//i.test(attr(tag, 'media-type')));
    if (item) coverHref = attr(item, 'href');
  }
  if (!coverHref) return null;

  const entryName = resolveInside(opfDir, coverHref);
  let entry = zip.getEntry(entryName);
  if (!entry) {
    const decoded = decodeURIComponent(entryName);
    entry = zip.getEntry(decoded);
  }
  if (!entry) return null;

  let ext = path.extname(entryName).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    ext = MIME_EXT[attr(items.find((tag) => attr(tag, 'href') === coverHref) || '', 'media-type')] || '.jpg';
  }
  const outFile = path.join(outDir, `cover${ext}`);
  fs.writeFileSync(outFile, entry.getData());
  return outFile;
}
