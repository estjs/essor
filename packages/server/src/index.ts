export {
  render,
  ssr,
  createSSRComponent,
  ssrComponent,
  renderToString,
  renderToStringAsync,
} from './render';
export { escape, injectHydrationKeys, resolve, unsafeHTML } from './utils';
export type { SSRNode } from './utils';
export { escapeHTML } from '@estjs/shared';
export { ssrAttrDynamic, normalizeProps } from './attrs';

// SSR attribute helpers (used by babel-plugin server-mode codegen)
export {
  ssrAttr,
  ssrBind,
  ssrClass,
  ssrSelected,
  ssrStyle,
  ssrSpread,
  ssrTextContent,
  ssrTextValue,
} from './ssr';

// SSR versions of built-in components
export {
  Fragment,
  Portal,
  Suspense,
  For,
  TELEPORT_CALLSITE_ANCHOR,
  TELEPORT_BLOCK_START,
  TELEPORT_BLOCK_END,
} from './components';
export type { SSRComponentProps, SSRForProps, SSRPortalProps } from './components';

// SSR rendering context (Portal teleports, etc.)
export { createSSRContext, getSSRContext } from './context';
export type { SSRContext } from './context';

// Hydration key management (re-exported for server use)
export { getHydrationKey, resetHydrationKey } from '@estjs/template';
