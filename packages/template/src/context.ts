import { error } from '@estjs/shared';
import type { InjectionKey } from './provide';

/**
 * context interface
 */
export interface Context {
  isMounted: boolean;
  isDestroyed: boolean;

  mounted: Set<() => void>;
  updated: Set<() => void>;
  destroyed: Set<() => void>;

  provides: Map<InjectionKey<unknown> | string | number, unknown>;

  cleanup: Set<() => void>;

  deps: Map<unknown, Set<(newValue: unknown, prevValue?: unknown) => void>>;
  componentEffect: Set<() => void>;

  parent: Context | null;
  children: Set<Context>;
}

// active context
let activeContext: Context | null = null;
// context stack
const contextStack: Context[] = [];

/**
 * create a new context
 * @param {Context} parent - the parent context
 * @returns {Context} the new context
 */
export function createContext(parent: Context | null = null) {
  const context: Context = {
    // status
    isMounted: false,
    isDestroyed: false,

    // lifecycle
    mounted: new Set(),
    updated: new Set(),
    destroyed: new Set(),

    // provide
    provides: new Map(parent?.provides || []),

    // clearup
    cleanup: new Set(),

    // parent
    parent,
    children: new Set<Context>(),

    // deps
    deps: new Map(),
    componentEffect: new Set(),
  };

  if (parent) {
    parent.children.add(context);
  }

  return context;
}

/**
 * get the active context
 */
export function getActiveContext(): Context | null {
  return activeContext;
}

/**
 * set the active context
 * @param {Context} context - the context to set as active
 */
export function setActiveContext(context: Context | null) {
  activeContext = context;
}

/**
 * push a context to the stack
 * @param {Context} context - the context to push to the stack
 */
export function pushContextStack(context: Context): void {
  if (activeContext) {
    contextStack.push(activeContext);
  }
  activeContext = context;
}

/**
 * pop a context from the stack
 */
export function popContextStack(): void {
  activeContext = contextStack.pop() || null;
}

/**
 * find a parent context
 */
export function findParentContext(): Context | null {
  // use current active context
  if (activeContext) {
    return activeContext;
  }

  // find the first not destroyed context from the top of the stack
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const contextItem = contextStack[i];
    if (contextItem && !contextItem.isDestroyed) {
      return contextItem;
    }
  }

  return null;
}
/**
 * destroy a context and all its children
 * @param {Context} context - the context to destroy
 */
export function destroyContext(context: Context): void {
  // already destroyed
  if (!context || context.isDestroyed) {
    return;
  }

  // Make a copy of children to avoid modification during iteration
  const childrenToDestroy = Array.from(context.children);

  // destroy all children contexts
  childrenToDestroy.forEach(destroyContext);

  // cleanup the current context
  cleanupContext(context);
}

/**
 * cleanup a context
 * @param {Context} context - the context to cleanup
 */
export function cleanupContext(context: Context) {
  // already destroyed
  if (!context || context.isDestroyed) {
    return;
  }

  // Clean parent-child relationship to break potential circular references
  if (context.parent) {
    context.parent.children.delete(context);
    context.parent = null;
  }

  try {
    // cleanup functions
    context.cleanup.forEach(fn => fn());
    context.cleanup.clear();

    // lifecycle
    context.mounted.clear();
    context.updated.clear();
    context.destroyed.clear();

    // deps
    context.deps.clear();

    // componentEffect
    context.componentEffect.clear();

    // Empty children set
    context.children.clear();
  } catch (error_) {
    error('Error during context cleanup:', error_);
  }

  // mark as destroyed
  context.isDestroyed = true;
}
