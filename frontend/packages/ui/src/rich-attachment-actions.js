// @ts-check
/* global URL */

/** @param {Window} view @param {string} text @returns {Promise<void>} */
export async function copyTextToClipboard(view, text) {
  const absolute = /^(?:https?:)?\/\//iu.test(text) ? text : new URL(text, view.location.href).toString();
  if (view.navigator.clipboard?.writeText) {
    try {
      await view.navigator.clipboard.writeText(absolute);
      return;
    } catch {
      // Fall back to a hidden textarea for browsers that reject the async API.
    }
  }
  const ownerDocument = view.document;
  const textarea = ownerDocument.createElement('textarea');
  textarea.value = absolute;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  ownerDocument.body.appendChild(textarea);
  textarea.select();
  try {
    if (!ownerDocument.execCommand('copy')) throw new Error('浏览器拒绝复制。');
  } finally {
    textarea.remove();
  }
}

/** @param {Window} view @param {string} source @returns {string} */
export function documentPreviewUrlFromSource(view, source) {
  if (!source) return '';
  try {
    const url = new URL(source, view.location.href);
    if (url.origin !== view.location.origin || !url.pathname.startsWith('/web') || !url.pathname.endsWith('/download')) return '';
    url.pathname = `${url.pathname.slice(0, -'/download'.length)}/preview`;
    return url.toString();
  } catch {
    return '';
  }
}

/** @param {Window} view @param {string} url @returns {boolean} */
export function openDocumentPreviewWindow(view, url) {
  if (!url) return false;
  const ownerDocument = view.document;
  let previewLink = null;
  try {
    previewLink = ownerDocument.createElement('a');
    previewLink.href = url;
    previewLink.target = '_blank';
    previewLink.rel = 'noopener noreferrer';
    previewLink.style.position = 'fixed';
    previewLink.style.left = '-9999px';
    if (ownerDocument.body) ownerDocument.body.appendChild(previewLink);
    if (typeof previewLink.click === 'function') {
      previewLink.click();
      return true;
    }
  } catch {
    previewLink = null;
  }
  let openedWindow = null;
  try {
    openedWindow = view.open(url, '_blank');
  } catch {
    openedWindow = null;
  }
  if (openedWindow) {
    try { openedWindow.opener = null; } catch { /* Cross-origin cleanup is best-effort. */ }
    return true;
  }
  return false;
}

/** @param {Window} view @param {string} url @param {string} filename */
export function downloadUrlViaAnchor(view, url, filename) {
  const link = view.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  view.document.body.appendChild(link);
  link.click();
  link.remove();
}
