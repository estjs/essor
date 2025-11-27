import { error } from '@estjs/shared';
import type { InjectionKey } from './provide';

/**
 * context interface
 */
export interface Context {
  id: number;
  parent: Context | null;
  provides: Map<InjectionKey<unknown> | number | string | symbol, any>;
  cleanup: Set<() => void>;
  mount: Set<() => void | Promise<void>>;
  update: Set<() => void | Promise<void>>;
  destroy: Set<() => void | Promise<void>>;
  isMount: boolean;
  isDestroy: boolean;
  children: Set<Context>;
}

// active context
let activeContext: Context | null = null;
// context stack
const contextStack: Context[] = [];
let contextId = 0;

/**
 * create a new context
 * @param {Context} parent - the parent context
 * @returns {Context} the new context
 */
export function createContext(parent: Context | null = null) {
  const context: Context = {
    id: ++contextId,
    parent,
    provides: new Map(),
    cleanup: new Set(),
    mount: new Set(),
    update: new Set(),
    destroy: new Set(),
    isMount: false,
    isDestroy: false,
    children: new Set(),
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
export function withContext<T>(context: Context, fn: () => T): T {
  pushContextStack(context);
  try {
    return fn();
  } finally {
    popContextStack();
  }
}

/**
 * find a parent context
 */
export function findParentContext(): Context | null {
  // use current active context
  if (activeContext) {
    return activeContext;
  }

  // find the first not destroy context from the top of the stack
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const contextItem = contextStack[i];
    if (contextItem && !contextItem.isDestroy) {
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
  // already destroy
  if (!context || context.isDestroy) {
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
  // already destroy
  if (!context || context.isDestroy) {
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
    context.mount.clear();
    context.update.clear();
    context.destroy.clear();

    // provides
    context.provides.clear();

    // Empty children set
    context.children.clear();
  } catch (error_) {
    error('Error during context cleanup:', error_);
  }

  // mark as destroy
  context.isDestroy = true;
}
