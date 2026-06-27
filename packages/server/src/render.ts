import { error, isFunction, isPromise, isString } from '@estjs/shared';
import { type ComponentFn, type ComponentProps, resetHydrationKey } from '@estjs/template';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  runWithScope,
  setActiveScope,
} from '@estjs/template/internal';
import { type SSRContext, runWithSSRContext } from './context';
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
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): string {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  // Reset the hydration key counter
  resetHydrationKey();

  // Render the component within a fresh root scope (parent: null).
  const result = runWithSSRContext(context, () =>
    runInFreshScope(() => component(props as P), null),
  );

  if (__DEV__ && isPromise(result)) {
    error('renderToString received a Promise — use renderToStringAsync for async components.');
  }

  // Serialize to the final HTML string at the component boundary. `resolve`
  // emits the already-final HTML string from render()/createSSRComponent()
  // verbatim and treats a bare string component result as trusted raw HTML.
  return resolve(result);
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
  /**
   * JSX source code:
   * <div>
   *   <div>
   *     <Component1 />
   *     <Component2 />
   *   </div>
   *   <Component3 />
   * </div>
   *
   * Compiles to:
   *
   * let _tmpl = [
   *   '<div><div>',
   *   '</div>',
   *   '</div>',
   * ]
   *
   * function component(props) {
   *   return ssr(_tmpl, getHydrationKey(),
   *     ssrComponent(Component1, {}),
   *     ssrComponent(Component2, {}),
   *     ssrComponent(Component3, {})
   *   );
   * }
   */

  // Direct string concatenation — avoids array allocation + join overhead
  // for typical 2-4 template fragments.
  const templateLen = templates.length;
  const slotLen = slots.length;
  let content = '';

  for (let i = 0; i < templateLen; i++) {
    content += templates[i];
    if (i < slotLen) {
      const slot = slots[i];
      // Slots are pre-serialized strings from compile-time helpers; coerce
      // defensively for the rare runtime that passes a non-string (number,
      // etc.), but do NOT escape — escaping already happened per slot.
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
export function ssr(templates: string[], hydrationKey: string, ...slots: unknown[]): string {
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
export async function renderToStringAsync<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
  context: SSRContext | null = null,
): Promise<string> {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  resetHydrationKey();

  // Keep both the SSR context and the reactive scope active for the entire
  // async render lifetime. This ensures that Portal() calls after an `await`
  // inside async components can still access `getSSRContext()`.
  const result = await runInFreshScopeAsync(
    () =>
      runWithSSRContext(context, async () => {
        let result: unknown = component(props as P);
        if (isPromise(result)) {
          result = await result;
        }
        return result;
      }),
    null,
  );

  return resolveAsync(result);
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
  if (Array.isArray(content)) {
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
 * Returns a plain HTML string so the component's output is interpolated
 * verbatim when nested as a slot in a parent render().
 *
 * @param component - The component to create.
 * @param props - The props to pass to the component.
 * @returns {string} The rendered component HTML string.
 */
export function createSSRComponent<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  if (!isFunction(component)) {
    error('createSSRComponent: Component is not a function');
    return '';
  }

  // Inherit the active scope (set by the enclosing renderToString call or by
  // an outer createSSRComponent) so that provide/inject follow the component
  // tree hierarchy.
  const result = runInFreshScope(() => component(props as P));

  // Component boundary: `resolve` treats a bare string return as trusted raw
  // HTML and coerces other final values to their HTML string.
  return resolve(result);
}

/**
 * Compiler-only component helper.
 *
 * Public createSSRComponent() returns a string for manual SSR composition.
 * Compiled JSX needs a trusted node so nested component output can pass through
 * child-text escape() without becoming escaped text.
 */
export function ssrComponent<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  return createSSRNode(createSSRComponent(component, props));
}
