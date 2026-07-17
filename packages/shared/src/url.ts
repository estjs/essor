const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster']);

const MARKUP_DATA_MIME_TYPES = new Set(['text/html', 'text/xml', 'application/xml']);

// Browsers ignore these characters while resolving URL protocols.
// eslint-disable-next-line no-control-regex
const ASCII_WHITESPACE_AND_CONTROL_RE = /[\u0000-\u0020\u007F]/g;

/** Returns whether an attribute can navigate to or load a URL. */
export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

/** Returns whether a URL can execute script or carry markup. */
export function isUnsafeUrl(value: string): boolean {
  const normalized = value.replaceAll(ASCII_WHITESPACE_AND_CONTROL_RE, '').toLowerCase();

  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) {
    return true;
  }
  if (!normalized.startsWith('data:')) return false;

  const mimeType = normalized.slice(5).split(/[;,]/, 1)[0];
  return MARKUP_DATA_MIME_TYPES.has(mimeType) || mimeType.endsWith('+xml');
}
