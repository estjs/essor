export { template, createApp, hydrate } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { bindElement, type BindModifiers } from './binding';

export { delegateEvents, clearDelegatedEvents, addEventListener } from './events';

export { omitProps } from './utils';

export { insert, next, child, nthChild } from './dom';

export {
  isHydrating,
  beginHydration,
  endHydration,
  getHydrationKey,
  resetHydrationKey,
  getRenderedElement,
  patchClassHydrate,
  patchAttrHydrate,
  patchStyleHydrate,
  hydrationAnchor,
  hydrationMarker,
  consumeTeleportAnchor,
  consumeTeleportBlock,
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
  setHydrateResources,
  clearHydrateResources,
  defineAsyncComponent,
  type AsyncComponentOptions,
  For,
  Transition,
  isTransition,
  type TransitionProps,
  TransitionGroup,
  isTransitionGroup,
  type TransitionGroupProps,
} from './components';

export type { ComponentProps, ComponentFn, AppInstance } from './types';
