import { isFunction, isNil, isString, warn } from '@estjs/shared';
import { isComputed, isSignal } from '@estjs/signals';
import { type SSRNode, createSSRNode, resolve } from './utils';
import { getSSRContext } from './context';

export interface SSRComponentProps {
  children?: unknown;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// NOTE: every built-in below returns a BRANDED SSR node (createSSRNode), not a
// bare string. The babel server codegen compiles `<Fragment>...</Fragment>`
// etc. to `ssrComponent(Fragment, {...})`, and the component-boundary
// resolve() inside createSSRComponent escapes bare strings — an unbranded
// return would be double-escaped (and Portal's `<!--teleport-anchor-->`
// comment would be corrupted, breaking hydration). This mirrors the re-brand
// ssrComponent applies to createSSRComponent's primitive result.
// ---------------------------------------------------------------------------

/**
 * SSR Fragment — serializes children to a branded SSR node
 * (`String()` yields the HTML).
 */
export function Fragment(props: SSRComponentProps): SSRNode {
  return createSSRNode(resolve(props.children));
}

// ---------------------------------------------------------------------------
// Portal (SSR)
// ---------------------------------------------------------------------------

export interface SSRPortalProps extends SSRComponentProps {
  /**
   * Teleport target — only CSS selector strings are meaningful on the server.
   * Element references are silently inlined (they have no server-side meaning).
   */
  target?: string;
  /**
   * When truthy, children render inline instead of being teleported.
   * The babel plugin resolves reactive getters before reaching the component,
   * so only a plain boolean is needed on the server.
   */
  disabled?: boolean | (() => boolean);
}

export const TELEPORT_CALLSITE_ANCHOR = '<!--teleport-anchor-->';
export const TELEPORT_BLOCK_START = '<!--teleport-start-->';
export const TELEPORT_BLOCK_END = '<!--teleport-end-->';

/**
 * SSR Portal — collects teleported content into `ctx.teleports[target]`.
 *
 * Emits `<!--teleport-anchor-->` at the call site and wraps children with
 * `<!--teleport-start-->...<!--teleport-end-->` in the target buffer.
 * Disabled / no-target / no-context falls back to inline rendering.
 */
export function Portal(props: SSRPortalProps): SSRNode {
  const { target, children } = props;
  // `rendered` stays a plain string for ctx.teleports concatenation; every
  // RETURN below is branded so the ssrComponent boundary keeps it raw (and
  // does not escape the anchor comment, which would break hydration).
  const rendered = resolve(children);

  // Unwrap disabled getter (for API parity with client)
  const disabled = isFunction(props.disabled)
    ? !!(props.disabled as () => boolean)()
    : !!props.disabled;

  if (disabled || !target) return createSSRNode(rendered);

  const ctx = getSSRContext();
  if (!ctx) return createSSRNode(rendered);

  // Only string selectors are meaningful for SSR; DOM nodes are inlined.
  if (!isString(target)) {
    if (__DEV__) {
      warn('[Portal] SSR only supports string selector targets; rendering inline.');
    }
    return createSSRNode(rendered);
  }

  ctx.teleports[target] =
    (ctx.teleports[target] ?? '') + TELEPORT_BLOCK_START + rendered + TELEPORT_BLOCK_END;

  return createSSRNode(TELEPORT_CALLSITE_ANCHOR);
}

// ---------------------------------------------------------------------------
// Suspense (SSR)
// ---------------------------------------------------------------------------

/**
 * SSR Suspense — renders children when available, otherwise the fallback slot.
 * Returns a branded SSR node (`String()` yields the HTML).
 */
export function Suspense(props: SSRComponentProps & { fallback?: unknown }): SSRNode {
  const { children, fallback } = props;
  return createSSRNode(isNil(children) ? resolve(fallback) : resolve(children));
}

// ---------------------------------------------------------------------------
// For (SSR)
// ---------------------------------------------------------------------------

export interface SSRForProps<T> {
  each: T[] | { value: T[] } | (() => T[]);
  children: (item: T, index: number) => unknown;
  key?: (item: T, index: number) => unknown;
  fallback?: unknown;
}

/** Unwrap signal / getter / plain array for SSR without subscribing. */
function resolveList<T>(input: SSRForProps<T>['each']): T[] {
  if (isNil(input)) return [];
  if (isSignal(input) || isComputed(input)) {
    return ((input as { value: T[] }).value ?? []) as T[];
  }
  if (isFunction(input)) {
    return ((input as () => T[])() ?? []) as T[];
  }
  return input as T[];
}

/**
 * SSR For — maps each item through the render function and joins the output.
 * Returns a branded SSR node (`String()` yields the HTML).
 */
export function For<T>(props: SSRForProps<T>): SSRNode {
  const list = resolveList<T>(props.each);

  if (list.length === 0) {
    return createSSRNode(resolve(props.fallback));
  }

  const render = props.children;
  if (!isFunction(render)) return createSSRNode('');

  return createSSRNode(list.map((item, i) => resolve(render(item, i))).join(''));
}
