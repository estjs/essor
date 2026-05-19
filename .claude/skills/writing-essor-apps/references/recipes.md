# Essor App Recipes

Use these when an agent needs a concrete path instead of raw API facts.

## Client-Only App

1. Create `App.tsx` with local `$` state and components.
2. Mount once with `createApp(App, '#app')`.
3. Keep the target container empty in `index.html`; `createApp()` clears existing content.

```tsx
import { createApp } from 'essor';
import { App } from './App';

createApp(App, '#app');
```

## SSR or SSG App

1. Keep `App.tsx` shared between server and client.
2. Server entry returns `renderToString()` or `renderToStringAsync()`.
3. Client entry uses `hydrate()`, never `createApp()`.
4. Use the same root component and selector on both sides.

```tsx
// entry-client.tsx
import { hydrate } from 'essor';
import { App } from './App';

hydrate(App, '#app');
```

```tsx
// entry-server.tsx
import { renderToString } from '@estjs/server';
import { App } from './App';

export function render() {
  return renderToString(App, {});
}
```

## Hydration Mismatch Fix

Check these in order:

1. Client uses `hydrate()`, not `createApp()`.
2. Server and client import the same `App`.
3. Server HTML has the same container selector the client targets.
4. Shared render has no `window`, `document`, `localStorage`, `Date.now()`, or `Math.random()`.
5. Browser-only values are initialized in `onMount()` or passed as deterministic server props.

## Reactive Local State

```tsx
let $count = 0;
const $items: Item[] = [];

const completed = () => $items.filter((item) => item.done).length;

$items.push(nextItem);
$items[index].done = true;
$items.splice(index, 1);
```

Do not replace `$items` with a spread clone. For derived display values, prefer plain functions unless callers need `.value` caching from `computed()`.

## Lists

Use a key whenever reorder is possible.

```tsx
<For each={$items} key={(item) => item.id} fallback={() => <p>Empty</p>}>
  {(item) => <ItemRow item={item} />}
</For>
```

Omit `key` only for append/remove-at-end collections where object identity is stable enough.

## Forms

```tsx
let $email = '';
let $age = 0;
let $agree = false;

<input bind:value={$email} />
<input bind:value.number={$age} />
<input type="checkbox" bind:checked={$agree} />
```

Use `bind:value` for text, textarea, and select controls. Use `bind:checked` only for checkbox/radio controls.

## Async Data

```tsx
const [user, { mutate, refetch }] = createResource(
  () => fetch(`/api/users/${id}`).then((r) => r.json()),
  { initialValue: null },
);

return (
  <Suspense fallback={<Skeleton />}>
    {user.error.value && <ErrorBanner error={user.error.value} />}
    {user.loading.value && <Spinner />}
    <Profile user={user()} />
  </Suspense>
);
```

Read resource status through `user.loading.value`, `user.error.value`, and `user.state.value`.

## Component-Scoped Effects

```tsx
effect(() => {
  console.log($count);
});
```

Effects created during component/setup execution are owned by the active Essor scope and are disposed automatically. Use `onDestroy()` for timers, DOM listeners, sockets, and other external resources.

## Shared State

```tsx
const useCounter = createStore({
  state: { count: 0 },
  getters: { double: (s) => s.count * 2 },
  actions: {
    increment() {
      this.count++;
    },
  },
});
```

Use local `$` state first. Reach for `createStore()` when state is shared across features or needs named actions/getters.
