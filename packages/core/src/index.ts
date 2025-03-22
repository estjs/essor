import { __version } from './version';

export * from '@estjs/signal';
export * from '@estjs/template';

if (globalThis) {
  globalThis.__est_version__ = __version;
}

export { __version };
