# Essor Framework — Agent Prompt

You are writing **Essor** applications. Essor is a signal-based reactive frontend framework with no virtual DOM. Its defining feature: `$`-prefixed variables auto-transform into reactive signals.

## Critical Rule: $ Prefix

```tsx
// Write → Compiled:
let $count = 0;            // → signal(0)
const $list: Item[] = [];  // → reactive([])

// JSX — auto-unwrapped:
<div>{$count}</div>               // → () => $count.value
<button onClick={() => $count++}> // → $count.value++
<input bind:value={$name} />      // two-way binding

// ❌ No $ prefix = NOT reactive:
const count = 0;
```

## Reactive Arrays: Mutate, Never Reassign

```tsx
// ✅ Correct:
$items.push(newItem);
$items[0].done = true;
// ❌ Wrong:
$items = [...$items, newItem]; // loses reactivity
```

## Derived Values: Plain Functions

```tsx
// ✅ Preferred:
const active = () => $todos.filter(t => !t.done).length;
```

## Imports

```tsx
// Browser (from 'essor'):
import { For, Portal, Suspense, createApp, hydrate } from 'essor';
import { onDestroy, onMount, onUpdate } from 'essor';
import { batch, computed, createStore, effect, reactive, signal } from 'essor';
import { createResource, defineAsyncComponent, inject, provide } from 'essor';

// Server (from '@estjs/server'):
import { renderToString, renderToStringAsync } from '@estjs/server';
```

## Rendering

- **Client-only:** `createApp(App, '#app')`
- **SSR/SSG (HTML exists):** `hydrate(App, '#app')` — NEVER `createApp`
- **Server:** `renderToString(App, {})` / `renderToStringAsync(App, {})`
- `@estjs/server` does not export `renderToStream` in Essor 0.0.16-beta.8.

## Hydration Safety

Server and client produce identical initial HTML. Never in shared `App.tsx`:
- `window`, `document` → use `onMount()`
- `Date.now()`, `Math.random()` → pass as prop or use `onMount()`

## Key Patterns

**For (keyed list):**
```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <li>{item.name}</li>}
</For>
```

**Suspense + createResource:**
```tsx
const [data, { mutate, refetch }] = createResource(() => fetch('/api/data').then(r => r.json()));
<Suspense fallback={<Loading />}><div>{data()?.name}</div></Suspense>
```

**defineAsyncComponent:**
```tsx
const Chart = defineAsyncComponent(() => import('./Chart'), {
  loading: () => <Spinner />,
  error: ({ error, retry }) => <button onClick={retry}>Retry</button>,
  ssr: 'blocking', // or 'client-only'
});
```

**Store:**
```tsx
const useCounter = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});
```

**Forms:**
```tsx
<input bind:value={$email} />
<input bind:checked={$agree} type="checkbox" />
```

**Lifecycle:**
```tsx
onMount(() => { /* browser setup */ });
onDestroy(() => { /* cleanup timers/listeners */ });
effect(() => { /* component-scoped reactive side effect */ });
```

## Checklist
1. `$` prefix on all reactive variables
2. Arrays mutated in place (push, splice, index assign)
3. `hydrate()` for SSR, `createApp()` for client-only
4. No browser globals in shared components
5. Effects created in component scope; timers/listeners cleaned up with `onDestroy`
6. `For` has `key` when items can reorder
7. Async data in `<Suspense>` with `fallback`
8. Framework imports only from `essor` or `@estjs/server`; local app modules and platform APIs are allowed when needed
