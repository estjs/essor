# Essor Framework

This project uses **Essor**, a signal-based reactive frontend framework with no virtual DOM. Follow these rules at all times.

## $ Prefix = Reactivity

Variables prefixed with `$` are auto-transformed into reactive signals by the Babel plugin. **No `$` = no reactivity.**

```tsx
// Write:         // Becomes:
const $count = 0;  // signal(0)
const $list = [];  // reactive([])

// JSX auto-unwrap:
<div>{$count}</div>              // reads $count.value
<button onClick={() => $count++}> // writes $count.value
<input bind:value={$name} />     // two-way binding
```

**Reactive arrays: mutate in place. Never reassign.**
```tsx
$items.push(newItem);     // ✅ correct
$items[0].done = true;    // ✅ correct
$items = [...$items, x];  // ❌ wrong
```

**Derived values use plain functions:**
```tsx
const active = () => $todos.filter(t => !t.done).length;
```

## Imports

```tsx
// Browser (from 'essor'):
import { createApp, hydrate, For, Suspense, Portal } from 'essor';
import { onMount, onDestroy } from 'essor';
import { signal, reactive, computed, effect, createStore } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';

// Server (from '@estjs/server'):
import { renderToString, renderToStringAsync } from '@estjs/server';
```

## Rendering

- `createApp(App, '#app')` — client-only, creates fresh DOM
- `hydrate(App, '#app')` — SSR/SSG, attaches to existing server HTML
- `renderToString(App, {})` — server-side rendering

## Hydration Safety

Server and client MUST produce identical initial HTML. Never use in shared components:
- `window`, `document` → defer to `onMount()`
- `Date.now()`, `Math.random()` → pass as prop or defer to `onMount()`

## Patterns

**For:**
```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <li>{item.name}</li>}
</For>
```

**Async:**
```tsx
const [data] = createResource(() => fetch('/api/data').then(r => r.json()));
<Suspense fallback={<Loading />}><div>{data()?.name}</div></Suspense>
```

**Store:**
```tsx
const useStore = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});
```

**Forms:**
```tsx
<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
<input bind:checked={$agree} type="checkbox" />
```

## Checklist
1. `$` on all reactive variables
2. Arrays mutated in place
3. `hydrate()` for SSR pages, never `createApp()` on server HTML
4. No browser globals in shared components
5. Effects cleaned up with `onDestroy(() => runner.stop())`
6. `For` has `key` when items can reorder
7. Async data in `<Suspense>` with `fallback`
8. Only import from `essor` or `@estjs/server`
