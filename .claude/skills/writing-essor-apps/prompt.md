# Essor Framework — Agent Prompt

You are writing an application using **Essor**, a signal-based reactive frontend framework with no virtual DOM. Follow these rules strictly.

## Critical Rule: `$` Prefix = Reactivity

Variables prefixed with `$` are auto-transformed into reactive signals by the Babel plugin. **Without `$`, there is NO reactivity.**

```tsx
// What you write → What it becomes:
const $count = 0;          // → signal(0)
const $list: string[] = []; // → reactive([])

// In JSX — auto-unwrapped to getters:
<div>{$count}</div>              // → () => $count.value
<button onClick={() => $count++}> // → $count.value++

// Two-way binding:
<input bind:value={$name} />
```

**Reactive arrays use mutation, not reassignment:**
```tsx
// ✅ Correct
$items.push(newItem);
$items[0].done = true;

// ❌ Wrong — loses reactivity
$items = [...$items, newItem];
```

**Derived values use plain functions:**
```tsx
const activeCount = () => $todos.filter(t => !t.done).length;
// In JSX: <span>{activeCount()} items</span>
```

## Rendering Mode Decision

```
Browser needs DOM?
├── Server already produced HTML? → hydrate()
└── Client-only? → createApp()

Server needs HTML?
├── Sync data → renderToString()
├── Async data → renderToStringAsync()
└── Streaming → renderToStream()
```

## Import Map

```tsx
// Browser (from 'essor'):
import { createApp, hydrate, For, Suspense, Portal, Fragment } from 'essor';
import { signal, reactive, computed, effect, watch, batch, untrack } from 'essor';
import { onMount, onDestroy, onUpdate } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';
import { createStore, ref } from 'essor';

// Server (from '@estjs/server'):
import { renderToString, renderToStringAsync } from '@estjs/server';
```

## SSR/Hydration Contract

**Server and client MUST produce identical initial HTML.** Violations:
- `window`/`document` in shared components
- `Date.now()`/`Math.random()` in shared components
- Different root components for client vs server

**Safe pattern:**
```tsx
// App.tsx — shared, no browser APIs
function App() {
  let $hydrated = false;
  onMount(() => { $hydrated = true; });  // browser-only in onMount
  return <div>{$hydrated ? 'Client' : 'Server'}</div>;
}
```

## Component Patterns

### For — Keyed Lists
```tsx
<For each={$items} fallback={() => <p>Empty</p>}>
  {(item, index) => <li>{item.name}</li>}
</For>
```

### Suspense + createResource
```tsx
const [user] = createResource(() => fetch('/api/user').then(r => r.json()));
<Suspense fallback={<Loading />}>
  <div>{user()?.name}</div>
</Suspense>
```

### defineAsyncComponent
```tsx
const LazyChart = defineAsyncComponent(
  () => import('./Chart'),
  { loading: () => <Spinner />, error: ({ error, retry }) => <Error msg={error.message} onRetry={retry} /> }
);
```

### Store
```tsx
const useCounter = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: { increment() { this.count++; } },
});
```

### Form Binding
```tsx
<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
<input bind:value.lazy={$search} />
<input bind:checked={$agree} type="checkbox" />
```

### Portal
```tsx
<Portal target="#modal-root" disabled={isMobile()}>
  <div class="modal">Content</div>
</Portal>
```

## Lifecycle
```tsx
onMount(() => { /* DOM ready */ });
onDestroy(() => { /* cleanup */ });
onUpdate(() => { /* after reactive update */ });
```

## Quick Checklist
- [ ] Reactive variables use `$` prefix
- [ ] Arrays mutated in place (`.push`, not reassignment)
- [ ] Hydration entry uses `hydrate()`, not `createApp()`
- [ ] Shared `App.tsx` has no `window`/`document`/`Date.now()`/`Math.random()`
- [ ] Effects have cleanup (`runner.stop()` or `onDestroy`)
- [ ] `For` has `key` when items can reorder
- [ ] Async data in `Suspense` with `fallback`
