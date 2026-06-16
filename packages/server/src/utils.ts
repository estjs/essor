import {
  HYDRATION_ANCHOR_ATTR,
  escapeHTML,
  isArray,
  isFunction,
  isNil,
  isString,
} from '@estjs/shared';

// ---------------------------------------------------------------------------
// SSR serialization
//
// There is no `{ t }` trusted-node wrapper. The whole SSR pipeline works on
// plain strings, and the Babel compiler decides escape-vs-raw at compile time
// by choosing a different helper per slot position :
//
//   - dynamic attribute slot  → ssrAttr / ssrClass / ssrStyle / ...   (returns
//                               an already-escaped attribute string)
//   - child-text slot `{expr}` → escape(expr)                          (escapes)
//   - nested element/component → render(...) / createSSRComponent(...) (already
//                               a final HTML string)
//
// `render()` then just concatenates the template fragments with the slot
// strings — it never inspects a value's type to decide trust.
//
// Two serializers, distinguished by *channel* (provenance), not by a runtime
// marker on the value:
//   - escape()  — child-text channel: strings are UNTRUSTED → HTML-escaped.
//   - resolve() — component-boundary channel (component return values): strings
//                 are TRUSTED raw HTML → emitted verbatim. A hand-written
//                 component returning `'<div>…</div>'` therefore "just works".
//
// Both share one recursive walker; they differ only in how a leaf string is
// finalized (escaped vs verbatim).
// ---------------------------------------------------------------------------

/**
 * Recursive SSR walker shared by {@link escape} and {@link resolve}. Recurses
 * arrays and thunks, drops `null` / `undefined` / `false`, and runs every leaf
 * string through `leaf`.
 */
function serialize(value: unknown, leaf: (s: string) => string): string {
  if (isNil(value) || value === false) {
    return '';
  }
  if (isArray(value)) {
    let out = '';
    for (const item of value as unknown[]) out += serialize(item, leaf);
    return out;
  }
  if (isFunction(value)) {
    return serialize((value as () => unknown)(), leaf);
  }
  return leaf(isString(value) ? value : String(value));
}

/**
 * Serialize a child-text value to an HTML string, HTML-escaping bare strings.
 *
 * This is the `{expr}` child-slot serializer
 */
export function escape(value: unknown): string {
  return serialize(value, escapeHTML);
}

/**
 * Serialize a *component-boundary* value to an HTML string, treating bare
 * strings as already-trusted raw HTML (NOT escaped).
 *
 * Used for values returned by component functions (`renderToString` /
 * `createSSRComponent` / Fragment / Suspense / For / Portal children): a
 * hand-written component that returns `'<div>…</div>'` means that markup
 * literally. Compiled JSX components return a final HTML string from
 * `render()`, which also passes through verbatim.
 */
export function resolve(value: unknown): string {
  return serialize(value, identity);
}

function identity(s: string): string {
  return s;
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
