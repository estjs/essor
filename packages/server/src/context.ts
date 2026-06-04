/**
 * SSR rendering context.

 */
export interface SSRContext {
  /**
   * Map of teleport target → concatenated HTML string. The caller is
   * responsible for inlining each entry into the final document
   * (e.g. by replacing a placeholder in a shell template).
   */
  teleports: Record<string, string>;

  /**
   * Free-form key/value bag for user-defined per-render metadata
   * (e.g. collected `<head>` tags, status codes, response headers).
   */
  [key: string]: unknown;
}

/**
 * Create an empty SSR context with all collection slots initialised.
 */
export function createSSRContext(): SSRContext {
  return {
    teleports: Object.create(null) as Record<string, string>,
  };
}

/**
 * Async-safe SSR context propagation.
 */
interface ContextStore {
  getStore(): SSRContext | null | undefined;
  run<T>(ctx: SSRContext | null, fn: () => T): T;
}

// Lazily resolve `AsyncLocalStorage` via `process.getBuiltinModule` instead of a
// static `import 'node:async_hooks'`. This keeps the single `essor` bundle free
// of any top-level Node-only import, so a browser/client build never evaluates
// it and tree-shakes the whole SSR-context machinery away. On Node it resolves
// synchronously on first use; elsewhere it stays `null` and context propagation
// degrades to a no-op (browsers don't run SSR anyway).
let store: ContextStore | null | undefined;

function getStore(): ContextStore | null {
  if (store === undefined) {
    const ALS = (
      globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
    ).process?.getBuiltinModule?.('node:async_hooks') as
      | { AsyncLocalStorage?: new () => ContextStore }
      | undefined;
    store = ALS?.AsyncLocalStorage ? new ALS.AsyncLocalStorage() : null;
  }
  return store;
}

/**
 * Get the current SSR context, if any. Returns `null` when called outside of
 * a `renderToString` invocation, or when the caller did not pass a context.
 */
export function getSSRContext(): SSRContext | null {
  return getStore()?.getStore() ?? null;
}

/**
 * Run `fn` with `ctx` as the active SSR context. The context is preserved
 * across awaits inside `fn` and restored on exit (including when `fn` throws).
 * Falls back to a plain call when AsyncLocalStorage is unavailable.
 */
export function runWithSSRContext<T>(ctx: SSRContext | null, fn: () => T): T {
  const s = getStore();
  return s ? s.run(ctx, fn) : fn();
}
