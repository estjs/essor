import { __version } from './version';

export * from '@estjs/signal';
export * from '@estjs/template';

if (globalThis) {
  globalThis.__essor_version__ = __version;
}

export { __version };
