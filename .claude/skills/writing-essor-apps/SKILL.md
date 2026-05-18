---
name: writing-essor-apps
description: Use when writing Essor apps, pages, examples, or demos — especially when deciding between createApp, hydrate, or renderToString; when unsure how the $ prefix reactive system works; when designing SSR/hydration boundaries; when choosing component patterns (For, Suspense, Portal); or when the user asks any Essor best-practice question. Also use when writing .tsx files in an Essor project.
license: MIT
compatibility: essor >= 0.0.16-beta.8
---

# Writing Essor Apps

Essor is a signal-based reactive frontend framework with **no virtual DOM**. Its defining feature: `$`-prefixed variables auto-transform into reactive signals via the Babel plugin. **No `$`, no reactivity.**

---

## When to Apply

- Writing or revising any `.tsx` file in an Essor project
- Deciding rendering mode: `createApp` vs `hydrate` vs `renderToString`
- Designing project structure: `App.tsx` / `entry-client.tsx` / `entry-server.tsx`
- Choosing the right component pattern (For, Suspense, Portal, defineAsyncComponent)
- Debugging hydration mismatches or reactivity issues
- User asks "how do I do X in Essor?"

---

## Rendering Mode Decision

```
Where does the initial HTML come from?
├── Browser-only (no server HTML) → createApp()
└── Server/build produced HTML    → hydrate()

How is server HTML produced?
├── All data sync → renderToString()
├── Async components/resources → renderToStringAsync()
└── Streaming → renderToStream()

SSG vs SSR: same entry-server.tsx, different call timing.
```

---

## Quick Reference

| Task | API | Import From |
|---|---|---|
| Browser mount (no SSR) | `createApp(App, '#app')` | `essor` |
| Browser hydrate (SSR/SSG) | `hydrate(App, '#app')` | `essor` |
| Server render sync | `renderToString(App, props)` | `@estjs/server` |
| Server render async | `renderToStringAsync(App, props)` | `@estjs/server` |
| Keyed list | `<For each={$items} key={fn}>` | `essor` |
| Async boundary | `<Suspense fallback={...}>` | `essor` |
| Async data | `createResource(fetcher)` | `essor` |
| Lazy component | `defineAsyncComponent(loader)` | `essor` |
| Teleport | `<Portal target={sel}>` | `essor` |
| Global state | `createStore(options)` | `essor` |
| Context | `provide(key, val)` / `inject(key)` | `essor` |
| Two-way binding | `bind:value={$x}` | (compiler built-in) |
| Lifecycle | `onMount` / `onDestroy` / `onUpdate` | `essor` |
| Explicit signal | `signal(val)` / `reactive(obj)` | `essor` |
| Derived value | `const fn = () => $x + 1` | (plain function) |

---

## Critical Patterns

### 1. $ Prefix — Reactive Variables

```tsx
// ✅ Reactive — $ prefix triggers Babel transform:
let $count = 0;              // → signal(0)
const $list: Item[] = [];    // → reactive([])

// In JSX, auto-unwrap to getters:
<div>{$count}</div>               // → () => $count.value
<button onClick={() => $count++}> // → $count.value++

// ❌ NOT reactive — no $ prefix:
const count = 0;  // plain variable, won't update UI
```

### 2. Reactive Arrays — Mutate, Don't Reassign

```tsx
const $todos = [] as Todo[];

// ✅ Mutate in place:
$todos.push({ id: 1, title: 'new' });
$todos[0].done = true;
$todos.splice(index, 1);

// ❌ Reassignment loses reactivity:
$todos = [...$todos, { id: 1, title: 'new' }];
```

### 3. Derived Values — Plain Functions

```tsx
// ✅ Preferred — function auto-tracks in JSX:
const activeCount = () => $todos.filter(t => !t.done).length;
<span>{activeCount()} items</span>

// Use computed() only when you need .value or caching across sites:
const doubled = computed(() => $count * 2);
const x = doubled.value; // needed outside JSX
```

### 4. SSR — hydrate(), Not createApp()

```tsx
// ❌ On SSR pages, createApp clears server HTML:
createApp(App, '#app'); // BAD — wipes SSR output

// ✅ hydrate attaches to existing DOM:
hydrate(App, '#app');   // GOOD — preserves SSR HTML
```

### 5. Hydration Safety

```tsx
// ❌ NEVER in shared App.tsx — different on server vs client:
const now = Date.now();
const w = window.innerWidth;
const id = Math.random();

// ✅ Defer browser-only APIs to onMount:
let $hydrated = false;
let $width = 0;
onMount(() => {
  $hydrated = true;
  $width = window.innerWidth;
});
```

### 6. For — Keyed List with Fallback

```tsx
// ✅ With key (required when items reorder):
<For each={$todos} key={(todo) => todo.id} fallback={() => <p>No items</p>}>
  {(todo, index) => <TodoItem data={todo} />}
</For>

// ❌ No key when items can reorder — DOM will not reconcile correctly:
<For each={$todos}>
  {(todo) => <TodoItem data={todo} />}
</For>
```

### 7. Async Data — Suspense + createResource

```tsx
// ✅ Inside Suspense boundary, resource auto-registers:
const [user, { mutate, refetch }] = createResource(
  () => fetch(`/api/users/${id}`).then(r => r.json()),
  { initialValue: null }
);

return (
  <Suspense fallback={<Skeleton />}>
    <div>{user()?.name}</div>
    {user.loading.value && <Spinner />}
    {user.error.value && <ErrorBanner error={user.error.value} />}
  </Suspense>
);

// ❌ createResource outside Suspense — no loading boundary:
// Resource still works but no auto fallback coordination.
```

### 8. Two-Way Binding

```tsx
let $email = '';
let $age = 0;
let $agree = false;

// ✅ Text binding with modifiers:
<input bind:value={$email} />
<input bind:value.trim={$name} />
<input bind:value.number={$age} />
<input bind:value.lazy={$search} />

// ✅ Checkbox binding:
<input type="checkbox" bind:checked={$agree} />

// ❌ bind:checked on text input — use bind:value:
<input type="text" bind:checked={$val} /> // WRONG
```

### 9. Store — Shared State

```tsx
// ✅ Options-based store (factory pattern):
const useCounter = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: {
    increment() { this.count++; },
    reset() { this.count = 0; },
  },
});

function Counter() {
  const store = useCounter(); // new instance each call
  return <button onClick={() => store.increment()}>{store.count}</button>;
}
```

### 10. Effects Always Have Cleanup

```tsx
// ✅ Clean up effects:
const runner = effect(() => {
  const timer = setInterval(() => $ticks++, 1000);
  return () => clearInterval(timer); // runs on re-run + stop
});
onDestroy(() => runner.stop());

// ❌ Leaked effect — runs forever:
effect(() => { /* no cleanup */ });
```

---

## Imports — Only From Public Packages

```tsx
// ✅ Browser — always from 'essor':
import { createApp, hydrate, For, Suspense, Portal, Fragment } from 'essor';
import { onMount, onDestroy, onUpdate } from 'essor';
import { signal, reactive, computed, effect, watch, batch, createStore } from 'essor';
import { provide, inject, createResource, defineAsyncComponent } from 'essor';

// ✅ Server — always from '@estjs/server':
import { renderToString, renderToStringAsync, renderToStream } from '@estjs/server';

// ❌ NEVER import from internal paths:
import { ... } from '@estjs/template/src/hydration'; // WRONG
```

---

## Project Structure

### Client-Only
```
src/
  App.tsx          # createApp(App, '#app')
  main.tsx         # entry point
```

### SSR / SSG + Hydrate
```
src/
  App.tsx              # Shared — single source of truth
  entry-client.tsx     # hydrate(App, '#app')
  entry-server.tsx     # export render() { return renderToString(App) }
scripts/
  build-ssg.ts         # Call render() → write .html files
```

---

## Delivery Checklist

- [ ] `$` prefix on all reactive variables; plain variables are NOT reactive
- [ ] Arrays mutated in place (`.push()`, `[i] = x`, `.splice()`) — never reassigned
- [ ] SSR pages use `hydrate()`, not `createApp()`
- [ ] No `window`/`document`/`Date.now()`/`Math.random()` in shared `App.tsx`
- [ ] Effects have cleanup: `runner.stop()` or `onDestroy(() => runner.stop())`
- [ ] `For` has `key` when items can reorder
- [ ] Async data wrapped in `<Suspense>` with meaningful `fallback`
- [ ] Same root component for client and server entries
- [ ] Only import from `essor` or `@estjs/server` — no internal paths
- [ ] Container selector matches server output (e.g., both use `#app`)

---

## References

| Reference | Use When |
|---|---|
| [reactive-system.md](references/reactive-system.md) | Deep dive on `$` prefix, signal, reactive, computed, effect, watch, batch, untrack, EffectScope |
| [component-patterns.md](references/component-patterns.md) | For, Suspense, Portal, Fragment, defineAsyncComponent, lifecycle hooks, provide/inject |
| [ssr-hydration.md](references/ssr-hydration.md) | Full SSR/hydration contract, renderToString, hydrate, SSG build scripts, common hydration errors |
| [forms-and-binding.md](references/forms-and-binding.md) | Two-way binding with all modifiers, form submission, validation patterns |
| [state-management.md](references/state-management.md) | createStore (options + class), provide/inject, createResource with mutate/refetch |

---

## Further Documentation

- **GitHub**: https://github.com/estjs/essor
- **Docs**: https://essor.netlify.app/
- **NPM**: https://www.npmjs.com/package/essor
