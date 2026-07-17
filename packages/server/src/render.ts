import { error, isArray, isFunction, isPromise, isString } from '@estjs/shared';
import { type ComponentFn, type ComponentProps, resetHydrationKey } from '@estjs/template';
import {
  type Scope,
  SSR_ASYNC_CONTEXT_ERROR,
  createSSRExecutionState,
  createScope,
  disposeScope,
  getActiveScope,
  getSSRExecutionCarrier,
  runWithScope,
  setActiveScope,
} from '@estjs/template/internal';
import { type SSRContext, hasSSRExecutionCarrier, runWithSSRContext } from './context';
import { createCollectingResourceBridge, type CollectingResourceBridge } from './resource-bridge';
import { createSSRNode, injectHydrationKeys, resolve } from './utils';

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
 * Async variant of {@link runInFreshScope}. Keeps the scope alive across
 * `await` boundaries by manually saving/restoring the active scope instead
 * of using {@link runWithScope}.
 */
async function runInFreshScopeAsync<T>(
  fn: () => Promise<T>,
  parent: Scope | null = getActiveScope(),
): Promise<T> {
  const scope = createScope(parent);
  const prevScope = getActiveScope();
  setActiveScope(scope);
  try {
    return await fn();
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

function runWithExecutionStateSync<T>(context: SSRContext | null, fn: () => T): T {
  const carrier = getSSRExecutionCarrier();
  if (!carrier) {
    // Sync path may still run without ALS (e.g. constrained runtimes). Use a
    // module-local reset for isolation between sequential sync renders only.
    resetHydrationKey();
    return runWithSSRContext(context, fn);
  }
  const state = createSSRExecutionState({
    hydrationKey: 0,
    activeScope: null,
    resources: context?.resources,
  });
  return carrier.run(state, () => runWithSSRContext(context, fn)) as T;
}

async function runWithExecutionStateAsync<T>(
  context: SSRContext | null,
  fn: () => Promise<T>,
): Promise<T> {
  const carrier = getSSRExecutionCarrier();
  if (!carrier || !hasSSRExecutionCarrier()) {
    throw new Error(SSR_ASYNC_CONTEXT_ERROR);
  }
  const state = createSSRExecutionState({
    hydrationKey: 0,
    activeScope: null,
    resources: context?.resources,
  });
  return (await carrier.run(state, fn)) as T;
}

/**
 * Render a component to HTML string.
 *
 * Each invocation runs inside its own root scope so that `provide()` calls
 * stay isolated between independent `renderToString` calls.
 */
export function renderToString<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): string {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  const result = runWithExecutionStateSync(context, () =>
    runInFreshScope(() => component(props as P), null),
  );

  assertSyncRenderResult(result, 'renderToString');
  return resolve(result);
}

/**
 * Render template with components (used by babel plugin in SSG mode).
 */
export function render(templates: string[], hydrationKey: string, ...slots: unknown[]): string {
  const templateLen = templates.length;
  const slotLen = slots.length;
  let content = '';

  for (let i = 0; i < templateLen; i++) {
    content += templates[i];
    if (i < slotLen) {
      const slot = slots[i];
      content += isString(slot) ? slot : resolve(slot);
    }
  }

  return hydrationKey ? injectHydrationKeys(content, hydrationKey) : content;
}

/**
 * Compiler-only SSR template helper.
 */
export function ssr(templates: string[], hydrationKey: string, ...slots: unknown[]): string {
  return createSSRNode(render(templates, hydrationKey, ...slots));
}

/**
 * Async variant of {@link renderToString}. Awaits component results so that
 * `async` components and promise-returning expressions can participate in SSR.
 *
 * Isolation: each call creates a request-local {@link SSRExecutionState}
 * (hydration counter, active scope, resource bridge) and runs the full
 * promise lifetime inside the async context carrier. Concurrent renders must
 * not observe each other's keys or scopes.
 */
export async function renderToStringAsync<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): Promise<string> {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  return runWithExecutionStateAsync(context, () =>
    runInFreshScopeAsync(
      () =>
        runWithSSRContext(context, async () => {
          let result: unknown = component(props as P);
          if (isPromise(result)) {
            result = await result;
          }
          return resolveAsync(result);
        }),
      null,
    ),
  );
}

/**
 * Multi-pass async render with resource bridge collection.
 * Max 10 passes; throws ESSOR_SSR_RESOURCE_LOOP when a pass still creates new keys.
 */
export async function renderToStringAsyncMultiPass<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
  options: { maxPass?: number } = {},
): Promise<{ html: string; passes: number; bridge: CollectingResourceBridge }> {
  const maxPass = options.maxPass ?? 10;
  const bridge =
    (context?.resources as CollectingResourceBridge | undefined) ?? createCollectingResourceBridge();
  const ctx: SSRContext = { ...(context ?? { teleports: Object.create(null) }), resources: bridge };

  let html = '';
  let passes = 0;
  const allNewKeys: string[][] = [];

  for (let pass = 0; pass < maxPass; pass++) {
    passes = pass + 1;
    bridge.beginPass();
    html = await renderToStringAsync(component, props, ctx);
    const newKeys = [...bridge.keysAddedInPass];
    allNewKeys.push(newKeys);
    if (!bridge.hasPending()) break;
    await bridge.waitPending();
    if (pass === maxPass - 1 && bridge.hasPending()) {
      throw new Error(
        `ESSOR_SSR_RESOURCE_LOOP: exceeded ${maxPass} passes; new keys per pass=${JSON.stringify(allNewKeys)}`,
      );
    }
  }

  // Final pass after last pending resolved (if last loop broke on pending clear mid-way)
  if (bridge.hasPending()) {
    await bridge.waitPending();
    bridge.beginPass();
    html = await renderToStringAsync(component, props, ctx);
    passes += 1;
  } else if (passes > 0 && allNewKeys[passes - 1]?.length) {
    // One more pass to materialize ready values into HTML
    bridge.beginPass();
    html = await renderToStringAsync(component, props, ctx);
    passes += 1;
  }

  return { html, passes, bridge };
}

/**
 * Promise-aware variant of {@link resolve} used by {@link renderToStringAsync}.
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
 */
export function createSSRComponent<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  if (!isFunction(component)) {
    error('createSSRComponent: Component is not a function');
    return '';
  }

  const result = runInFreshScope(() => component(props as P));
  assertSyncRenderResult(result, 'createSSRComponent');
  return resolve(result);
}

/**
 * Compiler-only component helper.
 */
export function ssrComponent<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  return createSSRNode(createSSRComponent(component, props));
}
