import { isFunction, isNil, isString } from '@estjs/shared'
import { convertToString } from './utils'
import { getSSRContext } from './context'

export interface SSRComponentProps {
  children?: unknown
  [key: string]: unknown
}

/**
 * SSR Fragment — returns children converted to a string.
 */
export function Fragment(props: SSRComponentProps): string {
  return convertToString(props.children)
}

// ---------------------------------------------------------------------------
// Portal (SSR)
// ---------------------------------------------------------------------------

export interface SSRPortalProps extends SSRComponentProps {
  target?: string | unknown
  disabled?: boolean
}

export const TELEPORT_CALLSITE_ANCHOR = '<!--teleport-anchor-->'
export const TELEPORT_BLOCK_START = '<!--teleport-start-->'
export const TELEPORT_BLOCK_END = '<!--teleport-end-->'

/**
 * SSR Portal — collects teleported content into `ctx.teleports[target]`.
 *
 * Emits `<!--teleport-anchor-->` at the call site and wraps children with
 * `<!--teleport-start-->...<!--teleport-end-->` in the target buffer.
 * Disabled / no-target / no-context falls back to inline rendering.
 */
export function Portal(props: SSRPortalProps): string {
  const { target, disabled, children } = props
  const rendered = convertToString(children)

  if (disabled || !target) return rendered

  const ctx = getSSRContext()
  if (!ctx) return rendered

  // Only string selectors are meaningful for SSR; DOM nodes are inlined.
  if (!isString(target)) return rendered

  ctx.teleports[target] =
    (ctx.teleports[target] ?? '') + TELEPORT_BLOCK_START + rendered + TELEPORT_BLOCK_END

  return TELEPORT_CALLSITE_ANCHOR
}

// ---------------------------------------------------------------------------
// Suspense (SSR)
// ---------------------------------------------------------------------------

/**
 * SSR Suspense — renders children when available, otherwise the fallback slot.
 */
export function Suspense(props: SSRComponentProps & { fallback?: unknown }): string {
  const { children, fallback } = props
  return isNil(children) ? convertToString(fallback) : convertToString(children)
}

// ---------------------------------------------------------------------------
// For (SSR)
// ---------------------------------------------------------------------------

export interface SSRForProps<T> {
  each: T[] | { value: T[] } | (() => T[])
  children: (item: T, index: number) => unknown
  key?: (item: T, index: number) => unknown
  fallback?: unknown
}

/** Unwrap signal / getter / plain array for SSR without subscribing. */
function resolveList<T>(input: SSRForProps<T>['each']): T[] {
  if (isNil(input)) return []
  // Duck-type signal check — avoids importing @estjs/signals on the server.
  if (typeof input === 'object' && input !== null && 'value' in input) {
    return ((input as { value: T[] }).value ?? []) as T[]
  }
  if (isFunction(input)) {
    return ((input as () => T[])() ?? []) as T[]
  }
  return input as T[]
}

/**
 * SSR For — maps each item through the render function and joins the output.
 */
export function For<T>(props: SSRForProps<T>): string {
  const list = resolveList<T>(props.each)

  if (list.length === 0) {
    return convertToString(props.fallback)
  }

  const render = props.children
  if (!isFunction(render)) return ''

  return list.map((item, i) => convertToString(render(item, i))).join('')
}
