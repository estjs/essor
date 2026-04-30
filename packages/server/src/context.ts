import { AsyncLocalStorage } from 'node:async_hooks';

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
const store: ContextStore = new AsyncLocalStorage<SSRContext | null>();

/**
 * Get the current SSR context, if any. Returns `null` when called outside of
 * a `renderToString` invocation, or when the caller did not pass a context.
 */
export function getSSRContext(): SSRContext | null {
  return store.getStore() ?? null;
}

/**
 * Run `fn` with `ctx` as the active SSR context. The context is preserved
 * across awaits inside `fn` and restored on exit (including when `fn` throws).
 */
export function runWithSSRContext<T>(ctx: SSRContext | null, fn: () => T): T {
  return store.run(ctx, fn);
}
