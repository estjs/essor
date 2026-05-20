# AGENTS.md — Essor App Writing Rules

Use when writing or revising Essor app, example, demo, `.tsx`, SSR, hydration, form, store, or component code.
Do **not** use for `babel-plugin`, `runtime`, `server`, `signals`, `template`, or other `packages/*/src` internals.

---

## $ Prefix — Critical

The Babel plugin transforms `$`-prefixed local declarations into reactive state. No `$` = plain JavaScript = no UI update.

| Declaration | Compiled to | JSX access |
|---|---|---|
| `let $x = 0` | `signal(0)` | `() => $x.value` |
| `const $x = []` | `reactive([])` | `() => $x` |
| `const $x = {}` | `reactive({})` | `() => $x` |
| `const $x = () => expr` | `computed(() => expr)` | `() => $x.value` |

```tsx
let $count = 0;
const $items: Item[] = [];
const $double = () => $count * 2;   // computed

<button onClick={() => $count++}>{$count}</button>
<input bind:value={$name} />
```

**Mutate reactive arrays/objects in place — never reassign:**
```tsx
$items.push(x);          // ✅
$items[0].done = true;   // ✅
$items = [...$items, x]; // ❌ loses reactivity
```

**Derived values — prefer plain functions:**
```tsx
const active = () => $todos.filter(t => !t.done).length;
```

Use `computed()` only when callers need `.value` or shared caching outside JSX.

---

## Rendering

```
Initial HTML source?
├── Browser creates all DOM      → createApp(App, '#app')
└── Server/build already emitted → hydrate(App, '#app')

Server HTML needs async work?
├── No  → renderToString(App, props, context?)
└── Yes → renderToStringAsync(App, props, context?)
```

- `createApp()` clears the container — never use it on server-rendered HTML.
- Server and client must use the **same root component** and **same container selector**.
- `@estjs/server` does **not** export `renderToStream` in Essor 0.0.16-beta.8.

---

## Hydration Safety

Server and client must produce **identical initial HTML**.

Never in shared `App.tsx`:
- `window`, `document`, `localStorage` → move to `onMount()`
- `Date.now()`, `Math.random()` → pass as deterministic prop from server entry, or `onMount()`

For `Portal`, collect teleports via `createSSRContext()`:
```tsx
import { createSSRContext, renderToString } from '@estjs/server';
const ctx = createSSRContext();
const html = renderToString(App, {}, ctx);
// ctx.teleports['#modal-root'] → Portal content
```

---

## Reactivity Utilities

```tsx
effect(() => { /* auto-tracks deps, auto-disposed with component scope */ });
watch(() => $x, (next, prev) => { /* explicit old/new */ });
untrack(() => $x);          // read without tracking
batch(() => { $a++; $b++; }); // defer flush until end
await nextTick();            // after reactive flush
```

Component-scoped `effect()` is **automatically disposed** by Essor — do **not** add `onDestroy(() => runner.stop())` for normal effects.
Use `onDestroy()` for timers, DOM listeners, sockets, and external subscriptions.

---

## Components

**Fragment — multiple root nodes:**
```tsx
function Row() { return <><td>A</td><td>B</td></>; }
```

**For — keyed list:**
```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <li>{item.name}</li>}
</For>
```
Omit `key` only for append/remove-at-end lists where order never changes.

**Suspense + createResource:**
```tsx
const [data, { mutate, refetch }] = createResource(
  () => fetch('/api/data').then(r => r.json())
);
// Status: data.loading.value  data.error.value  data.state.value

<Suspense fallback={<Loading />}>
  <div>{data()?.name}</div>
</Suspense>
```

**defineAsyncComponent:**
```tsx
const Chart = defineAsyncComponent(() => import('./Chart'), {
  loading: () => <Spinner />,
  error: ({ error, retry }) => <button onClick={retry}>Retry</button>,
  ssr: 'blocking', // or 'client-only'
});
```

**Lifecycle:**
```tsx
onMount(() => { /* browser setup */ });
onDestroy(() => { /* cleanup */ });
onUpdate(() => { /* after reactive update */ });
```

**provide / inject:**
```tsx
const ThemeKey: InjectionKey<string> = Symbol('theme');
provide(ThemeKey, 'dark');
const theme = inject(ThemeKey, 'light');
```

**Forms:**
```tsx
<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
<input bind:value.lazy={$search} />
<input type="checkbox" bind:checked={$agree} />
<select bind:value={$opt}>...</select>
```

**Store:**
```tsx
const useCounter = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});
```

---

## Imports

```tsx
// Browser — from 'essor':
import { Fragment, For, Portal, Suspense, createApp, hydrate } from 'essor';
import { onMount, onDestroy, onUpdate } from 'essor';
import { signal, reactive, computed, effect, watch, batch, untrack, nextTick } from 'essor';
import { createStore, createResource, defineAsyncComponent, provide, inject } from 'essor';
import type { InjectionKey } from 'essor';

// Server — from '@estjs/server':
import { createSSRContext, renderToString, renderToStringAsync } from '@estjs/server';
```

Do **not** import from `@estjs/*/src` or other internal paths in application code.

---

## Checklist

- [ ] `$` prefix on all reactive variables
- [ ] Reactive arrays/objects mutated in place, not replaced
- [ ] `hydrate()` for SSR/SSG, `createApp()` for client-only
- [ ] No browser globals or nondeterministic values in shared render
- [ ] Timers, DOM listeners, sockets cleaned up with `onDestroy()`
- [ ] `For` has stable `key` when items can reorder
- [ ] Async data wrapped in `<Suspense fallback={...}>`
- [ ] `watch()` source is a reactive getter `() => $x`, not a plain variable
- [ ] Framework imports only from `essor` or `@estjs/server`
- [ ] No invented API names (verify against package exports)
