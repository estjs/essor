import babel from '@babel/core';
import babelPlugin from 'babel-plugin-essor';
import { type Scope, createScope, disposeScope, runWithScope } from '../src/scope';

/**
 * Mount a component to a container for testing
 * @param componentFn - Component function to mount
 * @param container - Container element to mount into
 */
import { insert } from '../src/binding';

export function createTestRoot(id = 'app'): HTMLElement {
  let root = document.querySelector(`#${id}`) as HTMLElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    document.body.appendChild(root);
  }
  root.innerHTML = '';
  return root;
}

export function resetEnvironment(): void {
  document.body.innerHTML = '';
}

export function transform(code: string, opts): string {
  const result = babel.transformSync(code, {
    filename: 'test.jsx',
    sourceType: 'module',
    plugins: [[babelPlugin, opts]],
  });
  if (result?.code) {
    return result.code;
  }
  return code;
}

/**
 * Mount a component to a container for testing
 * @param componentFn - Component function to mount
 * @param container - Container element to mount into
 * @returns The scope for cleanup
 */
export function mount(componentFn: () => any, container: HTMLElement): Scope {
  const scope = createScope(null);
  runWithScope(scope, () => {
    insert(container, componentFn);
  });
  return scope;
}

/**
 * Unmount a component by disposing its scope
 * @param scope - The scope returned from mount
 */
export function unmount(scope: Scope): void {
  disposeScope(scope);
}
