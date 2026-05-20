# Essor App Rules for Amazon Q Developer

Use as a project rule or custom agent context for Essor `.ts`/`.tsx`, app, example, demo, SSR, hydration, component, form, async data, and store work.

Source of truth: `agents/AGENTS.md`. Key rules:

- `$`-prefixed locals are compiler-transformed reactive state. No `$` = plain JavaScript.
- Mutate reactive arrays/objects in place; never replace with spread clones.
- `createApp()` for client-only; `hydrate()` for SSR/SSG.
- Server: `renderToString()` / `renderToStringAsync()` from `@estjs/server`. No `renderToStream`.
- Shared render must not read browser globals or nondeterministic values; use `onMount()`.
- Component-scoped `effect()` is auto-disposed. `onDestroy()` for timers/listeners/sockets.
- `watch(() => $x, cb)` — source must be a reactive getter.
- `<For key={...}>` for reorderable lists. `<Suspense fallback={...}>` for async.
- `<Fragment>` / `<>` for multiple root nodes.
- `bind:value` for inputs; `bind:checked` for checkbox/radio.
- Imports from `essor` and `@estjs/server` only; no internal `@estjs/*/src` paths.
