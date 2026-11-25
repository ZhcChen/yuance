// @ts-check
/*
 * 富文本相关的纯字符串工具（不依赖 DOMPurify / marked），供主包直接使用；
 * 富文本编辑器与渲染组件仍在 rich-text.jsx，可按需加载。
 */

/** @typedef {{ id: number, filename: string, contentType: string, url: string }} RichTextAttachmentOption */

export const DOCUMENT_FILE_TYPES = [
  '3dm', '3ds', '3mf', '7z', 'aac', 'ai', 'amf', 'apk',
  'ar', 'asc', 'asice', 'asics', 'avro', 'bash', 'bdl', 'brep',
  'bundle', 'bz2', 'bzip2', 'c', 'cab', 'cbr', 'cbz', 'cc',
  'cjs', 'cms', 'cmsc', 'cpio', 'cpp', 'cs', 'css', 'csv',
  'dae', 'dbf', 'dcm', 'dicom', 'diff', 'dio', 'doc', 'docm',
  'docx', 'dot', 'dotm', 'dotx', 'dra', 'drawio', 'dwf', 'dwfx',
  'dwg', 'dxf', 'ear', 'eml', 'eps', 'epub', 'ers', 'excalidraw',
  'fb2', 'fbx', 'flac', 'fods', 'gds', 'geojson', 'glb', 'gltf',
  'go', 'gpg', 'gpx', 'gv', 'gz', 'gzip', 'h', 'hcl',
  'hpp', 'htm', 'html', 'http', 'hwp', 'hwpx', 'ifc', 'iges',
  'igs', 'ini', 'ipynb', 'iso', 'jar', 'java', 'js', 'json',
  'json5', 'jsonc', 'jsx', 'jws', 'key', 'kml', 'kmz', 'kt',
  'lha', 'log', 'lzh', 'lzma', 'm4a', 'markdown', 'mbox', 'md',
  'mermaid', 'mid', 'midi', 'mjs', 'mmd', 'mp3', 'mpeg', 'msg',
  'numbers', 'oas', 'oasis', 'obj', 'odp', 'ods', 'odt', 'ofd',
  'oga', 'ogg', 'olb', 'opus', 'otf', 'p7b', 'p7c', 'p7m',
  'p7s', 'pages', 'parquet', 'patch', 'pcd', 'pdf', 'pgp', 'php',
  'pkcs7', 'plantuml', 'ply', 'pot', 'potm', 'potx', 'ppsm', 'ppsx',
  'ppt', 'pptm', 'pptx', 'proto', 'psd', 'puml', 'py', 'rar',
  'rb', 'react', 'rs', 'rtf', 'sce', 'scs', 'sh', 'shp',
  'sig', 'sql', 'sqlite', 'step', 'stl', 'stp', 'swift', 'tar',
  'tbz', 'tbz2', 'tex', 'tgz', 'toml', 'ts', 'tsd', 'tsq',
  'tsr', 'tst', 'tsv', 'tsx', 'ttf', 'txt', 'txz', 'typ',
  'typst', 'tzst', 'umd', 'usd', 'usda', 'usdc', 'usdz', 'vrml',
  'vtk', 'vtp', 'vue', 'war', 'wasm', 'wav', 'weba', 'webarchive',
  'woff', 'woff2', 'wp', 'wp5', 'wp6', 'wpd', 'wrl', 'xar',
  'xla', 'xlam', 'xls', 'xlsb', 'xlsm', 'xlsx', 'xlt', 'xltm',
  'xltx', 'xmind', 'xml', 'xps', 'xyz', 'xz', 'yaml', 'yml',
  'zip', 'zipx', 'zst',
];

/** @param {string} value */
export function plainTextToRichHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .split(/\r?\n/u)
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
}

/** @param {string} value */
export function richTextHasContent(value) {
  return /<(?:hr|img|video)\b/iu.test(value) || value.replace(/<[^>]*>/gu, '').replaceAll('&nbsp;', ' ').trim().length > 0;
}

/** @param {string} value */
export function richTextAttachmentIds(value) {
  const ids = new Set();
  for (const match of value.matchAll(/\bdata-yuance-attachment-id\s*=\s*["']([1-9][0-9]*)["']/giu)) ids.add(Number(match[1]));
  return [...ids];
}

/** @param {RichTextAttachmentOption} attachment */
export function richTextAttachmentHtml(attachment) {
  const mediaKind = attachment.contentType.startsWith('image/') ? 'image' : attachment.contentType.startsWith('video/') ? 'video' : 'file';
  const id = String(attachment.id);
  const url = escapeAttribute(attachment.url);
  const filename = escapeAttribute(attachment.filename);
  if (mediaKind === 'file') {
    const fileKind = richFileVisualKind(attachment.filename, attachment.contentType);
    const fileExt = richFileVisualBadge(attachment.filename, attachment.contentType);
    return `<a data-yuance-attachment-id="${id}" data-yuance-attachment-kind="file" data-yuance-file-kind="${fileKind}" data-yuance-file-ext="${fileExt}" data-yuance-align="left" href="${url}" title="${filename}">${escapeText(attachment.filename)}</a>`;
  }
  if (mediaKind === 'image') return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="image" data-yuance-align="left"><img src="${url}" alt="${filename}" loading="lazy"></figure>`;
  return `<figure data-yuance-attachment-id="${id}" data-yuance-attachment-kind="video" data-yuance-align="left"><video src="${url}" controls preload="metadata" playsinline title="${filename}"></video></figure>`;
}

/** @param {string} filename @returns {string} */
export function normalizedFileExtension(filename) {
  const index = filename.lastIndexOf('.');
  if (index <= 0 || index === filename.length - 1) return '';
  return filename.slice(index + 1).trim().toLowerCase();
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function previewableDocumentFileType(filename, contentType) {
  const extension = normalizedFileExtension(filename);
  if (DOCUMENT_FILE_TYPES.includes(extension)) return extension;
  switch ((contentType || '').trim().toLowerCase()) {
    case 'application/pdf': return 'pdf';
    case 'application/msword': return 'doc';
    case 'text/plain': return 'txt';
    case 'text/markdown': return 'md';
    case 'text/csv': return 'csv';
    case 'application/vnd.ms-excel': return 'xls';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx';
    case 'application/vnd.oasis.opendocument.spreadsheet': return 'ods';
    case 'application/vnd.ms-powerpoint':
    case 'application/powerpoint':
    case 'application/x-mspowerpoint': return 'ppt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return 'pptx';
    case 'application/json': return 'json';
    case 'application/xml':
    case 'text/xml': return 'xml';
    case 'application/yaml':
    case 'application/x-yaml':
    case 'text/yaml':
    case 'text/x-yaml': return 'yaml';
    default: return '';
  }
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function richFileVisualKind(filename, contentType) {
  const extension = previewableDocumentFileType(filename, contentType) || normalizedFileExtension(filename);
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'sheet';
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'slide';
  if (extension === 'pdf') return 'pdf';
  if (['txt', 'log'].includes(extension)) return 'text';
  if (['md', 'json', 'xml', 'yaml', 'yml'].includes(extension)) return 'code';
  if (['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)) return 'archive';
  return 'file';
}

/** @param {string} filename @param {string} contentType @returns {string} */
export function richFileVisualBadge(filename, contentType) {
  const extension = previewableDocumentFileType(filename, contentType) || normalizedFileExtension(filename);
  if (extension) return extension.slice(0, 5).toUpperCase();
  const kind = richFileVisualKind(filename, contentType);
  return { word: 'DOC', sheet: 'XLS', slide: 'PPT', pdf: 'PDF', code: 'CODE', archive: 'ZIP' }[kind] || 'FILE';
}

/** @param {string} filename @param {string} contentType @returns {boolean} */
export function isPreviewableDocumentFile(filename, contentType) {
  return Boolean(previewableDocumentFileType(filename, contentType));
}

export const DEFER_RICH_TEXT_PASTE = 'defer';

/** @param {string} value */
export function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** @param {string} value */
export function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
