# AGENTS.md - Essor App Writing Rules

Use these instructions when writing or revising Essor app, example, demo, `.tsx`, SSR, hydration, form, store, or component code.

## Core Rules

- Essor is signal-based and has no virtual DOM.
- `$`-prefixed local variables are transformed by the Babel plugin into reactive state.
- Variables without `$` are plain JavaScript and will not update UI bindings.
- Mutate reactive arrays/objects in place: `$items.push(x)`, `$items[i].done = true`, `$items.splice(i, 1)`.
- Do not replace reactive arrays/objects with spread clones.
- Prefer derived functions in JSX: `const active = () => $todos.filter(t => !t.done).length`.
- Use `computed()` only when callers need `.value` or shared caching outside JSX.

## Rendering

- Client-only apps use `createApp(App, '#app')`.
- SSR/SSG clients use `hydrate(App, '#app')`; do not use `createApp()` on server-rendered HTML.
- Server rendering uses `renderToString(App, props, context?)` or `renderToStringAsync(App, props, context?)` from `@estjs/server`.
- `@estjs/server` does not export `renderToStream` in Essor 0.0.16-beta.8.
- Server and client entries must use the same root component and container selector.

## Hydration

- Shared SSR/client render must produce identical initial HTML.
- Do not read `window`, `document`, `localStorage`, `Date.now()`, or `Math.random()` during shared render.
- Move browser-only work to `onMount()` or pass deterministic values from the server entry.
- For `Portal`, use an SSR context and place collected `ctx.teleports` into the final document.

## Components

- Use `<For each={...} key={...}>` for lists that can reorder.
- Use `<Suspense fallback={...}>` around async resources/components when loading coordination matters.
- `createResource()` returns `[resource, { mutate, refetch }]`; status fields are signals: `resource.loading.value`, `resource.error.value`, `resource.state.value`.
- `effect()` created inside component/setup scope is automatically disposed by Essor. Do not add `onDestroy(() => runner.stop())` for normal component effects.
- Clean up timers, DOM listeners, sockets, and external subscriptions with lifecycle hooks such as `onDestroy()`.
- Use `bind:value` for input/textarea/select values and `bind:checked` for checkbox/radio.

## Imports

```tsx
import { createApp, hydrate, For, Suspense, Portal } from 'essor';
import { onMount, onDestroy, onUpdate } from 'essor';
import { signal, reactive, computed, effect, watch, batch, createStore } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';
import { renderToString, renderToStringAsync } from '@estjs/server';
```

Do not import from `@estjs/*/src` or other internal paths in application code.
