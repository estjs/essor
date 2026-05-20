import {
  HYDRATION_ANCHOR_ATTR,
  escapeHTML,
  isArray,
  isFunction,
  isNil,
  isObject,
  isString,
} from '@estjs/shared';

const safeHtmlMarker = Symbol('safeHtml');
interface SafeHtml {
  readonly html: string;
}

function isSafeHtml(content: unknown): content is SafeHtml {
  return Boolean(
    isObject(content) && (content as Record<PropertyKey, unknown>)[safeHtmlMarker] === true,
  );
}

function stringify(content: unknown, escape: boolean, omitFalse: boolean): string {
  if (isSafeHtml(content)) {
    return content.html;
  }
  if (isNil(content) || (omitFalse && content === false)) {
    return '';
  }
  if (isArray(content)) {
    return (content as unknown[]).map((item) => stringify(item, escape, omitFalse)).join('');
  }
  if (isFunction(content)) {
    return stringify((content as () => unknown)(), escape, omitFalse);
  }

  if (isString(content)) {
    return escape ? escapeHTML(content) : content;
  }

  const text = String(content);
  return escape ? escapeHTML(text) : text;
}

export function markAsRawHtml(content: unknown): SafeHtml {
  if (isSafeHtml(content)) {
    return content;
  }

  return {
    [safeHtmlMarker]: true,
    html: stringify(content, false, true),
  } as SafeHtml;
}

/**
 * Convert content to string for SSR output.
 *
 * @param content - The content to convert.
 * @returns {string} The content as a string.
 */
export function toRawHtmlString(content: unknown): string {
  return stringify(content, false, false);
}

/**
 * Convert child-expression content to escaped text for SSR output.
 *
 * JSX expression children have text semantics, so primitives must be escaped
 * before interpolation into the surrounding HTML template.
 */
export function toEscapedHtmlString(content: unknown): string {
  return stringify(content, true, true);
}

/**
 * Combined regex that matches either an internal hydration anchor attribute or
 * a hydration comment marker (numeric body only) in a single scan. Capture groups:
 *   1. hydration anchor index value (if attribute matched)
 *   2. numeric comment body (if hydration marker matched)
 *
 * Non-numeric comments (e.g. `<!-- user content -->`) are preserved unchanged.
 */
const HYDRATION_REWRITE_REGEX = new RegExp(`${HYDRATION_ANCHOR_ATTR}="(\\d+)"|<!--(\\d+)-->`, 'g');

/**
 * Inject the root hydration attribute into the opening tag without corrupting
 * self-closing tags such as `<img />` or `<input/>`.
 */
function injectRootHydrationAttribute(htmlContent: string, hydrationId: string): string {
  const tagStart = htmlContent.indexOf('<');
  if (tagStart === -1) {
    return htmlContent;
  }

  let quote: '"' | "'" | undefined;
  for (let i = tagStart + 1; i < htmlContent.length; i++) {
    const char = htmlContent[i];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '>') {
      let insertAt = i;
      for (let j = i - 1; j > tagStart; j--) {
        const prev = htmlContent[j];
        if (prev === ' ' || prev === '\n' || prev === '\t' || prev === '\r') {
          continue;
        }
        if (prev === '/') {
          insertAt = j;
        }
        break;
      }

      return `${htmlContent.slice(0, insertAt)} data-hk="${hydrationId}"${htmlContent.slice(insertAt)}`;
    }
  }

  return htmlContent;
}

/**
 * Add hydration attributes to HTML content.
 *
 * @param htmlContent - The html content.
 * @param hydrationId - The hydration id.
 * @returns {string} The html content with hydration attributes.
 */
export function injectHydrationKeys(htmlContent: string, hydrationId: string): string {
  // Single-pass rewrite for both element anchors and comment markers — half the
  // string traversals compared to chained `replaceAll` calls.
  return injectRootHydrationAttribute(htmlContent, hydrationId).replaceAll(
    HYDRATION_REWRITE_REGEX,
    (_match, dataIdx, commentBody) =>
      dataIdx !== undefined
        ? `${HYDRATION_ANCHOR_ATTR}="${hydrationId}-${dataIdx}"`
        : `<!--${hydrationId}-${commentBody}-->`,
  );
}
