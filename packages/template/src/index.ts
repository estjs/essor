export { template, createApp, hydrate, definePlugin } from './renderer';

export { Component, createComponent, isComponent } from './component';

export { onMount, onDestroy, onUpdate } from './lifecycle';

export { provide, inject, type InjectionKey } from './provide';

export { bindElement } from './binding';

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

export type {
  ComponentProps,
  ComponentFn,
  App,
  AppConfig,
  AppContext,
  AppInstance,
  CreateAppOptions,
  ErrorInfo,
  Plugin,
  PluginEntry,
} from './types';
