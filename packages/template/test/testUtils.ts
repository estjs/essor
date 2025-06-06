import { createApp } from '../src';

export function mount(code) {
  const container = document.createElement('div');
  const nodes = createApp(code, container);

  return {
    nodes,
    innerHTML: () => container.innerHTML,
    text: () => container.textContent,
    get: name => container.querySelector(name),
  };
}
