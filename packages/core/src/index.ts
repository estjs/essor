import { essor_version } from './version';

export * from './signal';
export * from './template';
export * from './server';

export type * from '../types/index.d.ts';

if (globalThis) {
  globalThis.__essor_version__ = essor_version;
}

export { essor_version };
