import { __version } from './version';

export * from '@estjs/signals';
export * from '@estjs/template';
export * from '@estjs/server';

if (globalThis) {
  globalThis.__essor_version__ = __version;
}

export { __version };
