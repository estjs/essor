import babel from '@babel/core';
import babelPlugin from 'babel-plugin-essor';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  setActiveScope,
} from '../src/scope';

/**
 * Mount a component to a container for testing
 * @param componentFn - Component function to mount
 * @param container - Container element to mount into
 */
import { insert } from '../src/binding';

export function createContext(parent: Scope | null = null): Scope {
  return createScope(parent ?? getActiveScope());
}

export function pushContextStack(context: Scope): void {
  setActiveScope(context);
}

export function popContextStack(): void {
  const current = getActiveScope();
  setActiveScope(current?.parent ?? null);
}

export function cleanupContext(context: Scope): void {
  disposeScope(context);
}

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
 */
export function mount(componentFn: () => any, container: HTMLElement): Scope {
  const context = createContext(null);
  pushContextStack(context);
  insert(container, componentFn);
  popContextStack();
  return context;
}

export function unmount(scope: Scope | null | undefined): void {
  if (!scope) return;
  disposeScope(scope);
}
