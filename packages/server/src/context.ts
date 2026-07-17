import {
  type Scope,
  activateScopeEffects,
  setActiveScopeSlotProvider,
  setHydrationKeySlotProvider,
} from '@estjs/template/internal';

/** SSR rendering context. */
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
 * State carried across `await` boundaries for one SSR request. The same state
 * object backs the public SSR context and the request-local template slots.
 * AsyncLocalStorage gives concurrent renders independent state objects.
 *
 * PROTOCOL: the `scope` and `hydrationKey` field names must stay aligned with
 * the template side's ActiveScopeSlot / HydrationKeySlot interfaces — the
 * same object is fed to both slot providers, so renaming a field here would
 * silently break the protocol (the slot would read `undefined`).
 */
interface SSRRenderState {
  ssrContext: SSRContext | null;
  scope: Scope | null;
  hydrationKey: number;
}

/**
 * Minimal AsyncLocalStorage surface used by this package. Keeping this local
 * avoids a top-level Node import in the browser bundle.
 */
interface AsyncContextStorage {
  getStore(): SSRRenderState | undefined;
  run<T>(state: SSRRenderState, fn: () => T): T;
}

interface AsyncHook {
  enable(): void;
}

interface AsyncHooksModule {
  AsyncLocalStorage?: new () => AsyncContextStorage;
  createHook?: (callbacks: {
    init?(asyncId: number): void;
    before?(asyncId: number): void;
    after?(asyncId: number): void;
    destroy?(asyncId: number): void;
  }) => AsyncHook;
}

// Lazily resolve `AsyncLocalStorage` via `process.getBuiltinModule` instead of a
// static `import 'node:async_hooks'`. This keeps the single `essor` bundle free
// of any top-level Node-only import, so a browser/client build never evaluates
// it and tree-shakes the whole SSR-context machinery away. On Node it resolves
// synchronously on first use; elsewhere it stays `null` and context propagation
// degrades to a no-op (browsers don't run SSR anyway).
let asyncHooksModule: AsyncHooksModule | null | undefined;

function getAsyncHooksModule(): AsyncHooksModule | null {
  if (asyncHooksModule === undefined) {
    asyncHooksModule =
      ((
        globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
      ).process?.getBuiltinModule?.('node:async_hooks') as AsyncHooksModule | undefined) ?? null;
  }
  return asyncHooksModule;
}

let asyncContextStorage: AsyncContextStorage | null | undefined;

function getAsyncContextStorage(): AsyncContextStorage | null {
  if (asyncContextStorage === undefined) {
    const asyncHooks = getAsyncHooksModule();
    asyncContextStorage = asyncHooks?.AsyncLocalStorage ? new asyncHooks.AsyncLocalStorage() : null;
  }
  return asyncContextStorage;
}
/**
 * Get the current SSR context, if any. Returns `null` when called outside of
 * a `renderToString` invocation, or when the caller did not pass a context.
 */
export function getSSRContext(): SSRContext | null {
  return getAsyncContextStorage()?.getStore()?.ssrContext ?? null;
}

// Install the request-local slot providers once. Outside a request the
// provider returns undefined, so template keeps its normal module-local state.
// Intentionally never uninstalled: the providers are inert without an active
// ALS store, and installation is process-wide, not per-render.
let requestStateProvidersInstalled = false;
let scopeEffectHook: AsyncHook | null | undefined;

function installScopeEffectHook(storage: AsyncContextStorage): void {
  if (scopeEffectHook !== undefined) return;

  const createHook = getAsyncHooksModule()?.createHook;
  if (!createHook) {
    scopeEffectHook = null;
    return;
  }

  const requestStates = new Map<number, SSRRenderState>();
  const restoreStacks = new Map<number, Array<() => void>>();
  const hook = createHook({
    init(asyncId) {
      const state = storage.getStore();
      if (state) requestStates.set(asyncId, state);
    },
    before(asyncId) {
      const scope = requestStates.get(asyncId)?.scope;
      if (!scope) return;

      const restore = activateScopeEffects(scope);
      const stack = restoreStacks.get(asyncId);
      if (stack) {
        stack.push(restore);
      } else {
        restoreStacks.set(asyncId, [restore]);
      }
    },
    after(asyncId) {
      const stack = restoreStacks.get(asyncId);
      if (!stack) return;

      const restore = stack.pop();
      if (!restore) return;

      try {
        restore();
      } finally {
        if (stack.length === 0) restoreStacks.delete(asyncId);
      }
    },
    destroy(asyncId) {
      requestStates.delete(asyncId);
      restoreStacks.delete(asyncId);
    },
  });

  hook.enable();
  scopeEffectHook = hook;
}

function installRequestStateProviders(storage: AsyncContextStorage): void {
  if (!requestStateProvidersInstalled) {
    requestStateProvidersInstalled = true;
    const getCurrentRequestState = () => storage.getStore();
    setActiveScopeSlotProvider(getCurrentRequestState);
    setHydrationKeySlotProvider(getCurrentRequestState);
  }
  installScopeEffectHook(storage);
}

/**
 * Whether async request isolation (AsyncLocalStorage) is available. When it
 * is not, concurrent async renders share module-global scope/hydration state.
 */
export function hasAsyncContextSupport(): boolean {
  return getAsyncContextStorage() !== null;
}

/**
 * Run `fn` with `ctx` as the active SSR context. The context — together with
 * the request-local active scope and hydration-key counter — is preserved
 * across awaits inside `fn` and restored on exit (including when `fn` throws).
 * Falls back to a plain call when AsyncLocalStorage is unavailable.
 */
export function runWithSSRContext<T>(ctx: SSRContext | null, fn: () => T): T {
  const storage = getAsyncContextStorage();
  if (!storage) return fn();
  installRequestStateProviders(storage);
  // Always enter fresh state. Scope and hydration-key isolation still matter
  // when the caller does not provide an SSRContext object.
  return storage.run({ ssrContext: ctx, scope: null, hydrationKey: 0 }, fn);
}
