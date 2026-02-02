import type { PluginOptions } from './types';

// default options
export const DEFAULT_OPTIONS: PluginOptions = {
  mode: 'client',
  symbol: '$',
  props: true,
  hmr: true,
  styled: false,
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
  'omitProps',

  // component
  'createComponent',
  'Fragment',
  'For',
  'Suspense',
  'Portal',

  // Template related
  'mapNodes',
  'template',
  'delegateEvents',
  // styled
  'styled',
  // binding related
  'insert',
  'patchStyle',
  'patchClass',
  'patchAttr',
  'bindElement',
  'setSpread',
  'addEventListener',
  // rendering related
  'render',
  'escapeHTML',
  'getHydrationKey',
] as const;

// transform property name
export const TRANSFORM_PROPERTY_NAME = '__props';

// hmr component name
export const HMR_COMPONENT_NAME = '__$createHMRComponent$__';
