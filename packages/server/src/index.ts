export { renderToString, renderToStringAsync, render, createSSGComponent } from './render';
export { convertToString, convertTextChildToString, addAttributes } from './utils';
export { escapeHTML } from '@estjs/shared';
export { setSSGAttr, normalizeProps } from './attrs';

// SSR attribute helpers (used by babel-plugin server-mode codegen)
export { ssrAttr, ssrClass, ssrStyle, ssrSpread } from './ssr';

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
