export { template, createApp } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

// Dependency injection
export { provide, inject, type InjectionKey } from './provide';

// Data binding and events
export { addEventListener, bindElement, insert, mapNodes } from './binding';

export { delegateEvents } from './events';

export { omitProps } from './utils';

export * from './operations';
export * from './components';
export * from './server';
export * from './types';
