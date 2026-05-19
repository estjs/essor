---
name: writing-essor-apps
description: Use when writing or revising Essor app, example, demo, page, or entry-file code for client-only, hydrate, SSR, or SSG flows, especially when public imports, $ reactivity, forms, async data, stores, component patterns, or hydration-safe markup must stay correct. Do not use for babel-plugin, runtime, server, signals, template, or other packages/*/src internals.
license: MIT
compatibility: essor >= 0.0.16-beta.8
---

# Writing Essor Apps

Essor is a signal-based reactive frontend framework with no virtual DOM. The critical rule is simple: `$`-prefixed local variables are transformed by the Babel plugin; unprefixed variables are plain JavaScript.

## First Checks

- Read existing app code before adding patterns; match local entry names, mount selectors, and import style.
- Use public Essor framework imports: browser/app APIs from `essor`, SSR APIs from `@estjs/server`. Local app modules and platform APIs such as `fs` are fine where appropriate.
- Do not invent APIs. In `0.0.16-beta.8`, `@estjs/server` exports `renderToString` and `renderToStringAsync`, not `renderToStream`.
- For concrete implementation paths, open [recipes.md](references/recipes.md) before writing code.

## Rendering Choice

```
Initial HTML source?
├── Browser creates all DOM      -> createApp(App, '#app')
└── Server/build already emitted -> hydrate(App, '#app')

Server HTML needs async work?
├── No  -> renderToString(App, props, context?)
└── Yes -> renderToStringAsync(App, props, context?)
```

For SSR/SSG, use the same root component and container selector on server and client. `createApp()` clears non-empty containers, so it is wrong for hydrating server HTML.

## Reactivity Rules

```tsx
let $count = 0;              // signal(0)
const $items: Item[] = [];   // reactive([])

<button onClick={() => $count++}>{$count}</button>
<input bind:value={$name} />
```

- No `$` prefix means no reactive update.
- Mutate reactive arrays/objects in place: `$items.push(x)`, `$items[i].done = true`, `$items.splice(i, 1)`.
- Prefer derived functions in JSX: `const openCount = () => $items.filter(i => !i.done).length`.
- Use `computed()` when callers need `.value` or shared caching outside JSX.
- Create `effect()` inside component/setup scope so Essor owns disposal automatically; do not add `onDestroy(() => runner.stop())` for normal component effects.

## Hydration Rules

- Shared SSR/client components must produce identical initial HTML.
- Do not read `window`, `document`, `localStorage`, `Date.now()`, or `Math.random()` during shared render.
- Defer browser-only work to `onMount()`, or pass deterministic values from the server entry.
- For `Portal`, create an SSR context and place collected `ctx.teleports` in the final document.

## Component Rules

- Use `<For each={...} key={...}>` whenever items can reorder; no key is only safe for append/remove-at-end lists.
- Put async resources/components under `<Suspense fallback={...}>` when loading state should coordinate with a boundary.
- `createResource()` returns `[resource, { mutate, refetch }]`; read state through `resource.loading.value`, `resource.error.value`, and `resource.state.value`.
- Use `provide()`/`inject()` only within the component scope chain.
- Use `bind:value` for input/textarea/select values and `bind:checked` for checkbox/radio controls.

## Delivery Checklist

- `$` prefix is present on all local reactive state.
- Reactive arrays/objects are mutated in place, not replaced.
- SSR/SSG clients use `hydrate()`, client-only apps use `createApp()`.
- Shared render has no browser globals or nondeterministic values.
- Timers, DOM listeners, and other external resources are disposed on destroy.
- Reorderable lists have stable keys.
- Framework imports come only from `essor` or `@estjs/server`; local app modules and platform APIs are allowed where appropriate.
- Public API claims are checked against package exports before adding examples.

## Common Traps

- Writing React-style state replacement for `$` arrays.
- Calling `createApp()` on server-rendered HTML.
- Using browser globals during shared SSR/client render.
- Adding `onDestroy(() => runner.stop())` for ordinary component-scoped effects.
- Importing from internal `@estjs/*/src` paths in app code.

## References

Open only the file needed for the task:

| Reference | Use When |
|---|---|
| [recipes.md](references/recipes.md) | Scenario playbooks for client apps, SSR/SSG, hydration fixes, forms, lists, async data, and stores |
| [reactive-system.md](references/reactive-system.md) | `$` transform, signal, reactive, computed, effect, watch, batch, untrack, EffectScope |
| [component-patterns.md](references/component-patterns.md) | For, Suspense, Portal, Fragment, defineAsyncComponent, lifecycle, provide/inject |
| [ssr-hydration.md](references/ssr-hydration.md) | SSR/SSG entries, hydration contract, SSR context, Portal teleports |
| [forms-and-binding.md](references/forms-and-binding.md) | `bind:value`, modifiers, checkbox/radio/file/select, validation |
| [state-management.md](references/state-management.md) | createStore, provide/inject state, createResource patterns |

## Other Agents

For Codex, Cursor, GitHub Copilot, Gemini CLI, Cline, Windsurf, Continue, Aider, Zed, Amp, Devin, and other AGENTS.md-compatible tools, see [agents/README.md](agents/README.md). Keep `SKILL.md` as the source of truth and regenerate adapters from it when Essor APIs change.
