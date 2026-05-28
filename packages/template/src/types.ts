import type { Computed, Signal } from '@estjs/signals';
import type { Component } from './component';
import type { InjectionKey } from './provide';

export type AnyNode =
  | Node
  | Component<any>
  | Element
  | string
  | number
  | boolean
  | null
  | undefined
  | AnyNode[]
  | (() => AnyNode)
  | Signal<AnyNode>
  | Computed<AnyNode>;

export type ComponentProps = Record<string, unknown>;
export type ComponentFn<P = ComponentProps> = (props: P) => AnyNode;

// ---------------------------------------------------------------------------
// Plugin system
// ---------------------------------------------------------------------------

/** Phase + plugin name passed to error/warn handlers. */
export interface ErrorInfo {
  phase: 'install' | 'mount' | 'cleanup' | 'effect';
  plugin?: string;
}

/**
 * Application-level configuration. Plugins and user code can set these to
 * customize framework behaviour without monkey-patching internals.
 */
export interface AppConfig {
  /** Invoked when an uncaught error propagates out of a plugin / lifecycle hook / effect. */
  errorHandler?: (info: ErrorInfo, error: unknown) => void;
  /** Custom warn handler (dev only). When set, framework `warn()` calls are redirected here. */
  warnHandler?: (info: { plugin?: string }, message: string) => void;
}

/**
 * Context passed to every plugin's setup function. Plugins use this to
 * register providers, hook lifecycle events, and report problems.
 */
export interface AppContext {
  /** Provide a value at the application root scope, retrievable via `inject()`. */
  provide<T>(key: InjectionKey<T> | string | number, value: T): void;
  /** Inject a value from the application scope. Plugins ordered later can read what earlier plugins provided. */
  inject<T>(key: InjectionKey<T> | string | number, defaultValue?: T): T;

  /** Register a callback that runs after the root component mounts. */
  onMount(fn: () => void): void;
  /** Register a callback that runs when the application is unmounted. */
  onCleanup(fn: () => void): void;

  /** Non-fatal report. Routed to config.warnHandler if set, otherwise a dev console warning. */
  warn(message: string): void;
  /** Fatal report. Throws — plugin setup fails, mount() rejects. */
  error(message: string): never;

  /** Application config — readable and mutable by plugins. */
  config: AppConfig;
  /** Framework version (injected by the build; empty string in unbundled tests). */
  version: string;
}

/**
 * Plugin definition.
 *
 * @example
 * ```ts
 * const router = definePlugin<{ routes: Route[] }>({
 *   name: 'essor:router',
 *   enforce: 'pre',
 *   setup(ctx, options) {
 *     ctx.provide(RouterKey, createRouter(options.routes));
 *   },
 * });
 * ```
 */
export interface Plugin<TOptions = void> {
  /** Required. Used for dedup, error messages, ordering. */
  name: string;
  /** Coarse ordering bucket. Default 'default'. Order: pre → default → post; within bucket, array order wins. */
  enforce?: 'pre' | 'default' | 'post';
  /** Setup. May be async; mount() awaits it. */
  setup(ctx: AppContext, options: TOptions): void | Promise<void>;
}

/** Plugin entry in `CreateAppOptions.plugins` — bare or paired with options. */
export type PluginEntry = Plugin<void> | readonly [Plugin<any>, unknown];

/** Options accepted by the config-object form of `createApp(component, options)`. */
export interface CreateAppOptions {
  plugins?: ReadonlyArray<PluginEntry>;
  config?: Partial<AppConfig>;
}

/**
 * Application builder returned by `createApp(component)` or `createApp(component, options)`.
 *
 * @example
 * ```ts
 * await createApp(App, {
 *   plugins: [router, [store, { initial: {} }]],
 * }).mount('#root');
 * ```
 */
export interface App {
  /** Application config. Mutate before mounting to install error/warn handlers. */
  config: AppConfig;

  /** Mount into the DOM. Returns a Promise when any plugin has async setup; sync otherwise. */
  mount(target: string | Element): Promise<AppInstance | undefined> | AppInstance | undefined;
  /** Hydrate over SSR HTML. Returns a Promise when any plugin has async setup; sync otherwise. */
  hydrate(target: string | Element): Promise<AppInstance | undefined> | AppInstance | undefined;
}

/** A mounted application instance. */
export interface AppInstance {
  /** The root Component wrapper (undefined if mounting produced raw nodes). */
  root: Component | undefined;
  /** Tear down the application: dispose scopes, remove DOM nodes. */
  unmount: () => void;
}
