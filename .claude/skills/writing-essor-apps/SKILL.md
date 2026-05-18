---
name: writing-essor-apps
description: Use when writing Essor apps, pages, examples, or demos — especially when unsure which rendering mode to use, how the $ prefix system works, how SSR/hydration should be wired, or which public API to import. Also use when a user asks about Essor best practices, component patterns, or reactive state management.
---

# Writing Essor Apps

## Overview

Essor is a signal-based reactive frontend framework with **no virtual DOM**, built on fine-grained reactivity. Its defining feature is the **`$` prefix** — variables named `$x` are automatically transformed into reactive signals by the Babel plugin. This gives you SolidJS-like performance with a dramatically simpler mental model.

**Core principle:** Every reactive value starts with `$`. No `$`, no reactivity.

## When to Use This Skill

Use this skill when:
- Writing or revising Essor app code, examples, demos, or pages
- Deciding between `createApp` vs `hydrate` vs `renderToString`
- Designing `App.tsx`, `entry-client.tsx`, `entry-server.tsx`
- Unsure which package to import from (`essor` vs `@estjs/server` vs `@estjs/signals`)
- User asks "how do I do X in Essor?"
- Debugging hydration mismatches or reactivity issues

Do NOT use for:
- Modifying Essor compiler/runtime internals (`babel-plugin`, `packages/*/src`)
- Generic TypeScript/JavaScript questions unrelated to Essor

---

## Core Concepts

### 1. The `$` Prefix — Automatic Signal Transform

This is the most important concept in Essor. The Babel plugin automatically transforms `$`-prefixed variables:

```tsx
// What you write:
const $count = 0;          // → signal(0)
const $name = 'John';      // → signal('John')
const $list: string[] = []; // → reactive([])

// In JSX expressions — auto-unwrapped to getters:
<div>{$count}</div>           // → () => $count.value
<button onClick={() => $count++}>  // → $count.value++

// Two-way binding:
<input bind:value={$name} />  // → reads .value on input, writes .value on change
```

**Rules:**
| Declaration | Becomes | Access in JSX |
|---|---|---|
| `const $x = <primitive>` | `signal(<primitive>)` | `$x` → `() => $x.value` |
| `const $x = []` or `{}` | `reactive([/{}])` | `$x` → `() => $x` |
| `let $x = <value>` | `signal(<value>)` | Same as const |

**Without `$`, there is NO reactivity:**
```tsx
const count = 0;  // plain variable — changes won't update the UI
```

**Reactive array/object operations (use in-place mutation, not reassignment):**
```tsx
// ✅ Correct — mutates in place, triggers updates
$todos.push({ id: 1, title: 'New' });
$todos[0].done = true;
$todos.splice(index, 1);

// ❌ Wrong — reassigns the variable, loses reactivity
$todos = [...$todos, { id: 1, title: 'New' }];
```

**Derived values use plain functions (no `computed` needed in most cases):**
```tsx
const $todos = [] as Todo[];
const activeCount = () => $todos.filter(t => !t.done).length;
// In JSX: <span>{activeCount()} items left</span>
```

### 2. Reactivity Primitives

When you need explicit control beyond the `$` prefix:

```tsx
import { signal, reactive, computed, effect, watch, batch, untrack, nextTick } from 'essor';

// signal — explicit primitive signal
const s = signal(0);
s.value;  // read
s.value = 5;  // write

// reactive — deep reactive proxy
const obj = reactive({ a: 1, b: { c: 2 } });
obj.b.c = 3;  // deeply tracked

// computed — lazy, cached derivation
const doubled = computed(() => s.value * 2);
doubled.value;  // cached until s changes

// effect — auto-tracking side effect (runs immediately)
const runner = effect(() => {
  console.log('count is', s.value);
});
runner.stop();  // dispose when done

// watch — explicit old/new values
watch(() => s.value, (newVal, oldVal) => {
  console.log(`changed from ${oldVal} to ${newVal}`);
});

// batch — defer updates, flush once
batch(() => {
  s.value = 1;
  s.value = 2;
  s.value = 3;
}); // effect runs once with value 3

// untrack — read without tracking
untrack(() => s.value);

// nextTick — run after current flush cycle
nextTick(() => { /* DOM is updated */ });
```

### 3. Component Model

Essor components are **functions that return DOM nodes**:

```tsx
// Props are plain function parameters
function Greeting({ name, $count }: { name: string; $count: () => number }) {
  return <h1>Hello {name}, count: {$count()}</h1>;
}

// Component with local reactive state
function Counter() {
  let $count = 0;  // $ prefix → signal, scoped to this component
  return (
    <button onClick={() => $count++}>
      {$count}
    </button>
  );
}
```

**Lifecycle hooks** (call inside component body during execution):

```tsx
import { onMount, onDestroy, onUpdate } from 'essor';

function Timer() {
  let $ticks = 0;
  let timer: ReturnType<typeof setInterval>;

  onMount(() => {
    timer = setInterval(() => $ticks++, 1000);
  });

  onDestroy(() => {
    clearInterval(timer);
  });

  onUpdate(() => {
    console.log('component re-rendered');
  });

  return <div>{$ticks}</div>;
}
```

**Context via provide/inject:**

```tsx
import { provide, inject, type InjectionKey } from 'essor';

const ThemeKey: InjectionKey<string> = Symbol('theme');

function Parent() {
  provide(ThemeKey, 'dark');
  return <Child />;
}

function Child() {
  const theme = inject(ThemeKey, 'light'); // 'dark'
  return <div class={theme}>...</div>;
}
```

### 4. Store Pattern

For shared/global state:

```tsx
import { createStore } from 'essor';

// Options-based store
const useCounter = createStore({
  state: { count: 0 },
  getters: {
    double: (s) => s.count * 2,
  },
  actions: {
    increment() { this.count++; },
    reset() { this.count = 0; },
  },
});

function App() {
  const store = useCounter();
  return (
    <div>
      <span>Count: {store.count}</span>
      <span>Double: {store.double}</span>
      <button onClick={() => store.increment()}>+</button>
    </div>
  );
}

// Class-based store (alternative)
class CounterStore {
  count = 0;
  get double() { return this.count * 2; }
  increment() { this.count++; }
}
const useCounter = createStore(CounterStore);
```

Built-in store actions: `patch$`, `subscribe$`, `unsubscribe$`, `onAction$`, `offAction$`, `reset$`.

---

## Public API Reference

### From `essor` (browser)

```tsx
// Rendering
import { createApp, hydrate, template } from 'essor';

// Components
import { For, Suspense, Portal, Fragment } from 'essor';

// Async
import { createResource, defineAsyncComponent } from 'essor';
import type { AsyncComponentOptions } from 'essor';

// Lifecycle
import { onMount, onDestroy, onUpdate } from 'essor';

// Reactivity
import {
  signal, reactive, computed, effect, watch, batch,
  untrack, nextTick, createStore, ref, isRef,
  EffectScope, effectScope, getCurrentScope, onScopeDispose,
} from 'essor';

// Context
import { provide, inject } from 'essor';
import type { InjectionKey } from 'essor';

// DOM helpers
import { insert, next, child, nthChild, bindElement } from 'essor';
```

### From `@estjs/server` (SSR)

```tsx
import {
  renderToString,       // sync render to HTML string
  renderToStringAsync,   // async render (awaits promises)
  render,                // template fragment assembly (used by babel plugin)
  createSSGComponent,    // render a child component to string
  createSSRContext,      // create SSR context (for Portal teleport collection)
  getSSRContext,         // get current SSR context
  escapeHTML,            // escape user content for safe HTML insertion
  markSafeHtml,          // mark a string as pre-escaped HTML
} from '@estjs/server';
```

### From `@estjs/signals` (standalone reactivity)

```tsx
import {
  signal, computed, effect, reactive, watch, batch,
  untrack, nextTick, createStore, ref,
  shallowSignal, shallowReactive, toRaw, toReactive,
} from '@estjs/signals';
```

---

## Rendering Mode Decision

```
Need to render in browser?
├── Server already produced HTML? → use hydrate()
│   (SSR/SSG: HTML exists, just need to attach interactivity)
└── Client-only rendering? → use createApp()
    (clears container, renders from scratch)

Need to produce HTML on server?
├── All data ready synchronously? → renderToString()
├── Async components/resources? → renderToStringAsync()
├── Streaming to client? → renderToStream()
└── Static site generation? → call renderToString at build time
```

---

## Component Patterns

### For — Keyed List Rendering

```tsx
import { For } from 'essor';

<For
  each={$items}                           // reactive array
  fallback={() => <p>No items yet</p>}    // shown when empty
>
  {(item, index) => (
    <li>{item.name}</li>
  )}
</For>

// With key function (required when items can reorder):
<For each={$todos} key={(todo) => todo.id}>
  {(todo) => <TodoItem data={todo} />}
</For>
```

**`For` does NOT need key purity** — keys only need to be **unique per item within the current rendering**, not across re-renders of different datasets. This is documented in the recent v0.0.16-beta.8 release. The `key` function is used for identity-based reconciliation (LIS algorithm) to minimize DOM moves.

### Suspense — Async Boundaries

```tsx
import { Suspense, createResource } from 'essor';

function Profile({ userId }: { userId: string }) {
  const [user] = createResource(() =>
    fetch(`/api/users/${userId}`).then(r => r.json())
  );
  return <div>{user()?.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Profile userId="1" />
    </Suspense>
  );
}
```

### createResource — Async Data Fetching

```tsx
const [resource, { mutate, refetch }] = createResource(
  () => fetch('/api/data').then(r => r.json()),
  { initialValue: [] }  // optional
);

// resource() → T | undefined (accessor, tracks reactively)
// resource.loading → Signal<boolean>
// resource.error → Signal<Error | null>
// resource.state → Signal<'pending' | 'ready' | 'errored'>

// Imperative control:
mutate(newData);  // optimistic update
refetch();        // re-run the fetcher
```

### defineAsyncComponent — Lazy Loading

```tsx
const HeavyChart = defineAsyncComponent(
  () => import('./HeavyChart'),
  {
    loading: () => <Spinner />,
    error: ({ error, retry }) => (
      <div>
        <p>Failed: {error.message}</p>
        <button onClick={retry}>Retry</button>
      </div>
    ),
    delay: 200,       // ms before showing loading (default 200)
    timeout: 10_000,   // ms before showing error
    ssr: 'blocking',   // 'blocking' | 'client-only'
  }
);
```

### Portal — Teleport to Another DOM Node

```tsx
<Portal target="#modal-root" disabled={isMobile()}>
  <div class="modal">Content rendered in #modal-root</div>
</Portal>
```

`target` and `disabled` both support reactive getters. When `disabled` is true, children render inline.

---

## Form Patterns

### Two-Way Binding

```tsx
function LoginForm() {
  let $email = '';
  let $password = '';
  let $remember = false;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    console.log({ email: $email, password: $password, remember: $remember });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input bind:value={$email} type="email" placeholder="Email" />
      <input bind:value={$password} type="password" placeholder="Password" />
      <label>
        <input bind:checked={$remember} type="checkbox" /> Remember me
      </label>
      <button type="submit">Login</button>
    </form>
  );
}
```

**`bind:value` modifiers:**
```tsx
<input bind:value={$name} />           // plain string
<input bind:value.lazy={$name} />      // commit on change (not input)
<input bind:value.trim={$name} />      // trim whitespace
<input bind:value.number={$age} />     // coerce to number
```

**Supported bindings:** `bind:value` (text/textarea/select), `bind:checked` (checkbox/radio), `bind:files` (file input).

### Form Submission Pattern

```tsx
function SignupForm() {
  let $name = '';
  let $email = '';
  let $submitting = false;
  let $error = '';

  const submit = async (e: Event) => {
    e.preventDefault();
    $submitting = true;
    $error = '';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        body: JSON.stringify({ name: $name, email: $email }),
      });
      if (!res.ok) throw new Error(await res.text());
      // redirect or show success
    } catch (err) {
      $error = (err as Error).message;
    } finally {
      $submitting = false;
    }
  };

  return (
    <form onSubmit={submit}>
      <input bind:value={$name} placeholder="Name" />
      <input bind:value={$email} type="email" placeholder="Email" />
      {$error && <p class="error">{$error}</p>}
      <button type="submit" disabled={$submitting}>
        {$submitting ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

---

## SSR / Hydration Contract

This is the most critical concept for production Essor apps.

### The Contract

**Server and client MUST produce identical HTML for the initial render.** If they differ, hydration will fail (mismatch errors, lost event listeners, or silent corruption).

### Project Structure

```
src/
  App.tsx              # Shared component — single source of truth for initial UI
  entry-client.tsx     # Browser-only: hydrate(App, '#app')
  entry-server.tsx     # Server-only: export function render() { return renderToString(App, {}) }
```

### Minimum SSR + Hydrate Setup

```tsx
// src/App.tsx — shared, runs on both server and client
export function App() {
  let $count = 0;
  return <button onClick={() => $count++}>count: {$count}</button>;
}
```

```tsx
// src/entry-client.tsx — browser only
import { hydrate } from 'essor';
import { App } from './App';
hydrate(App, '#app');
```

```tsx
// src/entry-server.tsx — server/build only
import { renderToString } from '@estjs/server';
import { App } from './App';
export function render() {
  return renderToString(App, {});
}
```

### Hydration Safety Rules

**DO NOT put these in shared components (App.tsx):**

| Unsafe | Why | Safe Alternative |
|---|---|---|
| `window`, `document` access | Not available on server | Guard with `typeof window !== 'undefined'` or put in `onMount` |
| `Date.now()`, `Math.random()` | Different server vs client | Pass as prop or use `onMount` |
| Browser layout reads (`getBoundingClientRect`) | No layout on server | Put in `onMount` |
| Conditional rendering based on browser state | Server doesn't know | Render placeholder, replace in `onMount` |

**SSR-aware components:** `Suspense` and `defineAsyncComponent` already handle SSR gracefully — Suspense renders its `fallback` on server; async components with `ssr: 'blocking'` pre-resolve before rendering.

### SSG vs SSR

The difference is only **when** `render()` is called:
- **SSG:** Call `renderToString()` at build time → output static HTML files
- **SSR:** Call `renderToString()` per request → return HTML in response

Both reuse the same `App.tsx` + `entry-server.tsx` + `entry-client.tsx`.

---

## Common Mistakes

### 1. Forgetting `$` prefix
```tsx
// ❌ NOT reactive
const count = 0;
<div>{count}</div>

// ✅ Reactive
let $count = 0;
<div>{$count}</div>
```

### 2. Reassigning reactive arrays/objects
```tsx
// ❌ Loses reactivity
$items = [...$items, newItem];

// ✅ Mutate in place
$items.push(newItem);
```

### 3. Using `createApp` on SSR pages
```tsx
// ❌ Clears server HTML and re-renders
createApp(App, '#app');

// ✅ Attaches to existing DOM
hydrate(App, '#app');
```

### 4. Browser-only code in shared components
```tsx
// ❌ Crashes on server
function App() {
  const width = window.innerWidth;  // window is undefined on server

// ✅ Defer to mount
function App() {
  let $width = 0;
  onMount(() => { $width = window.innerWidth; });
```

### 5. Different root components for client/server
```tsx
// ❌ Structural drift
// entry-client: hydrate(ClientApp, '#app')
// entry-server: renderToString(ServerApp, {})

// ✅ Same component
// entry-client: hydrate(App, '#app')
// entry-server: renderToString(App, {})
```

### 6. `computed.value` in JSX
```tsx
const doubled = computed(() => $count * 2);
// ❌ <span>{doubled.value}</span> — value is static at JSX compile time
// ✅ Use a getter function instead if you need computed behavior in JSX
const doubled = () => $count * 2;
<span>{doubled()}</span>
```


---

## Delivery Checklist

Before claiming work is complete, verify:

- [ ] Imports only from `essor`, `@estjs/server`, or `@estjs/signals` (no internal paths)
- [ ] Client-only entry uses `createApp`; SSR/SSG entry uses `hydrate`
- [ ] `entry-server.tsx` only does rendering, no browser logic
- [ ] Shared `App.tsx` works without `window`/`document`/`Date.now()`/`Math.random()`
- [ ] Same root component used for client and server
- [ ] Container selector matches server output (e.g., both use `#app`)
- [ ] Effects have cleanup (`onDestroy` or `runner.stop()`)
- [ ] `For` has a `key` function when items can reorder
- [ ] Async data wrapped in `Suspense` with appropriate `fallback`
- [ ] Reactive variables use `$` prefix; non-reactive ones don't

When writing Essor code, follow this priority:
1. Determine rendering mode first (`createApp` / `hydrate` / `renderToString`)
2. Write the shared component (`App.tsx`) as the single source of truth
3. Wire up client and server entries with minimal glue code
4. Verify hydration safety — no browser-only APIs in shared components
