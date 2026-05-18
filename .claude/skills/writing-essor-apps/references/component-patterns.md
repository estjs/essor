# Essor Component Patterns

## Component Model

Components are **functions that return DOM nodes**. The function body executes once — no re-render cycle. Only fine-grained reactive bindings update.

```tsx
interface Props { name: string; $count?: () => number; }
function Greeting({ name, $count }: Props) {
  return <div><h1>Hello {name}</h1>{$count && <span>{$count()}</span>}</div>;
}
```

## For — Keyed List

Uses LIS (Longest Increasing Subsequence) for minimal DOM moves.

```tsx
import { For } from 'essor';

// ✅ With key (required when items reorder):
<For each={$todos} key={(todo) => todo.id} fallback={() => <p>Empty</p>}>
  {(todo) => <TodoItem data={todo} />}
</For>

// ✅ Without key (safe when items only append/remove from end):
<For each={$logs}>
  {(log) => <li>{log.message}</li>}
</For>

// ❌ No key + reordering → DOM won't reconcile correctly
```

| Prop | Type | Description |
|---|---|---|
| `each` | `T[] \| Signal<T[]> \| (() => T[])` | The list |
| `children` | `(item: T, index: number) => AnyNode` | Render fn |
| `key` | `(item: T, index: number) => unknown` | Identity fn |
| `fallback` | `() => AnyNode` | Empty state |

**Key behavior (v0.0.16+):** Keys only need uniqueness within current rendering, not globally.

## Suspense — Async Boundary

Coordinates async dependencies; shows fallback until resolved.

```tsx
import { Suspense, createResource } from 'essor';

function Profile({ id }: { id: string }) {
  const [user] = createResource(() => fetch(`/api/users/${id}`).then(r => r.json()));

  return (
    <Suspense fallback={<Skeleton />}>
      <div>{user()?.name}</div>
    </Suspense>
  );
}
```

- Resource auto-registers with nearest `<Suspense>` during render
- Pending → shows `fallback`; resolved → shows `children`
- On SSR → renders `fallback` immediately

## Portal — Teleport

```tsx
import { Portal } from 'essor';

<Portal target="#modal-root" disabled={() => $isMobile}>
  <div class="modal">Content rendered in #modal-root</div>
</Portal>
```

`target` and `disabled` support reactive getters. SSR emits `<!--teleport-anchor-->` / `<!--teleport-start-->` markers for hydration.

## defineAsyncComponent — Lazy Loading

```tsx
import { defineAsyncComponent } from 'essor';

const Chart = defineAsyncComponent(() => import('./Chart'), {
  loading: () => <Spinner />,
  error: ({ error, retry }) => <button onClick={retry}>Retry</button>,
  delay: 200,        // ms before showing loading (default 200)
  timeout: 10_000,    // ms before showing error
  ssr: 'blocking',    // 'blocking' pre-resolves on server; 'client-only' renders null
});
```

## Lifecycle

```tsx
import { onMount, onDestroy, onUpdate } from 'essor';

function Timer() {
  let $ticks = 0;
  let timer: ReturnType<typeof setInterval>;

  onMount(() => { timer = setInterval(() => $ticks++, 1000); });
  onDestroy(() => { clearInterval(timer); });
  onUpdate(() => { console.log('updated:', $ticks); });

  return <div>{$ticks}</div>;
}
```

⚠️ Call hooks during component function execution — they register against the current scope. Not in callbacks/async.

## Context: provide / inject

```tsx
import { provide, inject, type InjectionKey } from 'essor';

const ThemeKey: InjectionKey<string> = Symbol('theme');

// Provider:
provide(ThemeKey, 'dark');

// Consumer (any descendant):
const theme = inject(ThemeKey, 'light'); // 'dark' from parent, 'light' as default
```

Traverses UP the scope chain. Only works from descendants of the provider.
