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
  'convertTextChildToString',
  'escapeHTML',
  'getHydrationKey',
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
 * Resolved names that must be imported from `'essor/server'` in SERVER mode.
 * Derived from IMPORTS_MAPS + SERVER_IMPORT_REMAPS so dead entries are impossible:
 * only names reachable via useImport() appear here.
 */
const _serverRemapValues = new Set(Object.values(SERVER_IMPORT_REMAPS));
export const SERVER_EXPORTS = new Set<string>([
  ...IMPORTS_MAPS
    .filter((name) => !Object.hasOwn(SERVER_IMPORT_REMAPS, name))
    .filter((name) =>
      name === 'render'
      || name === 'convertTextChildToString'
      || name === 'escapeHTML'
      || name === 'Fragment'
      || name === 'Portal'
      || name === 'Suspense'
      || name === 'getHydrationKey'
      || name.startsWith('ssr'),
    ),
  ..._serverRemapValues,
]);

export const importMap = Object.fromEntries(IMPORTS_MAPS.map((name) => [name, name])) as Record<
  IMPORT_MAP_NAMES,
  IMPORT_MAP_NAMES
>;

// jsx function props transform property name
export const TRANSFORM_PROPERTY_NAME = '__props';
export const FRAGMENT_NAME = 'Fragment';
export const UPDATE_PREFIX = 'update';
export const BUILT_IN_COMPONENTS = ['Fragment', 'Portal', 'Suspense', 'For'] as const;
