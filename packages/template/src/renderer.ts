import { isString, warn } from '@estjs/shared';
import { type Component, createComponent, isComponent } from './component';
import { createScope, disposeScope, onCleanup, runWithScope } from './scope';
import { beginHydration, endHydration } from './hydration';
import { insert, insertNode } from './dom';
import { inject, provide } from './provide';
import type {
  App,
  AppConfig,
  AppContext,
  AppInstance,
  ComponentFn,
  ComponentProps,
  CreateAppOptions,
  ErrorInfo,
  Plugin,
  PluginEntry,
} from './types';

const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : '';
const ENFORCE_ORDER = { pre: 0, default: 1, post: 2 } as const;

/**
 * Create a reusable template factory from an HTML string. Parsed once, cloned per call.
 * Caller is responsible for ensuring `html` is trusted.
 */
export function template(html: string) {
  let node: Node | undefined;

  /**
   * Creates the cached template root node on first use.
   */
  const create = (): Node => {
    // Regular HTML template
    const template = document.createElement('template');
    template.innerHTML = html;
    const firstChild = template.content.firstChild;
    if (!firstChild) {
      throw new Error('Invalid template: empty content');
    }
    return firstChild;
  };

  // return a factory function: create the template when first called, reuse the cached template when called later
  return () => (node || (node = create())).cloneNode(true);
}

export function createApp<P extends ComponentProps = {}>(component: ComponentFn<P>): App;
export function createApp<
  P extends ComponentProps = {},
  A extends string | Element | CreateAppOptions = string | Element | CreateAppOptions,
>(component: ComponentFn<P>, arg: A): A extends string | Element ? AppInstance | undefined : App;
export function createApp<P extends ComponentProps = {}>(
  component: ComponentFn<P>,
  arg?: string | Element | CreateAppOptions,
): App | AppInstance | undefined | Promise<AppInstance | undefined> {
  // Form 1: createApp(App, '#app') — sync mount, no plugins
  if (isString(arg) || arg instanceof Element) {
    return buildApp(component).mount(arg) as AppInstance | undefined;
  }
  // Form 2: createApp(App) or Form 3: createApp(App, options)
  return buildApp(component, arg);
}

export function hydrate<P extends ComponentProps = {}>(
  component: ComponentFn<P>,
  target: string | Element,
): AppInstance | undefined | Promise<AppInstance | undefined> {
  return buildApp(component).hydrate(target);
}

export function definePlugin<T = void>(plugin: Plugin<T>): Plugin<T> {
  return plugin;
}

function buildApp<P extends ComponentProps = {}>(
  component: ComponentFn<P>,
  options?: CreateAppOptions,
): App {
  const plugins = options?.plugins ?? [];
  const config: AppConfig = { ...(options?.config ?? {}) };
  let mounted = false;

  function mount(
    target: string | Element,
    isHydrate: boolean,
  ): AppInstance | undefined | Promise<AppInstance | undefined> {
    if (mounted) {
      if (__DEV__) warn('App is already mounted');
      return;
    }
    mounted = true;

    const container = isString(target) ? document.querySelector(target) : (target as Element);
    if (!container) {
      if (__DEV__) {
        warn(`[essor] ${isHydrate ? 'hydrate' : 'createApp'}: target element not found: ${target}`);
      }
      return;
    }

    if (!isHydrate && container.innerHTML) {
      if (__DEV__) warn(`Target element is not empty, it will be cleared: ${target}`);
      container.innerHTML = '';
    }

    const scope = createScope();
    const mountHooks: Array<() => void> = [];
    const seenNames = new Set<string>();
    const seenRefs = new Set<Plugin<any>>();
    let activePluginName: string | undefined; // for ctx.warn / ctx.error to attribute
    let root: Component | undefined;

    function reportError(error: unknown, info: ErrorInfo) {
      if (config.errorHandler) config.errorHandler(info, error);
      else throw error;
    }

    // Stable sort by enforce; within bucket, array order wins (Vite/Nuxt model).
    // Slice to avoid mutating user's array; map+sort+map keeps it stable across all engines.
    const ordered = plugins
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const pa = ENFORCE_ORDER[normalizePlugin(a.entry).enforce ?? 'default'];
        const pb = ENFORCE_ORDER[normalizePlugin(b.entry).enforce ?? 'default'];
        return pa - pb || a.index - b.index;
      })
      .map((x) => x.entry);

    function runSetup(plugin: Plugin<any>, opts: unknown): void | Promise<void> {
      if (seenRefs.has(plugin) || seenNames.has(plugin.name)) {
        if (__DEV__) warn(`Plugin "${plugin.name}" is already registered, skipping`);
        return;
      }
      seenRefs.add(plugin);
      seenNames.add(plugin.name);

      activePluginName = plugin.name;
      try {
        const result = plugin.setup(ctx, opts);
        if (result instanceof Promise) {
          // Pin the name to the start of the async chain; clear after the promise resolves.
          const pinned = plugin.name;
          return result
            .catch((error) => reportError(error, { phase: 'install', plugin: pinned }))
            .finally(() => {
              if (activePluginName === pinned) activePluginName = undefined;
            });
        }
        activePluginName = undefined;
        return result;
      } catch (error) {
        activePluginName = undefined;
        reportError(error, { phase: 'install', plugin: plugin.name });
      }
    }

    const ctx: AppContext = {
      provide,
      inject,
      onMount: (fn) => void mountHooks.push(fn),
      onCleanup,
      warn(message) {
        const info = { plugin: activePluginName };
        if (config.warnHandler) config.warnHandler(info, message);
        else if (__DEV__) warn(message);
      },
      error(message): never {
        throw new Error(message);
      },
      config,
      version: VERSION,
    };

    function finishMount(): AppInstance | undefined {
      if (isHydrate) beginHydration(container!);
      try {
        const node = createComponent(component);
        if (isComponent(node)) {
          root = node;
          (isHydrate ? insert : insertNode)(container!, node);
        }
      } finally {
        if (isHydrate) endHydration();
      }

      for (const fn of mountHooks) {
        try {
          fn();
        } catch (error) {
          reportError(error, { phase: 'mount' });
        }
      }

      return {
        root,
        unmount() {
          disposeScope(scope);
          root?.destroy();
        },
      };
    }

    let asyncTail: Promise<void> | undefined;

    try {
      runWithScope(scope, () => {
        // Phase order: plugin setups (sorted) → root → onMount hooks
        for (const entry of ordered) {
          const [plugin, opts] = unpack(entry);

          if (asyncTail) {
            // A previous setup was async; everything after it waits on the chain.
            asyncTail = asyncTail.then(() =>
              runWithScope(scope, () => {
                const r = runSetup(plugin, opts);
                return r instanceof Promise ? r : undefined;
              }),
            );
            continue;
          }

          const result = runSetup(plugin, opts);
          if (result instanceof Promise) asyncTail = result;
        }
      });
    } catch (error) {
      disposeScope(scope);
      throw error;
    }

    if (asyncTail) {
      return asyncTail
        .then(() => runWithScope(scope, finishMount))
        .catch((error) => {
          disposeScope(scope);
          throw error;
        });
    }

    try {
      return runWithScope(scope, finishMount);
    } catch (error) {
      disposeScope(scope);
      throw error;
    }
  }

  const app: App = {
    config,
    mount: (target) => mount(target, false),
    hydrate: (target) => mount(target, true),
  };

  return app;
}

/** Normalize a `PluginEntry` into the underlying `Plugin` (without options). */
function normalizePlugin(entry: PluginEntry): Plugin<any> {
  return Array.isArray(entry) ? entry[0] : (entry as Plugin<any>);
}

/** Normalize a `PluginEntry` into `[plugin, options]`. */
function unpack(entry: PluginEntry): [Plugin<any>, unknown] {
  return Array.isArray(entry) ? [entry[0], entry[1]] : [entry as Plugin<any>, undefined];
}
