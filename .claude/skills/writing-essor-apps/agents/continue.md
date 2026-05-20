---
name: Essor app rules
---

Use when editing Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, component, form, async data, or store code.

Source of truth: `agents/AGENTS.md`. Key rules:

- `$` prefix → reactive state. No `$` → plain JavaScript.
- Mutate reactive arrays/objects in place.
- `createApp()` for client-only; `hydrate()` for SSR/SSG.
- Server: `renderToString()` / `renderToStringAsync()` from `@estjs/server`. No `renderToStream`.
- Shared render must be deterministic; browser-only work in `onMount()`.
- Component-scoped `effect()` is auto-disposed. `onDestroy()` for timers/listeners/sockets.
- `watch(() => $x, cb)` — source must be a reactive getter.
- `<For key={...}>` for reorderable lists. `<Suspense fallback={...}>` for async.
- `<Fragment>` / `<>` for multiple root nodes.
- `bind:value` for inputs; `bind:checked` for checkbox/radio.
- Imports from `essor` and `@estjs/server` only; local app modules and platform APIs are allowed.
