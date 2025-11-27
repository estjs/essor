import babel from '@babel/core';
import babelPlugin from 'babel-plugin-essor';
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
