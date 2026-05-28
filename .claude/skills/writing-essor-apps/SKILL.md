---
name: writing-essor-apps
description: Use when writing or revising Essor app, example, demo, page, or entry-file code for client-only, hydrate, SSR, or SSG flows, especially when public imports, $ reactivity, forms, async data, stores, component patterns, or hydration-safe markup must stay correct. Do not use for babel-plugin, runtime, server, signals, template, or other packages/*/src internals.
license: MIT
compatibility: essor >= 0.0.16-beta.8
---

# Writing Essor Apps

Essor is a signal-based reactive frontend with no virtual DOM. Code transforms by Babel only when a local declaration is `$`-prefixed.

This skill is staged: **answer first, then route, then write, then review.** Skipping a stage is the main failure mode — do not collapse the stages into one prose pass.

## Phase 1 — Front-Load Questions (answer before writing code)

Read existing app code first, then commit to answers for all three. If the user prompt does not pin them, infer from the file you opened (entry name, mount selector, presence of `entry-server.tsx`) and state the inference in one line before writing.

1. **Rendering mode** — `client-only` · `hydrate` (SSR/SSG output) · `server-render` (producing HTML).
2. **Shared component** — does the same `App` run on server and client? `yes` · `no`.
3. **Data shape** — `none` · `sync` · `async (needs Suspense or async render)`.

Wrong answer here invalidates everything below. If unclear, stop and ask the user; do not guess between `createApp` and `hydrate`.

## Phase 2 — Pipeline by Mode (each step is a gate, do not skip ahead)

### client-only
1. Container in `index.html` is empty (`createApp` clears it).
2. `App.tsx` holds local `$` state.
3. Entry: `import { createApp } from 'essor'; createApp(App, '#app')`.

### hydrate (consuming SSR/SSG HTML)
1. `App.tsx` is the **single shared file**; no `window`/`document`/`localStorage`/`Date.now()`/`Math.random()` in shared render.
2. `entry-server.tsx` exports `render()` calling `renderToString` (sync data) or `renderToStringAsync` (awaits inside).
3. `entry-client.tsx` calls **`hydrate(App, '#app')`** — never `createApp`, which would wipe the SSR HTML.
4. Server and client target the **same selector** and the **same root component**.

### server-render (build/script side)
1. `import { renderToString | renderToStringAsync, createSSRContext } from '@estjs/server'`.
2. `createSSRContext()` only when `Portal` is used; collect `ctx.teleports` into the final HTML.
3. `@estjs/server` does not export `renderToStream` in `0.0.16-beta.8` — do not invent it.

A failure at any gate cascades: skipping gate 3 of `hydrate` is the canonical "SSR clears on load" bug.

## Phase 3 — Generation Rules (the actual writing)

Use the fixed scaffolds in [templates.md](references/templates.md) as starting points so entry files, forms, and stores stay structurally identical. Apply these rules on top:

**Reactivity**
- `$`-prefixed local declarations are the only reactive locals. Plain names are static JavaScript.
- Mutate reactive arrays/objects in place: `$items.push(x)`, `$items[i].done = true`. Never `$items = [...$items, x]`.
- Derived values: prefer arrow `const $x = () => ...` (compiles to `computed`) or plain `() =>` for JSX-only use. Reach for `computed()` only when callers need `.value` outside JSX.
- `effect()` inside component scope is auto-disposed. Use `onDestroy()` only for external resources (timers, sockets, listeners).
- `watch(() => $x, (next, prev) => ...)` for old/new callbacks. `untrack(() => $x)` to read without tracking.

**Components**
- `<For each={...} key={...}>` whenever items can reorder; keyless `For` is only safe for end-only append/remove.
- `<Suspense fallback={...}>` wraps async boundaries; resource auto-registers with the nearest one.
- `bind:value` for text/textarea/select; `bind:checked` for checkbox/radio. Modifiers via tuple form: `bind:value={[$x, { trim: true }]}`.
- `<Fragment>` / `<>...</>` for multiple roots — no wrapper div.

**Imports — public surface only**
- Browser/app: `essor`.
- Server: `@estjs/server`.
- App-local modules and platform APIs (e.g. `fs` in build scripts) are fine; never import from `@estjs/*/src`.

## Phase 4 — Reviewer Checklist (run before declaring done)

Each item is independent and binary. Use this same list to self-check new code or to review existing code — it does not depend on how the code was written.

- [ ] `$` prefix present on every reactive local.
- [ ] Reactive arrays/objects mutated in place, never reassigned.
- [ ] Mode matches Phase 1: `createApp` only for client-only; `hydrate` for SSR/SSG.
- [ ] Shared render contains no browser globals or nondeterministic values.
- [ ] Timers, DOM listeners, sockets disposed via `onDestroy`.
- [ ] Reorderable `<For>` lists have a `key`.
- [ ] Async UI sits inside `<Suspense>` with a `fallback`.
- [ ] Framework imports come only from `essor` or `@estjs/server`; no `@estjs/*/src` paths.
- [ ] Public APIs used exist in `0.0.16-beta.8` (e.g. no `renderToStream`).
- [ ] `bind:value` / `bind:checked` used on the right element type; modifiers in tuple form.

If any item fails, return to Phase 2 or 3 and fix before reporting completion.

## Common Traps

- React-style state replacement on `$` arrays.
- `createApp()` on a server-rendered page (clears the HTML).
- `window`/`document`/`Date.now()`/`Math.random()` in shared SSR/client render.
- `onDestroy(() => runner.stop())` on ordinary component-scoped effects.
- Importing from `@estjs/*/src/...` in app code.
- Inventing API names (`renderToStream`, dotted bind modifiers like `bind:value.trim`).

## References (open only what the current task needs)

| Reference | Use When |
|---|---|
| [templates.md](references/templates.md) | Fixed scaffolds for client / SSR / SSG entries, forms, lists, async data, stores |
| [reactive-system.md](references/reactive-system.md) | `$` transform, signal, reactive, computed, effect, watch, batch, untrack, EffectScope |
| [component-patterns.md](references/component-patterns.md) | For, Suspense, Portal, Fragment, defineAsyncComponent, lifecycle, provide/inject |
| [forms-and-binding.md](references/forms-and-binding.md) | `bind:value`, modifiers, checkbox/radio/file/select, validation |
| [state-management.md](references/state-management.md) | createStore, provide/inject, createResource patterns |
