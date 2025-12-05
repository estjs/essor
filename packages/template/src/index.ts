export { template, createApp } from './renderer';

export {
  Component,
  createComponent,
  isComponent,
  type ComponentFn,
  type ComponentProps,
} from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

// Dependency injection
export { provide, inject, type InjectionKey } from './provide';

// Data binding and events
export { addEventListener, bindElement, insert, mapNodes } from './binding';

export { delegateEvents } from './events';

export * from './operations';
export * from './components';
export * from './server';
