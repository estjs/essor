# Essor Framework Instructions for GitHub Copilot

You are working in an **Essor** application. Essor is a signal-based reactive frontend framework with no virtual DOM, built on fine-grained reactivity. Follow these rules at all times.

## $ Prefix = Reactivity

The `$` prefix on variable names triggers automatic signal transformation via the Babel plugin.

```tsx
const $count = 0;            // → signal(0)
const $list: string[] = [];  // → reactive([])
let $name = 'John';          // → signal('John')

// Auto-unwrap in JSX:
<div>{$count}</div>              // reads $count.value
<button onClick={() => $count++}> // writes $count.value
<input bind:value={$name} />     // two-way binding
```

**Plain variables (no `$`) are NOT reactive:**
```tsx
const count = 0; // ❌ changes will not update the UI
```

**Reactive arrays: mutate in place, never reassign:**
```tsx
$items.push(newItem);    // ✅ correct
$items[0].done = true;   // ✅ correct
$items = [...$items, x]; // ❌ wrong — loses reactivity
```

## Imports

```tsx
// Browser — always from 'essor':
import { createApp, hydrate, For, Suspense, Portal } from 'essor';
import { onMount, onDestroy, onUpdate } from 'essor';
import { signal, reactive, computed, effect, createStore } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';

// Server — always from '@estjs/server':
import { renderToString, renderToStringAsync } from '@estjs/server';
```

## Rendering Mode

- **Client-only:** `createApp(App, '#app')`
- **SSR/SSG (HTML already exists):** `hydrate(App, '#app')` — NEVER use `createApp` here
- **Server rendering:** `renderToString(App, {})`

## Hydration Safety (Critical)

Server and client must produce identical initial HTML. Do NOT use in shared components:
- `window`, `document` — defer to `onMount()`
- `Date.now()`, `Math.random()` — pass as prop or use `onMount()`
- Browser layout measurements — defer to `onMount()`

## Component Patterns

**For (keyed lists):**
```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <li>{item.name}</li>}
</For>
```

**Suspense + createResource:**
```tsx
const [data] = createResource(() => fetch('/api/data').then(r => r.json()));
return <Suspense fallback={<Loading />}><div>{data()?.name}</div></Suspense>;
```

**Store:**
```tsx
const useStore = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});
```

**Two-way binding:**
```tsx
<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
<input bind:checked={$agree} type="checkbox" />
```

**Lifecycle:**
```tsx
onMount(() => { /* browser setup */ });
onDestroy(() => { /* cleanup */ });
```

## Checklist
1. `$` on all reactive variables
2. Mutate arrays in place, never reassign
3. `hydrate()` for SSR pages, `createApp()` for client-only
4. No browser globals in shared components
5. Effects cleaned up with `onDestroy`
6. `For` has `key` when items can reorder
7. Async data in `<Suspense>` with `fallback`
8. Only import from `essor` or `@estjs/server`
