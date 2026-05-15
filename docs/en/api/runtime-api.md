# Runtime API

This document covers the core runtime APIs provided by the `@estjs/template` package, including app mounting, template creation, list rendering, and async resource management.

## createApp

Mount a component to a specified DOM node.

```ts
function createApp(component: Component, container: string | Element): () => void;
```

- `component` — Component function
- `container` — CSS selector or DOM element
- Return value — Dispose function; calling it destroys the app

```tsx
import { createApp } from 'essor';
import App from './App';

const dispose = createApp(App, '#app');

// Unmount
// dispose();
```

## hydrate

Hydrate server-rendered static HTML on the client.

```ts
function hydrate(component: Component, container: string | Element, options?: HydrateOptions): () => void;
```

- Reuses server-generated DOM nodes and only attaches event listeners and the reactive system
- Significantly reduces client initialization time

```tsx
import { hydrate } from 'essor';
import App from './App';

hydrate(App, '#app');
```

## template

Create a reusable DOM template factory. The compiler transforms JSX into `template` calls.

```ts
function template(html: string, isSvg?: boolean): () => Node;
```

- `html` — HTML string fragment
- `isSvg` — Whether the content is SVG
- Returns a factory function that clones the template on each call

Usually you do not need to call this manually; the compiler handles it automatically:

```tsx
// Before compilation (JSX)
function Card() {
  return <div class="card"><h2>Title</h2></div>;
}

// After compilation (approximate)
const _tmpl = template('<div class="card"><h2></h2></div>');
function Card() {
  const el = _tmpl();
  // ... fill in dynamic content
  return el;
}
```

## For

Efficient list rendering component with a key-based diff algorithm that minimizes DOM operations.

```tsx
import { For } from '@estjs/template';
```

### Props

- `each` — Reactive array or array returned by a signal
- `key` — Unique identifier function `(item, index) => uniqueId`
- `fallback` — Fallback content displayed when the array is empty
- `children` — Render function `(item, index) => JSX`

`key` must be pure and stable. When JSX `.map()` is lowered to `For`, Essor may extract
`key` into a separate callback from the render callback. In keyed `.map()` block callbacks,
statements before the returned JSX may run for key extraction too. Do not mutate state,
increment counters, call non-idempotent functions, or early-return alternate JSX from that
prelude.

### Example

```tsx
function TodoList() {
  const $todos = [
    { id: 1, text: 'Learn Essor' },
    { id: 2, text: 'Write docs' },
  ];

  return (
    <ul>
      <For each={$todos} key={(todo) => todo.id}>
        {(todo) => <li>{todo.text}</li>}
      </For>
    </ul>
  );
}
```

### With fallback

```tsx
<For each={$items} key={(item) => item.id} fallback={<p>No data</p>}>
  {(item) => <div>{item.name}</div>}
</For>
```

### Performance characteristics

- Uses the Longest Increasing Subsequence (LIS) algorithm to optimize element moves
- Creates an independent scope for each list item to ensure state isolation
- Supports in-place updates, additions, deletions, and reordering

## Fragment

Render multiple child nodes without a wrapper DOM node.

```tsx
import { Fragment } from '@estjs/template';

function List() {
  return (
    <Fragment>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </Fragment>
  );
}
```

You can also use the `<>...</>` JSX shorthand:

```tsx
function List() {
  return (
    <>
      <li>Item 1</li>
      <li>Item 2</li>
    </>
  );
}
```

## Portal

Render children into a specified DOM node, commonly used for modals, dropdowns, and tooltips.

```tsx
import { Portal } from '@estjs/template';

function Modal({ children }) {
  return (
    <Portal mount={document.body}>
      <div class="modal-overlay">{children}</div>
    </Portal>
  );
}
```

### Props

- `mount` — Target DOM node
- `children` — Content to render
- `useShadow` — Whether to use Shadow DOM

## Suspense

Manage async loading states, displaying fallback UI while async resources are loading.

```tsx
import { Suspense } from '@estjs/template';

function AsyncPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AsyncData />
    </Suspense>
  );
}
```

When components or resources wrapped by `Suspense` initiate async requests, the fallback is shown automatically. Once all async operations complete, the actual content is rendered.

## createResource

Create an async data resource to work with `Suspense` for elegant async state management.

```ts
function createResource<T>(
  source: () => any,
  fetcher: (sourceValue: any) => Promise<T>
): Resource<T>;
```

### Return value

- `value` — Signal containing the resolved data
- `loading` — Signal indicating whether loading is in progress
- `error` — Signal containing the request error, if any
- `state` — Signal with the current state (`'pending' | 'ready' | 'error'`)
- `mutate` — Function to manually update the data
- `refetch` — Function to re-initiate the request

### Example

```tsx
import { createResource } from '@estjs/template';

function UserProfile({ userId }) {
  const user = createResource(() => userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  });

  return (
    <div>
      {user.loading() ? (
        <p>Loading...</p>
      ) : user.error() ? (
        <p>Error: {user.error().message}</p>
      ) : (
        <div>
          <h1>{user.value().name}</h1>
          <p>{user.value().email}</p>
        </div>
      )}
    </div>
  );
}
```

### Manual refresh

```tsx
<button onClick={() => user.refetch()}>Refresh</button>
```

### Manual mutation

```tsx
user.mutate({ name: 'New Name', email: 'new@example.com' });
```

## Type definitions

```ts
interface Resource<T> {
  value: () => T;
  loading: () => boolean;
  error: () => any;
  state: () => 'pending' | 'ready' | 'error';
  mutate: (value: T) => void;
  refetch: () => void;
}
```
