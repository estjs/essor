import babel from '@babel/core';
import babelPlugin from 'babel-plugin-essor';
import { createContext, popContextStack, pushContextStack } from '../src/context';

export function createTestRoot(id = 'app'): HTMLElement {
  let root = document.getElementById(id) as HTMLElement | null;
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
export function mount(componentFn: () => Node, container: HTMLElement): void {
  const context = createContext(null);
  pushContextStack(context);

  const result = componentFn();

  if (result) {
    container.appendChild(result);
  }

  popContextStack();
}
