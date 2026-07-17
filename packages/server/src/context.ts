/**
 * SSR rendering context + async execution carrier install.
 */
import {
  type SSRExecutionCarrier,
  type SSRExecutionState,
  type SSRResourceBridge,
  setSSRExecutionCarrier,
} from '@estjs/template/internal';

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
   * Optional resource bridge shared across multi-pass render for this request.
   */
  resources?: SSRResourceBridge;

  /**
   * Free-form key/value bag for user-defined per-render metadata
   * (e.g. collected `<head>` tags, status codes, response headers).
   */
  [key: string]: unknown;
}

/**
 * Create an empty SSR context with all collection slots initialised.
 */
export function createSSRContext(init: Partial<SSRContext> = {}): SSRContext {
  return {
    teleports: Object.create(null) as Record<string, string>,
    ...init,
  };
}

/**
 * Async-safe SSR context propagation (teleports / metadata).
 */
interface ContextStore {
  getStore(): SSRContext | null | undefined;
  run<T>(ctx: SSRContext | null, fn: () => T): T;
}

interface ExecutionStore {
  getStore(): SSRExecutionState | undefined;
  run<T>(state: SSRExecutionState, fn: () => T): T;
}

// Lazily resolve `AsyncLocalStorage` via `process.getBuiltinModule` instead of a
// static `import 'node:async_hooks'`. This keeps the single `essor` bundle free
// of any top-level Node-only import.
let contextStore: ContextStore | null | undefined;
let executionStore: ExecutionStore | null | undefined;
let carrierInstalled = false;

function getAsyncLocalStorageCtor(): (new () => any) | null {
  const ALS = (
    globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
  ).process?.getBuiltinModule?.('node:async_hooks') as
    | { AsyncLocalStorage?: new () => any }
    | undefined;
  return ALS?.AsyncLocalStorage ?? null;
}

function getContextStore(): ContextStore | null {
  if (contextStore === undefined) {
    const Ctor = getAsyncLocalStorageCtor();
    contextStore = Ctor ? (new Ctor() as ContextStore) : null;
  }
  return contextStore ?? null;
}

function getExecutionStore(): ExecutionStore | null {
  if (executionStore === undefined) {
    const Ctor = getAsyncLocalStorageCtor();
    executionStore = Ctor ? (new Ctor() as ExecutionStore) : null;
  }
  return executionStore ?? null;
}

function ensureCarrierInstalled(): void {
  if (carrierInstalled) return;
  carrierInstalled = true;
  const store = getExecutionStore();
  if (!store) {
    // Non-Node: leave carrier unset so async SSR fails loudly.
    setSSRExecutionCarrier(null);
    return;
  }
  const carrier: SSRExecutionCarrier = {
    get: () => store.getStore() ?? undefined,
    run: (state, fn) => store.run(state, fn as () => unknown) as ReturnType<typeof fn>,
  };
  setSSRExecutionCarrier(carrier);
}

// Install on module evaluation so server renders always have a carrier on Node.
ensureCarrierInstalled();

/**
 * Get the current SSR context, if any. Returns `null` when called outside of
 * a `renderToString` invocation, or when the caller did not pass a context.
 */
export function getSSRContext(): SSRContext | null {
  return getContextStore()?.getStore() ?? null;
}

/**
 * Run `fn` with `ctx` as the active SSR context. The context is preserved
 * across awaits inside `fn` and restored on exit (including when `fn` throws).
 * Falls back to a plain call when AsyncLocalStorage is unavailable.
 */
export function runWithSSRContext<T>(ctx: SSRContext | null, fn: () => T): T {
  const s = getContextStore();
  return s ? s.run(ctx, fn) : fn();
}

export function hasSSRExecutionCarrier(): boolean {
  ensureCarrierInstalled();
  return getExecutionStore() != null;
}
