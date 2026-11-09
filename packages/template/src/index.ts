export { template } from './template';
export { createApp } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { bindElement, type BindModifiers, memoEffect } from './binding';

export { delegateEvents, clearDelegatedEvents, addEventListener } from './events';

export { omitProps } from './utils';

export { insert, insertTextContent, next, child, nthChild } from './dom';

export {
  hydrate,
  createSSRApp,
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
  hydrationRange,
  consumeTeleportAnchor,
  consumeTeleportBlock,
} from './hydration';

export type { HydrationBoundaryKind } from './hydration';

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
  type Resource,
  type ResourceActions,
  type ResourceState,
  type ResourceOptions,
  defineAsyncComponent,
  type AsyncComponentOptions,
  For,
  isFor,
  Transition,
  isTransition,
  type TransitionProps,
  TransitionGroup,
  isTransitionGroup,
  type TransitionGroupProps,
} from './components';

export type { AnyNode, ComponentFn, ComponentProps, AppInstance } from './types';
