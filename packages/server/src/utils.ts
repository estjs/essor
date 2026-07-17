import {
  HYDRATION_ANCHOR_ATTR,
  HYDRATION_RANGE_START_PREFIX,
  escapeHTML,
  isArray,
  isFunction,
  isNil,
  isPlainObject,
  isString,
} from '@estjs/shared';

const SSR_NODE = Symbol('essor.ssr-node');

export interface SSRNode {
  readonly [SSR_NODE]: true;
  readonly html: string;
  toString(): string;
}

const ssrNodes = new WeakSet<object>();

// ---------------------------------------------------------------------------
// SSR serialization
//
// The compiler emits SSRNode objects for trusted nested JSX/component output.
// Plain strings are NEVER trusted: both the child-text channel and the
// component-boundary channel escape bare strings. Only WeakSet-branded
// SSRNode values (compiled ssr()/ssrComponent() output or explicit
// unsafeHTML()) pass through as raw HTML — trust is carried by an
// unforgeable value brand, not by the value's position or origin.
//
// - resolve(): escapes bare strings, returns a PLAIN string
//   (renderToString depends on that).
// - escape(): compat alias of resolve() kept for the compiler/public API.
// - unsafeHTML(): explicit opt-in for hand-written raw HTML strings.
// ---------------------------------------------------------------------------

export function createSSRNode(html: string): SSRNode {
  const node: SSRNode = {
    [SSR_NODE]: true,
    html,
    toString() {
      return html;
    },
  };

  ssrNodes.add(node);
  return node;
}

function isSSRNode(value: unknown): value is SSRNode {
  return isPlainObject(value) && ssrNodes.has(value);
}

/**
 * Serialize a component return value. Recurses arrays and thunks, drops
 * `null` / `undefined` / `false`, and HTML-escapes every leaf string.
 *
 * SECURITY: bare strings are escaped — only branded SSRNode values (compiled
 * `ssr()` / `ssrComponent()` output or explicit
 * {@link unsafeHTML}) pass through as raw HTML. A hand-written component that
 * returns raw markup as a plain string must wrap it in `unsafeHTML()`.
 *
 * Returns a PLAIN string — `renderToString` relies on this being the final,
 * unbranded HTML output.
 */
export function resolve(value: unknown): string {
  if (isNil(value) || value === false) {
    return '';
  }
  if (isSSRNode(value)) {
    return value.html;
  }
  if (isArray(value)) {
    let out = '';
    for (const item of value as unknown[]) out += resolve(item);
    return out;
  }
  if (isFunction(value)) {
    return resolve((value as () => unknown)());
  }
  return escapeHTML(isString(value) ? value : String(value));
}

/**
 * Serialize a `{expr}` child slot. Compat alias of {@link resolve} — the two
 * channels converged once bare strings became always-escaped.
 */
export function escape(value: unknown): string {
  return resolve(value);
}

/**
 * Explicitly mark a string as trusted raw HTML for SSR output.
 *
 * The name is intentionally alarming: the caller vouches that `html` is safe.
 * Passing unsanitized user input here reintroduces XSS.
 */
export function unsafeHTML(html: string): SSRNode {
  return createSSRNode(html);
}

const NUMERIC_HYDRATION_COMMENT_REGEX = /^<!--(\d+)-->$/;
const RANGE_START_HYDRATION_COMMENT_REGEX = new RegExp(
  `^<!--${HYDRATION_RANGE_START_PREFIX}:([cet]):(\\d+)-->$`,
);
const RAW_TEXT_TAGS = new Set(['title', 'textarea', 'style', 'script']);

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i;
    }
  }
  return -1;
}

function findRawTextEnd(html: string, lowerHTML: string, start: number, tag: string): number {
  const needle = `</${tag}`;
  let index = lowerHTML.indexOf(needle, start);

  while (index !== -1) {
    const boundary = lowerHTML[index + needle.length];
    if (boundary && /[\t\n\f\r />]/.test(boundary) && findTagEnd(html, index) !== -1) {
      return index;
    }
    index = lowerHTML.indexOf(needle, index + needle.length);
  }
  return -1;
}

function rewriteHydrationComment(comment: string, hydrationId: string): string {
  const numeric = NUMERIC_HYDRATION_COMMENT_REGEX.exec(comment);
  if (numeric) return `<!--${hydrationId}-${numeric[1]}-->`;

  const rangeStart = RANGE_START_HYDRATION_COMMENT_REGEX.exec(comment);
  if (rangeStart) {
    return `<!--${HYDRATION_RANGE_START_PREFIX}:${rangeStart[1]}:${hydrationId}:${rangeStart[2]}-->`;
  }
  return comment;
}

function rewriteHydrationAnchorAttributes(token: string, hydrationId: string): string {
  let output = '';
  let cursor = 0;
  let quote: '"' | "'" | undefined;

  while (cursor < token.length) {
    const char = token[cursor];
    if (quote) {
      output += char;
      if (char === quote) quote = undefined;
      cursor++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      cursor++;
      continue;
    }

    const previous = token[cursor - 1];
    if (
      token.startsWith(`${HYDRATION_ANCHOR_ATTR}="`, cursor) &&
      previous !== undefined &&
      /[\t\n\f\r ]/.test(previous)
    ) {
      const valueStart = cursor + HYDRATION_ANCHOR_ATTR.length + 2;
      const valueEnd = token.indexOf('"', valueStart);
      const slot = valueEnd === -1 ? '' : token.slice(valueStart, valueEnd);
      if (/^\d+$/.test(slot)) {
        output += `${HYDRATION_ANCHOR_ATTR}="${hydrationId}-${slot}"`;
        cursor = valueEnd + 1;
        continue;
      }
    }

    output += char;
    cursor++;
  }

  return output;
}

function rewriteHydrationTokens(html: string, hydrationId: string): string {
  let output = '';
  let cursor = 0;
  let rawTextTag: string | undefined;
  // Lowercased once for case-insensitive raw-text end-tag scans.
  const lowerHTML = html.toLowerCase();

  while (cursor < html.length) {
    if (rawTextTag) {
      const rawEnd = findRawTextEnd(html, lowerHTML, cursor, rawTextTag);
      if (rawEnd === -1) return output + html.slice(cursor);
      output += html.slice(cursor, rawEnd);
      cursor = rawEnd;
      rawTextTag = undefined;
      continue;
    }

    if (html.startsWith('<!--', cursor)) {
      const commentEnd = html.indexOf('-->', cursor + 4);
      if (commentEnd === -1) return output + html.slice(cursor);
      const end = commentEnd + 3;
      output += rewriteHydrationComment(html.slice(cursor, end), hydrationId);
      cursor = end;
      continue;
    }

    if (html[cursor] === '<') {
      const tagEnd = findTagEnd(html, cursor);
      if (tagEnd === -1) return output + html.slice(cursor);
      let token = html.slice(cursor, tagEnd + 1);
      const openingTag = /^<([a-z][^\t\n\f\r />]*)/i.exec(token);
      if (openingTag) {
        token = rewriteHydrationAnchorAttributes(token, hydrationId);
        const tag = openingTag[1].toLowerCase();
        if (RAW_TEXT_TAGS.has(tag)) rawTextTag = tag;
      }
      output += token;
      cursor = tagEnd + 1;
      continue;
    }

    const nextToken = html.indexOf('<', cursor);
    if (nextToken === -1) return output + html.slice(cursor);
    output += html.slice(cursor, nextToken);
    cursor = nextToken;
  }

  return output;
}

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
  return rewriteHydrationTokens(
    injectRootHydrationAttribute(htmlContent, hydrationId),
    hydrationId,
  );
}
