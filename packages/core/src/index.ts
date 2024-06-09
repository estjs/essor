import { __essor_version } from './version';

export * from './signal';
export * from './template';
export * from './server';

export type * from '../types/index.d.ts';

if (globalThis) {
  globalThis.__essor_version = __essor_version;
}

export { __essor_version };
