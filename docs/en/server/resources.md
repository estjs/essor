# Isomorphic Resources

## Overview

The isomorphic data resource system allows you to write data loading logic once and run it seamlessly on both server (SSR) and client (hydration/navigation). The framework automatically handles data serialization, transfer, and reuse, avoiding duplicate fetches.

## createResource

Create an isomorphic data resource that automatically handles server-side data fetching, serialization, and client hydration.

### Type Signature

```typescript
function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>
): [Resource<T>, ResourceActions<T>]

interface ResourceOptions<T> {
  /** Initial value */
  initialValue?: T
  /** Resource name (for debugging and serialization) */
  name?: string
  /** Enable single-flight deduplication (default: true) */
  singleFlight?: boolean
  /** Prefetch during SSR (default: true) */
  ssrLoad?: boolean
}

interface Resource<T> {
  (): T | undefined
  loading: Signal<boolean>
  error: Signal<Error | null>
  state: Signal<ResourceState>
  readonly id: string
}

interface ResourceActions<T> {
  mutate: (value: T) => void
  refetch: () => Promise<void>
}

type ResourceState = 'pending' | 'ready' | 'errored'
```

### Basic Usage

```typescript
import { createResource } from 'essor'

function UserProfile({ userId }) {
  const [user, { refetch, mutate }] = createResource(async () => {
    const res = await fetch(`/api/users/${userId}`)
    return res.json()
  })
  
  return (
    <div>
      {user.loading.value && <div>Loading...</div>}
      {user.error.value && <div>Error: {user.error.value.message}</div>}
      {user() && (
        <div>
          <h1>{user()!.name}</h1>
          <p>{user()!.email}</p>
          <button onClick={refetch}>Refresh</button>
        </div>
      )}
    </div>
  )
}
```

### Using with Suspense

```typescript
import { createResource, Suspense } from 'essor'

function UserProfile({ userId }) {
  const [user] = createResource(() => 
    fetch(`/api/users/${userId}`).then(r => r.json())
  )
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div>
        <h1>{user()!.name}</h1>
        <p>{user()!.email}</p>
      </div>
    </Suspense>
  )
}
```

### Using Options

```typescript
const [user, { refetch }] = createResource(
  () => fetch('/api/user').then(r => r.json()),
  {
    name: 'user-profile',  // For debugging and SSR context
    singleFlight: true,    // Enable request deduplication
    ssrLoad: true,         // Prefetch during SSR
    initialValue: null     // Initial value
  }
)
```

## How It Works

### Server-Side Rendering (SSR)

1. During server execution, `createResource` calls the fetcher function to fetch data
2. The fetched data is serialized into the SSR context
3. The SSR context is embedded into a `<script>` tag in the HTML

### Client Hydration

1. When the client loads, it restores the SSR context from the HTML
2. `createResource` detects data in the SSR context
3. It directly uses the cached data without refetching
4. This avoids duplicate network requests

### Client Navigation

1. After hydration, the SSR context is cleared
2. Subsequent `createResource` calls fetch data normally
3. The single-flight mechanism ensures identical requests are only executed once

## Resource Object

### Accessor Function

```typescript
const [user] = createResource(fetcher)

// Call the resource function to get the current value
const userData = user()  // T | undefined
```

### State Signals

```typescript
// loading: whether loading is in progress
user.loading.value  // boolean

// error: error object (if any)
user.error.value  // Error | null

// state: current state
user.state.value  // 'pending' | 'ready' | 'errored'

// id: unique resource identifier
user.id  // string
```

## ResourceActions

### mutate

Manually update the resource value without triggering a refetch.

```typescript
const [user, { mutate }] = createResource(fetcher)

// Update user data
mutate({ ...user(), name: 'New Name' })
```

### refetch

Manually trigger a data refetch.

```typescript
const [user, { refetch }] = createResource(fetcher)

// Refresh data
await refetch()
```

## Advanced Features

### Single-Flight Deduplication

When multiple components use the same resource, the framework automatically deduplicates requests:

```typescript
// Component A
const [user] = createResource(() => fetch('/api/user').then(r => r.json()))

// Component B (same resource)
const [user] = createResource(() => fetch('/api/user').then(r => r.json()))

// Only one request is sent, and both components share the result
```

### Error Handling

Resources automatically capture and serialize errors:

```typescript
const [data, { refetch }] = createResource(async () => {
  const res = await fetch('/api/data')
  if (!res.ok) {
    throw new Error('Failed to fetch')
  }
  return res.json()
})

// Error is saved to the error signal
if (data.error.value) {
  console.error(data.error.value.message)
}
```

### Conditional Fetching

```typescript
function UserProfile({ userId }) {
  const [user] = createResource(
    () => fetch(`/api/users/${userId}`).then(r => r.json()),
    {
      // Only fetch on client, skip on server
      ssrLoad: false
    }
  )
  
  return <div>{user()?.name}</div>
}
```

## Best Practices

### 1. Use Named Resources

Providing names for resources helps with debugging and tracking:

```typescript
const [user] = createResource(fetcher, {
  name: 'user-profile'
})
```

### 2. Use with Suspense

Using Suspense provides a better loading experience:

```typescript
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### 3. Error Boundaries

Use ErrorBoundary to catch resource errors:

```typescript
<ErrorBoundary fallback={(error) => <ErrorView error={error} />}>
  <UserProfile />
</ErrorBoundary>
```

### 4. Avoid Creating Resources in Loops

Resources should be created at the top level of a component, not in loops or conditionals:

```typescript
// ❌ Incorrect
function List({ ids }) {
  return ids.map(id => {
    const [item] = createResource(() => fetch(`/api/items/${id}`))
    return <div>{item()?.name}</div>
  })
}

// ✅ Correct
function Item({ id }) {
  const [item] = createResource(() => fetch(`/api/items/${id}`))
  return <div>{item()?.name}</div>
}

function List({ ids }) {
  return ids.map(id => <Item key={id} id={id} />)
}
```

## Type Inference

TypeScript automatically infers resource types:

```typescript
interface User {
  id: number
  name: string
  email: string
}

// Type is automatically inferred as Resource<User>
const [user] = createResource(async (): Promise<User> => {
  const res = await fetch('/api/user')
  return res.json()
})

// user() type is User | undefined
const userName = user()?.name
```

## Notes

1. **Fetcher must be a pure function**: The fetcher function should be pure and not depend on external state
2. **Avoid side effects**: Do not perform side effects in the fetcher
3. **Serialization limitations**: Only serializable data types can be passed in SSR
4. **Resource ID uniqueness**: Identical fetcher functions are treated as the same resource

## Related APIs

- [Suspense](../components/Suspense.md) - Handle async loading states
