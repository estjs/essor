export { template, createApp } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { addEventListener, bindElement, insert, mapNodes } from './binding';

export { delegateEvents } from './events';

export { omitProps } from './utils';

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
  FragmentProps,
  isFragment,
  Portal,
  PortalProps,
  isPortal,
  Suspense,
  SuspenseProps,
  isSuspense,
  createResource,
} from './components';
export { ComponentProps, ComponentFn } from './types';

export {
  Scope,
  createScope,
  runWithScope,
  disposeScope,
  getActiveScope,
  setActiveScope,
  onCleanup,
} from './scope';

// shared hydration status, used by the server and client
export { startHydration, endHydration, isHydrating } from './shared';
