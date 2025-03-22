import type { Options } from './types';

// default options
export const DEFAULT_OPTIONS: Options = {
  // Rendering mode: client | ssr | ssg
  mode: 'client',
  // Reactive system identifier
  symbol: '$',
  // Whether to automatically handle props destructuring
  autoProps: true,
  // Whether to enable hot module replacement
  hmr: true,
};
// all used functions
export const USED_IMPORTS = [
  // Template related
  'template',
  'Fragment',

  // Node mapping
  'mapNodes',

  // Server-side rendering API
  'setSSRStyle',
  'setSSRClass',
  'setSSRAttr',
  'SSRInset',
  'getHydrationKey',
  'getNextElement',

  // Client-side API
  'insert',
  'setStyle',
  'setClass',
  'setAttr',
  'addEventListener',
  'createComponent',

  // Reactive API
  'signal',
  'computed',
  'reactive',

  // Static Site Generation API
  'renderSSG',
  'createSSGComponent',
  'setSSGAttr',
  'escapeHTML',

  // HMR API
  'createHMR',
  'acceptHMR',
] as const;
