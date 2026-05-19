export const IMPORTS_MAPS = [
  // Reactive API
  'signal',
  'computed',
  'reactive',
  'memoEffect',
  'omitProps',
  'resolveDefaultProps',

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
  'convertToString',
  'convertTextChildToString',
  'markSafeHtml',
  'escapeHTML',
  'getHydrationKey',
  'hydrationAnchor',
  'hydrationMarker',
  // server attr helpers
  'ssrAttr',
  'ssrClass',
  'ssrStyle',
  'ssrSpread',
  // DOM navigation helpers
  'child',
  'next',
  'nthChild',
] as const;

/**
 * Name remaps applied when compiling for RENDER_MODE.SERVER.
 * Only entries whose runtime helper differs from the client name need listing.
 */
export const SERVER_IMPORT_REMAPS = {
  createComponent: 'createSSGComponent',
  patchAttr: 'setSSGAttr',
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
 * Canonical (pre-remap) names of helpers that live in `'essor/server'`.
 * TypeScript enforces that every entry is a valid IMPORT_MAP_NAMES.
 * SERVER_IMPORT_REMAPS is applied below so the set contains resolved names.
 */
const SERVER_ONLY_NAMES: IMPORT_MAP_NAMES[] = [
  'render',
  'convertToString',
  'convertTextChildToString',
  'markSafeHtml',
  'escapeHTML',
  'Fragment',
  'Portal',
  'Suspense',
  'getHydrationKey',
  'ssrAttr',
  'ssrClass',
  'ssrStyle',
  'ssrSpread',
  'createComponent',
  'patchAttr',
];

const _remaps = SERVER_IMPORT_REMAPS as Partial<Record<IMPORT_MAP_NAMES, string>>;
export const SERVER_EXPORTS = new Set(SERVER_ONLY_NAMES.map((name) => _remaps[name] ?? name));

export const importMap = Object.fromEntries(IMPORTS_MAPS.map((name) => [name, name])) as Record<
  IMPORT_MAP_NAMES,
  IMPORT_MAP_NAMES
>;

// jsx function props transform property name
export const TRANSFORM_PROPERTY_NAME = '__props';
export const FRAGMENT_NAME = 'Fragment';
export const UPDATE_PREFIX = 'update';
export const BUILT_IN_COMPONENTS = ['Fragment', 'Portal', 'Suspense', 'For'] as const;
export const HYDRATION_ANCHOR_ATTR = 'data-hk-idx';
