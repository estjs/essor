import { h } from '../src';

export function mount(code, props = {}) {
  const container = document.createElement('div');
  const nodes = h(code, props).mount(container);

  return {
    nodes,
    text: () => container.textContent,
  };
}
