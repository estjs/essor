import { createApp } from '../src';

export function mount(code, props = {}) {
  const container = document.createElement('div');
  const nodes = createApp(code, container, props);

  return {
    nodes,
    innerHTML: () => container.innerHTML,
    text: () => container.textContent,
    get: name => container.querySelector(name),
  };
}
