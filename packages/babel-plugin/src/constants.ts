import type { PluginOptions } from './types';

// default options
export const DEFAULT_OPTIONS: PluginOptions = {
  mode: 'client',
  symbol: '$',
  props: true,
  hmr: true,
  styled: true,
};

// Rendering mode
export enum RENDER_MODE {
  CLIENT = 'client',
  SSR = 'ssr',
  SSG = 'ssg',
}

export const IMPORTS_MAPS = [
  // Reactive API
  'signal',
  'computed',
  'reactive',
  'memoEffect',

  // Template related
  'mapNodes',
  'Fragment',
  'template',
  'delegateEvents',

  'createComponent',
  'styled', // styled

  // binding related
  'insert',
  'setStyle',
  'setClass',
  'setAttr',
  'bindAttr',
  'setSpread',
  'addEventListener',

  // rendering related
  'render',
  'escapeHTML',
  'getHydrationKey',
] as const;

// Static Site Generation API
export const SSG_IMPORTS_MAPS = {
  createComponent: 'createSSGComponent',
  setAttr: 'setSSGAttr',
} as const;

// Server-side Rendering API
export const SSR_IMPORTS_MAPS = {
  mapNodes: 'mapSSRNodes',
  template: 'getElement',
} as const;
