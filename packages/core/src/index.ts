import { essor_version } from './version';

export * from './signal';
export * from './template';

if (globalThis) {
  globalThis.__essor_version__ = essor_version;
}

export type * from './types/index.d.ts';

export { essor_version };
