import type { InjectionKey, RenderContext, RenderedNodeMap } from './types';

// Current active context
let activeContext: RenderContext | null = null;

/**
 * Creates a new render context
 */
export function createContext(): RenderContext {
  const context: RenderContext = {
    mounted: new Set(),
    unmounted: new Set(),
    updated: new Set(),
    renderedIndex: 0,
    renderedNodes: {},
    cleanup: new Set(),
    provides: new Map(),
    parent: activeContext,
  };
  activeContext = context;
  return activeContext;
}

/**
 * Gets the current active context
 */
export function getCurrentContext(): RenderContext | null {
  return activeContext;
}

/**
 * Sets the current active context
 */
export function setCurrentContext(context: RenderContext | null): void {
  activeContext = context;
}

/**
 * Provides a value that can be injected into child components
 * @param key Injection key
 * @param value Value to be provided
 */
export function provide<T>(key: InjectionKey<T> | string, value: T): void {
  const context = getCurrentContext();
  if (!context) {
    throw new Error('provide() can only be used inside setup() or functional components.');
  }

  context.provides.set(key, value);
}

/**
 * Injects a value provided by parent components
 * @param key Injection key
 * @param defaultValue Optional default value
 * @returns The injected value
 */
export function inject<T>(key: InjectionKey<T> | string, defaultValue?: T): T {
  const context = getCurrentContext();
  if (!context) {
    throw new Error('not found context');
  }

  // Search from current context up through the parent chain
  let current: RenderContext | null = context;

  while (current) {
    if (current.provides.has(key)) {
      return current.provides.get(key) as T;
    }
    current = current.parent;
  }

  if (defaultValue) {
    return defaultValue as T;
  }

  throw new Error(`injection "${String(key)}" not found.`);
}

export function popContext(): void {
  if (activeContext?.parent) {
    activeContext = activeContext.parent;
  }
}
/**
 * Executes a function within a specified context
 */
export function withContext<T>(context: RenderContext, fn: () => T): T {
  setCurrentContext(context);
  try {
    return fn();
  } finally {
    popContext();
  }
}

/**
 * Gets or initializes a Map in renderedNodes
 * @param context The render context
 * @param index The index
 * @returns The initialized Map
 */
export function getOrInitRenderedNodes(context: RenderContext, index: number): RenderedNodeMap {
  if (!context.renderedNodes[index]) {
    context.renderedNodes[index] = new Map();
  }
  return context.renderedNodes[index];
}
/**
 * Creates an injection key
 */
export function createInjectionKey<T>(description: string): InjectionKey<T> {
  return Symbol(description) as InjectionKey<T>;
}
