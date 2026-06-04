import { __version } from './version';

// Client runtime: reactivity + DOM/component runtime + provide/inject.
// The single source of truth for `activeScope` (provide/inject) and the reactive
// scheduler lives here — and, because everything below is bundled into ONE file,
// there is exactly one instance of it.
export * from '@estjs/signals';
export * from '@estjs/template';

// SSR renderer + server-only helpers, merged into the same module via `export *`
// so nothing is missed. Names exported by BOTH `@estjs/template` (client) and
// `@estjs/server` (server) are dropped by the star-merge (ESM ambiguity); they
// are re-added below with deterministic precedence.
export * from '@estjs/server';

// Collision resolution: `Fragment`/`Portal`/`Suspense`/`For` have *different*
// client (DOM) vs server (string) implementations, so the star-merge drops them.
// The client versions keep the canonical names; the server versions get unique
// `ssr*` names that match the compiler's SERVER_IMPORT_REMAPS, so one module can
// serve both. (Same-binding names like getHydrationKey/escapeHTML aren't
// ambiguous and survive the star-merge untouched.)
export { For, Fragment, Portal, Suspense } from '@estjs/template';
export {
  Fragment as ssrFragment,
  Portal as ssrPortal,
  Suspense as ssrSuspense,
  render as ssrRender,
} from '@estjs/server';

if (globalThis) {
  globalThis.__essor_version__ = __version;
}

export { __version };
