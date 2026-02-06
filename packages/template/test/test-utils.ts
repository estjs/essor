import { type Scope, createScope, disposeScope, runWithScope, setActiveScope } from '../src/scope';
import { triggerMountHooks } from '../src/lifecycle';
import { insert } from '../src';

let testRoots: HTMLElement[] = [];

/**
 * Create a test root element for mounting components
 * @param id - Optional ID for the root element
 * @returns HTML element to use as a root
 */
export function createTestRoot(id?: string): HTMLElement {
  const root = document.createElement('div');
  if (id) {
    root.id = id;
  }
  document.body.appendChild(root);
  testRoots.push(root);
  return root;
}

/**
 * Reset the test environment by removing all test roots
 * and clearing any global state
 */
export function resetEnvironment(): void {
  // Remove all test roots
  for (const root of testRoots) {
    root.remove();
  }
  testRoots = [];

  // Clear any active scope
  setActiveScope(null);
}

/**
 * Mount a component function with a scope
 * @param fn - The component function to mount
 * @param root - The root element to mount to
 * @returns The scope for cleanup
 */
export function mount(fn: any, root: HTMLElement): Scope {
  const scope = createScope(null);
  runWithScope(scope, () => {
    const result = fn();
    insert(root, result);
  });
  triggerMountHooks(scope);
  return scope;
}

/**
 * Unmount a component by disposing its scope
 * @param scope - The scope to dispose
 */
export function unmount(scope: Scope): void {
  disposeScope(scope);
}
