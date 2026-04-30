# Suspense

The `Suspense` component lets you display fallback content while waiting for async operations (such as data loading, lazy loading, etc.) to complete. It makes creating loading states and handling async dependencies simple and declarative.

## Basic Usage

Use with lazy-loaded components:

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

In this example, `Suspense` displays "Loading..." while `LazyComponent` is loading.

## Data Fetching

Suspense works with `createResource` for async data fetching:

```tsx
import { Suspense, createResource } from '@estjs/template';

function UserProfile({ userId }) {
  const user = createResource(() => userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  });

  return (
    <div class="user-profile">
      <h2>{user.value().name}</h2>
      <p>{user.value().email}</p>
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

## Nested Suspense

Suspense components can be nested. Each Suspense only handles the suspended state of its direct children:

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

## Error Handling

Combine with an error boundary component to catch async errors:

```tsx
function App() {
  return (
    <div class="app">
      <ErrorBoundary fallback={<div>Something went wrong!</div>}>
        <Suspense fallback={<div>Loading...</div>}>
          <AsyncComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
```

## API

### Props

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | Children that may suspend |
| `fallback` | `JSX.Element \| JSX.Element[]` | - | Content shown while children are suspended |

## Best Practices

- Use Suspense for async components and data loading
- Provide meaningful fallback content for each Suspense boundary
- Set Suspense boundaries at appropriate granularity so one component's loading doesn't stall the entire app
- Combine with error boundaries to handle async errors gracefully
- Consider using skeleton screens or spinners as fallback content rather than plain text
