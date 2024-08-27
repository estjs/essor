import { essor_version } from './version';

export * from '@essor/template';

if (globalThis) {
  globalThis.__essor_version__ = essor_version;
}

export { essor_version };
