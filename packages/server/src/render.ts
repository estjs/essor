import { error, isFunction, isPromise } from '@estjs/shared';
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
import { injectHydrationKeys, toRawHtmlString } from './utils';

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

  // Convert the result to string
  return toRawHtmlString(result);
}

/**
 * Render template with components (used by babel plugin in SSG mode).
 *
 * @param templates - The template fragments.
 * @param hydrationKey - The hydration key.
 * @param components - The rendered component strings.
 * @returns {string} The rendered HTML string.
 */
export function render(templates: string[], hydrationKey: string, ...components: string[]): string {
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
   *   return render(_tmpl, getHydrationKey(),
   *     createSSRComponent(Component1, {}),
   *     createSSRComponent(Component2, {}),
   *     createSSRComponent(Component3, {})
   *   );
   * }
   */

  // Direct string concatenation — avoids array allocation + join overhead
  // for typical 2-4 template fragments.
  const templateLen = templates.length;
  const componentLen = components.length;
  let content = '';

  for (let i = 0; i < templateLen; i++) {
    content += templates[i];
    if (i < componentLen && components[i]) {
      content += toRawHtmlString(components[i]);
    }
  }

  if (!hydrationKey) {
    return content;
  }

  // Inject hydration key attribute (data-hk) into the root element
  return injectHydrationKeys(content, hydrationKey);
}

/**
 * Async variant of {@link renderToString}. Awaits component results so that
 * `async` components and promise-returning expressions can participate in SSR.
 *
 * The awaited value is passed through the same toRawHtmlString pipeline as the
 * synchronous path, which itself transparently awaits any
 * nested promises (arrays of promises, promise-returning thunks, etc.).
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

  return toRawHtmlStringAsync(result);
}

/**
 * Promise-aware variant of `toRawHtmlString` used by {@link renderToStringAsync}.
 * Recursively unwraps promises and arrays of promises.
 */
async function toRawHtmlStringAsync(content: unknown): Promise<string> {
  if (isPromise(content)) {
    return toRawHtmlStringAsync(await content);
  }
  if (Array.isArray(content)) {
    const parts = await Promise.all(content.map((c) => toRawHtmlStringAsync(c)));
    return parts.join('');
  }
  if (isFunction(content)) {
    return toRawHtmlStringAsync((content as () => unknown)());
  }
  return toRawHtmlString(content);
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
 * @returns {string} The rendered component as a string.
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

  return toRawHtmlString(result);
}
