# Essor App Instructions for GitHub Copilot

Use for Essor `.tsx`/`.ts` app, example, demo, SSR, hydration, form, component, async data, and store code.

Source of truth: `agents/AGENTS.md`. Key rules:

- `$`-prefixed locals are compiler-transformed reactive state; no `$` = plain JavaScript.
- Mutate reactive arrays/objects in place; never replace with spread clones.
- `createApp()` for client-only; `hydrate()` for SSR/SSG.
- Server: `renderToString()` / `renderToStringAsync()` from `@estjs/server`. No `renderToStream`.
- Shared render must not read `window`, `document`, `Date.now()`, `Math.random()`.
- Component-scoped `effect()` is auto-disposed. Use `onDestroy()` for timers/listeners/sockets.
- `watch(() => $x, cb)` — source must be a reactive getter.
- `<For key={...}>` for reorderable lists. `<Suspense fallback={...}>` for async resources.
- `<Fragment>` / `<>` for multiple root nodes.
- `bind:value` for inputs; `bind:checked` for checkbox/radio.
- Imports from `essor` and `@estjs/server` only; no internal `@estjs/*/src` paths.
