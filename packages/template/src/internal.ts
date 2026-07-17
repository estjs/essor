/**
 * Internal entry point used by sibling runtime packages such as
 * `@estjs/server`. These helpers deliberately sit outside the public API
 * surface and are only exposed via the `@estjs/template/internal` subpath.
 *
 * **Do not import from this module in application code.** The contracts here
 * are unstable and may change without notice.
 */

export type { ActiveScopeSlot, Scope } from './scope';
export {
  activateScopeEffects,
  createScope,
  disposeScope,
  getActiveScope,
  runWithScope,
  setActiveScope,
  setActiveScopeSlotProvider,
} from './scope';
export type { HydrationKeySlot } from './hydration';
export { setHydrationKeySlotProvider } from './hydration';
