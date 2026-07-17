import { error, isArray, isFunction, isPromise, isString } from '@estjs/shared';
import { type ComponentProps, resetHydrationKey } from '@estjs/template';
import {
  type Scope,
  activateScopeEffects,
  createScope,
  disposeScope,
  getActiveScope,
  runWithScope,
  setActiveScope,
} from '@estjs/template/internal';
import { type SSRContext, hasAsyncContextSupport, runWithSSRContext } from './context';
import { type SSRNode, createSSRNode, injectHydrationKeys, resolve } from './utils';

type SSRComponentFn<P = ComponentProps> = (props: P) => unknown;

/**
 * Runs `fn` inside a freshly created scope whose parent is the currently
 * active scope (if any). The scope is always disposed, even when `fn` throws,
 * so `provide` / `inject` state from one render cannot leak into another.
 */
function runInFreshScope<T>(fn: () => T, parent: Scope | null = getActiveScope()): T {
  const scope = createScope(parent);
  try {
    return runWithScope(scope, fn);
  } finally {
    disposeScope(scope);
  }
}

/**
 * Async variant of {@link runInFreshScope}. The request-local template scope
 * stays alive across awaits, while the process-global reactive effect scope is
 * active only for the initial synchronous segment. Later continuations are
 * bracketed by the server async hook.
 */
async function runInFreshScopeAsync<T>(
  fn: () => Promise<T>,
  parent: Scope | null = getActiveScope(),
): Promise<T> {
  const scope = createScope(parent);
  const prevScope = getActiveScope();
  try {
    let result: Promise<T>;
    const restoreEffects = activateScopeEffects(scope);
    try {
      setActiveScope(scope);
      result = fn();
    } finally {
      restoreEffects();
    }
    return await result;
  } finally {
    setActiveScope(prevScope);
    disposeScope(scope);
  }
}

function assertSyncRenderResult(result: unknown, apiName: string): void {
  if (isPromise(result)) {
    throw new Error(
      `${apiName} received a Promise - use renderToStringAsync for async components.`,
    );
  }
}

/**
 * Render a component to HTML string.
 *
 * Each invocation runs inside its own root scope so that `provide()` calls
 * stay isolated between independent `renderToString` calls.
 *
 * @param component - The component to render.
 * @param props - The props to pass to the component.
 * @param context - Optional {@link SSRContext} that collects out-of-tree
 *   render output (currently: `Portal`/`Teleport` content). The same context
 *   is visible to nested `createSSRComponent` calls; the caller integrates
 *   `context.teleports[selector]` into the final document.
 * @returns {string} The rendered HTML string.
 */
export function renderToString<P extends ComponentProps = ComponentProps>(
  component: SSRComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): string {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  // Render and serialize inside the same SSR store + fresh root scope so that
  // any compiled thunks executed by resolve() still see this request's
  // provide/inject state and hydration-key counter. The hydration-key reset
  // runs INSIDE the store: resetting outside would rewind the OUTER request's
  // counter when a render is nested in another request's ALS scope, producing
  // duplicate data-hk keys.
  return runWithSSRContext(context, () =>
    runInFreshScope(() => {
      resetHydrationKey();
      const result = component(props as P);

      // A Promise here means an async component was passed to the SYNC entry point.
      // `resolve()` cannot await, so it would serialize the Promise to the literal
      // string `[object Promise]` and ship broken HTML. Fail loudly instead - in
      // production too, since a silent corrupt render is worse than a thrown error.
      assertSyncRenderResult(result, 'renderToString');

      // Serialize to the final HTML string at the component boundary.
      return resolve(result);
    }, null),
  );
}

/**
 * Render template with components (used by babel plugin in SSG mode).
 *
 * Interleaves the static template fragments with the dynamic slot values.
 *
 * Each slot has ALREADY been converted to its final HTML string by the
 * compile-time-chosen helper:
 *   - attribute slots → `ssrAttr` / `ssrClass` / ... (escaped attribute string)
 *   - child-text slots → `escape(expr)` (escaped text)
 *   - nested element/component → `ssr(...)` / `ssrComponent(...)`
 * so `render()` does NOT escape here — it just concatenates strings. Public
 * callers receive a plain HTML string; compiled JSX uses `ssr()` for a trusted
 * child value.
 *
 * @param templates - The static template fragments.
 * @param hydrationKey - The hydration key (empty string to skip injection).
 * @param slots - The pre-serialized HTML strings interleaved between fragments.
 * @returns {string} The rendered HTML string.
 */
export function render(templates: string[], hydrationKey: string, ...slots: unknown[]): string {
  // Direct string concatenation — avoids array allocation + join overhead
  // for typical 2-4 template fragments.
  const templateLen = templates.length;
  const slotLen = slots.length;
  let content = '';

  for (let i = 0; i < templateLen; i++) {
    content += templates[i];
    if (i < slotLen) {
      const slot = slots[i];
      // TRUST CONTRACT: a bare string slot is a pre-escaped fragment produced
      // by a compile-time helper (ssrAttr/ssrClass/escape/...) — it is
      // concatenated verbatim; escaping again would corrupt attribute quotes.
      // Any other value goes through resolve(), which escapes bare strings
      // and only lets WeakSet-branded SSRNode values through raw. render() is
      // compiler-facing: do not pass user input as a string slot.
      content += isString(slot) ? slot : resolve(slot);
    }
  }

  // Inject the hydration key attribute (data-hk) into the root element.
  return hydrationKey ? injectHydrationKeys(content, hydrationKey) : content;
}

/**
 * Compiler-only SSR template helper.
 *
 * It has the same concatenation semantics as {@link render}, but returns a
 * trusted SSR node so nested JSX can flow through child-text escape() without
 * double-escaping. The public render() API still returns a plain string.
 */
export function ssr(templates: string[], hydrationKey: string, ...slots: unknown[]): SSRNode {
  return createSSRNode(render(templates, hydrationKey, ...slots));
}

/**
 * Async variant of {@link renderToString}. Awaits component results so that
 * `async` components and promise-returning expressions can participate in SSR.
 *
 * The awaited value is passed through the same resolve() component-boundary
 * pipeline as the synchronous path, which transparently awaits nested promises
 * (arrays of promises, promise-returning thunks, etc.).
 */
export function renderToStringAsync<P extends ComponentProps = ComponentProps>(
  component: SSRComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): Promise<string> {
  if (!isFunction(component)) {
    error('Component must be a function');
    return Promise.resolve('');
  }

  // Without AsyncLocalStorage, concurrent async renders would silently share
  // the module-global scope and hydration counter — exactly the cross-request
  // leakage this API is meant to prevent. Warn loudly instead of failing quietly.
  if (__DEV__ && !hasAsyncContextSupport()) {
    error(
      'renderToStringAsync: AsyncLocalStorage is unavailable on this runtime; ' +
        'concurrent renders will share request state (hydration keys, provide/inject).',
    );
  }

  // Keep both the SSR request store and the reactive scope alive for the
  // ENTIRE async render lifetime, including serialization: thunks produced by
  // compiled children execute inside resolveAsync, so it must run before
  // runInFreshScopeAsync's finally disposes the scope — otherwise Portal()
  // and inject() calls inside deferred thunks would lose this request.
  // resetHydrationKey runs INSIDE the store (see renderToString).
  return runWithSSRContext(context, () =>
    runInFreshScopeAsync(async () => {
      resetHydrationKey();
      let result: unknown = component(props as P);
      if (isPromise(result)) {
        result = await result;
      }
      return resolveAsync(result);
    }, null),
  );
}

/**
 * Promise-aware variant of {@link resolve} used by {@link renderToStringAsync}.
 * Recursively unwraps promises and arrays of promises, then defers to the
 * synchronous `resolve` (component-boundary semantics: bare strings are raw).
 */
async function resolveAsync(content: unknown): Promise<string> {
  if (isPromise(content)) {
    return resolveAsync(await content);
  }
  if (isArray(content)) {
    const parts = await Promise.all(content.map((c) => resolveAsync(c)));
    return parts.join('');
  }
  if (isFunction(content)) {
    return resolveAsync((content as () => unknown)());
  }
  return resolve(content);
}

/**
 * Create a SSG component (renders component to string).
 *
 * The component executes inside a child scope that inherits from the current
 * active scope, so `inject()` calls can resolve values from ancestor
 * `provide()` calls, and `provide()` inside the component is scoped to it.
 *
 * @param component - The component to create.
 * @param props - The props to pass to the component.
 * @returns {string} The rendered primitive HTML string.
 */
export function createSSRComponent<P extends ComponentProps = ComponentProps>(
  component: SSRComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  if (!isFunction(component)) {
    error('createSSRComponent: Component is not a function');
    return '';
  }

  // Inherit the active scope (set by the enclosing renderToString call or by
  // an outer createSSRComponent) so that provide/inject follow the component
  // tree hierarchy. `resolve` must run INSIDE the fresh scope too: compiled
  // children are lazy thunks that resolve() invokes, and they must still see
  // this component's provide() state (same fix as renderToString).
  return runInFreshScope(() => {
    const result = component(props as P);
    assertSyncRenderResult(result, 'createSSRComponent');
    return resolve(result);
  });
}

/**
 * Compiler-only component helper.
 *
 * Brands the already-safe primitive returned by {@link createSSRComponent} so
 * nested compiled composition can cross another serialization boundary.
 */
export function ssrComponent<P extends ComponentProps = ComponentProps>(
  component: SSRComponentFn<P>,
  props: P | ComponentProps = {},
): SSRNode {
  return createSSRNode(createSSRComponent(component, props));
}
