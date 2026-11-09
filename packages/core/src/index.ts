import { __version } from './version';

export * from '@estjs/signals';
export * from '@estjs/template';

export { __version };

if (__DEV__ && typeof globalThis !== 'undefined') {
  const g = globalThis as any;
  if (g.__ESSOR__) {
    console.warn(
      `[essor] Multiple instances of Essor detected (already running v${g.__ESSOR__.version}, loading v${__version}). ` +
        'This may break reactivity, scopes, and context tracking.',
    );
  } else {
    g.__ESSOR__ = {
      version: __version,
      dev: true,
    };
  }
  g.__essor_version__ = __version;
}
