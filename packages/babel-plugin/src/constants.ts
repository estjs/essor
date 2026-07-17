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
  'Transition',

  // Template related
  'mapNodes',
  'template',
  'delegateEvents',

  // binding related
  'insert',
  'insertTextContent',
  'patchStyle',
  'patchClass',
  'patchAttr',
  'bindElement',
  'setSpread',
  'addEventListener',
  // rendering related
  'render',
  'escape',
  'escapeHTML',
  'getHydrationKey',
  'hydrationAnchor',
  'hydrationMarker',
  'hydrationRange',
  // server attr helpers
  'ssrAttr',
  'ssrBind',
  'ssrClass',
  'ssrSelected',
  'ssrStyle',
  'ssrSpread',
  'ssrTextValue',
  'ssrTextContent',
  // DOM navigation helpers
  'child',
  'next',
  'nthChild',
] as const;

/**
 * Server-mode name remaps. Only list helpers whose export name in
 * `'essor/server'` differs from the client name; built-ins (`Fragment` etc.)
 * keep their canonical names since client and server import from separate modules.
 */
export const SERVER_IMPORT_REMAPS = {
  createComponent: 'ssrComponent',
  render: 'ssr',
  patchAttr: 'ssrAttrDynamic',
} as const;

/**
 * Name remaps applied when compiling for RENDER_MODE.HYDRATE.
 * Only entries whose runtime helper differs from the client name need listing.
 */
export const HYDRATE_IMPORT_REMAPS = {
  template: 'getRenderedElement',
  patchClass: 'patchClassHydrate',
  patchAttr: 'patchAttrHydrate',
  patchStyle: 'patchStyleHydrate',
} as const;

export type IMPORT_MAP_NAMES = (typeof IMPORTS_MAPS)[number];

/**
 * Reactive/props primitives imported from `'essor'` in every mode — including
 * server, where the rest of the helpers come from `'essor/server'`. Keeping
 * these on `'essor'` resolves them to the same deduped `@estjs/signals` the SSR
 */
export const UNIVERSAL_IMPORTS = new Set<IMPORT_MAP_NAMES>([
  'signal',
  'computed',
  'reactive',
  'memoEffect',
  'omitProps',
]);

export const importMap = Object.fromEntries(IMPORTS_MAPS.map((name) => [name, name])) as Record<
  IMPORT_MAP_NAMES,
  IMPORT_MAP_NAMES
>;

// jsx function props transform property name
export const TRANSFORM_PROPERTY_NAME = '__props';
export const FRAGMENT_NAME = 'Fragment';
export const BUILT_IN_COMPONENTS = ['Fragment', 'Portal', 'Suspense', 'For', 'Transition'] as const;
