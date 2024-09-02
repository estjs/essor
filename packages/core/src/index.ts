import { essor_version } from './version';

export * from '@estjs/template';
export * from '@estjs/signal';

if (globalThis) {
  globalThis.__essor_version__ = essor_version;
}

export { essor_version };
