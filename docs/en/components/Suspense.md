# Suspense

The `Suspense` component lets you display fallback content while waiting for async work — data loading, code-split components, lazy modules — to complete. It makes loading states declarative and keeps async dependencies easy to reason about.

## Basic Usage

Use it with lazy-loaded components via `defineAsyncComponent`:

```tsx
import { Suspense, defineAsyncComponent } from '@estjs/template';

const LazyComponent = defineAsyncComponent(() => import('./LazyComponent'));

function App() {
  return (
    <div class="app">
      <h1>My App</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <LazyComponent />
      </Suspense>
    </div>
  );
}
```

While `LazyComponent` is loading, Suspense shows the `fallback`. Once the import resolves, the real component is rendered.

## Data Fetching

Suspense pairs naturally with `createResource`. The resource registers its pending promise with the nearest Suspense boundary, so the fallback is shown until the data arrives:

```tsx
import { Suspense, createResource } from '@estjs/template';

function UserProfile({ userId }: { userId: string }) {
  const [user] = createResource(async () => {
    const res = await fetch(`/api/users/${userId}`);
    return res.json();
  });

  return (
    <div class="user-profile">
      <h2>{user()?.name}</h2>
      <p>{user()?.email}</p>
    </div>
  );
}

function App() {
  return (
    <div class="app">
      <h1>User Profile</h1>
      <Suspense fallback={<div>Loading user data...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </div>
  );
}
```

`createResource` returns a tuple `[resource, actions]`. The `resource` is callable — `user()` returns the current value (or `undefined` while pending). `actions.refetch()` and `actions.mutate(value)` are also available.

## Nested Suspense

Suspense boundaries can be nested. Each boundary handles only its own subtree, so a slow widget never blocks the rest of the page:

```tsx
function App() {
  return (
    <div class="app">
      <Suspense fallback={<div>Loading app...</div>}>
        <Header />
        <Suspense fallback={<div>Loading main content...</div>}>
          <MainContent />
        </Suspense>
        <Suspense fallback={<div>Loading sidebar...</div>}>
          <Sidebar />
        </Suspense>
        <Footer />
      </Suspense>
    </div>
  );
}
```

When `MainContent` is loading, only the inner main-content fallback is shown — `Header`, `Sidebar`, and `Footer` continue to render normally.

## Error Handling

Async operations may fail. Combine Suspense with an error boundary to recover gracefully:

```tsx
import { Suspense } from '@estjs/template';
import { ErrorBoundary } from './ErrorBoundary';

function App() {
  return (
    <div class="app">
      <ErrorBoundary fallback={<div>Something went wrong. Please try again.</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <AsyncComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

You can also inspect the resource's `error` and `state` signals directly when you need finer-grained control:

```tsx
const [user] = createResource(/* ... */);

return (
  <>
    {() => user.error.value && <p>Failed: {user.error.value.message}</p>}
    {() => user.state.value === 'ready' && <Profile user={user()!} />}
  </>
);
```

## API

### Props

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `Node \| Node[] \| Promise<Node \| Node[]>` | - | Children that may suspend |
| `fallback` | `Node \| Node[]` | - | Content shown while children are pending |
| `key` | `string` | `undefined` | Optional unique identifier |


## Best Practices

- Use Suspense for async components and resource loading
- Provide meaningful fallback content for each Suspense boundary
- Place boundaries at appropriate granularity so a single slow request doesn't stall the whole page
- Combine with error boundaries so failed promises don't leave the UI stuck on the fallback
- Prefer skeleton screens or spinners over plain "Loading..." text for a better user experience
