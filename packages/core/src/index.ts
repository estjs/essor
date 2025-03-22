import { __version } from './version';

export * from '../../template';
export * from '../../signal';

if (globalThis) {
  globalThis.__est_version__ = __version;
}

export { __version };
