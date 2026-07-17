/**
 * Cross-bundle registry for request-local slot providers.
 *
 * PROBLEM: `@estjs/template` ships two entries (`template`, `internal`).
 * The CJS build has no code splitting (tsup only splits ESM), so each CJS
 * bundle inlines its OWN copy of every module — including module-level `let`
 * provider variables. `@estjs/server` installs SSR request-state providers
 * through `@estjs/template/internal`; if the provider lived in a plain module
 * variable, it would be written into `internal.cjs`'s copy while compiled
 * components read `template.cjs`'s copy — silently disabling per-request
 * scope/hydration-key isolation for every Node CJS consumer.
 *
 * FIX: providers live on `globalThis` under a `Symbol.for` key, which is
 * shared across bundle copies (and even across duplicated package instances).
 * The extra property read per access is negligible next to the ALS lookup the
 * provider itself performs.
 */

const REQUEST_SLOTS_KEY = Symbol.for('estjs.template.requestSlotProviders');

/**
 * Provider functions keyed by slot name. Values are typed at the call sites
 * (scope.ts / hydration.ts) to avoid circular imports here.
 */
interface RequestSlotProviders {
  activeScope?: () => unknown;
  hydrationKey?: () => unknown;
}

/**
 * Get the process-wide provider registry, creating it on first access.
 */
export function requestSlotProviders(): RequestSlotProviders {
  const host = globalThis as Record<PropertyKey, unknown>;
  return (host[REQUEST_SLOTS_KEY] ??= {}) as RequestSlotProviders;
}
