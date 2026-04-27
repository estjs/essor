export { template, createApp, hydrate } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { bindElement, insert, next, child, nthChild } from './binding';

export { delegateEvents, clearDelegatedEvents, addEventListener } from './events';

export { omitProps } from './utils';

export {
  isHydrating,
  beginHydration,
  endHydration,
  getHydrationKey,
  resetHydrationKey,
} from './hydration';

export {
  patchClass,
  normalizeClass,
  patchStyle,
  setStyle,
  patchAttr,
  addEvent,
} from './operations';

export {
  Fragment,
  isFragment,
  Portal,
  isPortal,
  Suspense,
  isSuspense,
  createResource,
  defineAsyncComponent,
  type AsyncComponentOptions,
  For,
} from './components';

export type { ComponentProps, ComponentFn } from './types';
