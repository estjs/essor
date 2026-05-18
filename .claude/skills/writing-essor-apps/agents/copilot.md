# Essor Framework

Essor is a signal-based reactive framework. **`$`-prefixed variables auto-transform into reactive signals** via Babel. No `$`, no reactivity.

## $ Prefix

```tsx
let $count = 0;            // → signal(0)
const $list: Item[] = [];  // → reactive([])

<div>{$count}</div>               // auto-unwrap → () => $count.value
<button onClick={() => $count++}> // → $count.value++
<input bind:value={$name} />      // two-way binding
```

**Arrays: mutate in place, never reassign:**
```tsx
$items.push(x);     // ✅
$items = [...$items, x]; // ❌ loses reactivity
```

## Imports

```tsx
// Browser: from 'essor'
import { createApp, hydrate, For, Suspense, Portal } from 'essor';
import { onMount, onDestroy } from 'essor';
import { signal, reactive, computed, effect, createStore } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';

// Server: from '@estjs/server'
import { renderToString, renderToStringAsync } from '@estjs/server';
```

## Rendering

- `createApp(App, '#app')` — client-only
- `hydrate(App, '#app')` — SSR/SSG (NEVER use createApp)
- `renderToString(App, {})` — server

## Hydration Safety

Never in shared components: `window`, `document`, `Date.now()`, `Math.random()`. Defer to `onMount()`.

## Key Patterns

```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <li>{item.name}</li>}
</For>

const [data] = createResource(() => fetch('/api/data').then(r => r.json()));
<Suspense fallback={<Loading />}><div>{data()?.name}</div></Suspense>

const useStore = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});

<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
```

## Checklist
1. `$` on all reactive variables
2. Arrays mutated in place, never reassigned
3. `hydrate()` for SSR, `createApp()` for client-only
4. No browser globals in shared components
5. `For` has `key` when reordering
6. Async data in `<Suspense>`
7. Only import from `essor` or `@estjs/server`
