import { escapeHTML, isArray, isFunction, isNil, isString } from '@estjs/shared';

/**
 * Convert content to string for SSR output.
 *
 * @param content - The content to convert.
 * @param isSvg - Whether the content is SVG.
 * @returns {string} The content as a string.
 */
export function convertToString(content: unknown, isSvg = false): string {
  if (isNil(content)) {
    return '';
  }

  if (isString(content)) {
    return content;
  }
  if (isArray(content)) {
    return (content as unknown[]).map((item: unknown) => convertToString(item, isSvg)).join('');
  }

  if (isFunction(content)) {
    return convertToString((content as () => unknown)(), isSvg);
  }

  return String(content);
}

/**
 * Convert child-expression content to escaped text for SSR output.
 *
 * JSX expression children have text semantics, so primitives must be escaped
 * before interpolation into the surrounding HTML template.
 */
export function convertTextChildToString(content: unknown): string {
  if (content === false || isNil(content)) {
    return '';
  }

  if (isString(content)) {
    return escapeHTML(content);
  }

  if (isArray(content)) {
    return (content as unknown[]).map((item) => convertTextChildToString(item)).join('');
  }

  if (isFunction(content)) {
    return convertTextChildToString((content as () => unknown)());
  }

  return escapeHTML(String(content));
}

/**
 * Combined regex that matches either a `data-idx="<digits>"` attribute or an
 * HTML comment in a single scan. Capture groups:
 *   1. data-idx index value (if attribute matched)
 *   2. comment body (if comment matched)
 */
const HYDRATION_REWRITE_REGEX = /data-idx="(\d+)"|<!--(.*?)-->/g;

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
export function addAttributes(htmlContent: string, hydrationId: string): string {
  // Single-pass rewrite for both `data-idx` and comment markers — half the
  // string traversals compared to chained `replaceAll` calls.
  return injectRootHydrationAttribute(htmlContent, hydrationId).replaceAll(
    HYDRATION_REWRITE_REGEX,
    (_match, dataIdx, commentBody) =>
      dataIdx !== undefined
        ? `data-idx="${hydrationId}-${dataIdx}"`
        : `<!--${hydrationId}-${commentBody}-->`,
  );
}
