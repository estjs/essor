import { aube_version } from './version';

export * from '@aube/template';
export * from '@aube/signal';

if (globalThis) {
  globalThis.__aube_version__ = aube_version;
}

export { aube_version };
