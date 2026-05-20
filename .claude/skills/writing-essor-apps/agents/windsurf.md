# Essor App Rule for Windsurf Cascade

Description: Use when Cascade edits Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, form, component, store, or async data code.

Source of truth: `agents/AGENTS.md`. Key rules:

- `$` prefix → reactive state. No `$` → plain JavaScript.
- Mutate reactive arrays/objects in place; never replace with spread clones.
- `createApp()` for client-only; `hydrate()` for SSR/SSG.
- Server: `renderToString()` / `renderToStringAsync()` from `@estjs/server`. No `renderToStream`.
- Shared render must be deterministic; browser-only work in `onMount()`.
- Component-scoped `effect()` is auto-disposed. `onDestroy()` for timers/listeners/sockets.
- `watch(() => $x, cb)` — source must be a reactive getter.
- `<For key={...}>` for reorderable lists. `<Suspense fallback={...}>` for async.
- `<Fragment>` / `<>` for multiple root nodes.
- `bind:value` for inputs; `bind:checked` for checkbox/radio.
- Imports from `essor` and `@estjs/server` only; local app modules and platform APIs are allowed.
