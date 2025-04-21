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
  'render',
  'createSSGComponent',
  'setSSGAttr',
  'escapeHTML',

  // Server-side rendering API
  'mapSSRNodes',
  'getHydrationKey',
  'getNextElement',

  // HMR API
  'createHMR',
  'acceptHMR',
] as const;

export const SERVER_IMPORTS = [
  'render',
  'createSSGComponent',
  'setSSGAttr',
  'escapeHTML',
  'mapSSRNodes',
  'getHydrationKey',
  'getNextElement',
] as const;
