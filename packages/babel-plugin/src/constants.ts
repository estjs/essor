import type { Options } from './types';

// default options
export const DEFAULT_OPTIONS: Options = {
  // Rendering mode: client | ssr | ssg
  mode: 'client',
  // Reactive system identifier
  symbol: '$',
  // Whether to automatically handle props destructuring
  props: true,
  // WIP: Whether to enable hot module replacement
  hmr: true,
};

export enum RENDER_MODE {
  CLIENT = 'client',
  SSR = 'ssr',
  SSG = 'ssg',
}

export const USED_IMPORTS = [
  // Reactive API
  'signal',
  'computed',
  'reactive',

  // HMR API
  'createHMR',
  'acceptHMR',

  'Fragment',

  // Template related
  'template',

  // Node mapping
  'mapNodes',

  'insert',
  'setStyle',
  'setClass',
  'setAttr',
  'setSpread',
  'addEventListener',
  'createComponent',

  'render',
  'escapeHTML',
  'getHydrationKey',
  'getRenderedElement',
];

// Static Site Generation API
export const SSG_IMPORTS_MAPS = {
  createComponent: 'createSSGComponent',
  setAttr: 'setSSGAttr',
};

//
export const SSR_IMPORTS_MAPS = {
  mapNodes: 'mapSSRNodes',
  template: 'getRenderedElement',
  // inset: 'insertSSR',
  // setClass: 'setSSRClass',
  // setStyle: 'setSSRStyle',
  // addEventListener: 'addSSREventListener',
  // setAttr: 'setSSRAttr',
  // setSpread: 'setSSRSpread',
};
