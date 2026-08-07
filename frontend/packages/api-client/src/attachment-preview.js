// @ts-check

/**
 * @template A
 * @param {unknown} payload
 * @param {(value: unknown) => A} parseAttachment
 */
export function attachmentPreviewFromPayload(payload, parseAttachment) {
  const value = requireObject(payload, 'attachment preview');
  const preview = requireObject(value.preview, 'attachment preview capability');
  const navigation = requireObject(value.navigation, 'attachment preview navigation');
  return Object.freeze({
    attachment: parseAttachment(value.attachment),
    preview: Object.freeze({
      kind: nullableEnum(preview.kind, ['image', 'video', 'document'], 'preview kind'),
      strategy: nullableString(preview.strategy, 'preview strategy'),
      file_type: nullableString(preview.file_type, 'preview file type'),
      kind_label: nullableString(preview.kind_label, 'preview kind label'),
      is_experimental: requiredBoolean(preview.is_experimental, 'preview experimental flag'),
      legacy_preview_enabled: requiredBoolean(preview.legacy_preview_enabled, 'legacy preview flag'),
      content_enabled: requiredBoolean(preview.content_enabled, 'preview content flag'),
    }),
    navigation: Object.freeze({
      position: nonNegativeInteger(navigation.position, 'preview position'),
      total: nonNegativeInteger(navigation.total, 'preview total'),
      previous: previewNavigationLink(navigation.previous),
      next: previewNavigationLink(navigation.next),
    }),
    content_url: internalPath(value.content_url, 'preview content URL'),
    download_url: internalPath(value.download_url, 'preview download URL'),
  });
}

function previewNavigationLink(value) {
  if (value === null) return null;
  const link = requireObject(value, 'preview navigation link');
  return Object.freeze({
    id: positiveInteger(link.id, 'preview attachment ID'),
    title: requiredString(link.title, 'preview title'),
    url: internalPath(link.url, 'preview navigation URL'),
  });
}

function requireObject(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} is invalid`); return /** @type {Record<string, unknown>} */ (value); }
function requiredString(value, name) { if (typeof value !== 'string' || value.length < 1 || value.length > 4096) throw new TypeError(`${name} is invalid`); return value; }
function nullableString(value, name) { return value === null ? null : requiredString(value, name); }
/** @returns {'image' | 'video' | 'document' | null} */
function nullableEnum(value, allowed, name) { if (value === null) return null; if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(`${name} is invalid`); return /** @type {'image' | 'video' | 'document'} */ (value); }
function requiredBoolean(value, name) { if (typeof value !== 'boolean') throw new TypeError(`${name} is invalid`); return value; }
function positiveInteger(value, name) { if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < 1) throw new TypeError(`${name} is invalid`); return /** @type {number} */ (value); }
function nonNegativeInteger(value, name) { if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < 0) throw new TypeError(`${name} is invalid`); return /** @type {number} */ (value); }
function internalPath(value, name) { const text = requiredString(value, name); if (!text.startsWith('/api/v1/')) throw new TypeError(`${name} is invalid`); return text; }
