export { template, createApp } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { addEventListener, bindElement, insert, mapNodes } from './binding';

export { delegateEvents } from './events';

// Props utilities
export { omitProps } from './utils/props';

// DOM utilities
export { removeNode, insertNode, replaceNode, getFirstDOMNode } from './utils/dom';

// Node utilities
export { normalizeNode, isSameNode, shallowCompare } from './utils/node';

export { isHydrating, startHydration, endHydration } from './utils/shared';

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
