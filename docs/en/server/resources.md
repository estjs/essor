# Resources

## Overview

`createResource` turns an async fetcher into reactive state that works with `Suspense`. It starts a request when the owning component is created, exposes loading/error/state signals, and aborts stale requests when the resource refetches or the component is disposed.

## createResource

### Type Signature

```typescript
function createResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: ResourceOptions<T>
): [Resource<T>, ResourceActions<T>]

interface ResourceOptions<T> {
  /** Initial value returned before the first request resolves */
  initialValue?: T
}

interface Resource<T> {
  (): T | undefined
  loading: Signal<boolean>
  error: Signal<Error | null>
  state: Signal<'pending' | 'ready' | 'errored'>
}

interface ResourceActions<T> {
  mutate: (value: T) => void
  refetch: () => Promise<void>
}
```

### Basic Usage

```tsx
import { createResource } from 'essor'

function UserProfile({ userId }: { userId: string }) {
  const [user, { refetch, mutate }] = createResource(async (signal) => {
    const res = await fetch(`/api/users/${userId}`, { signal })
    if (!res.ok) throw new Error('Failed to load user')
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
          <button onClick={() => mutate({ ...user()!, name: 'Draft name' })}>
            Rename locally
          </button>
        </div>
      )}
    </div>
  )
}
```

The `AbortSignal` lets `fetch` cancel an obsolete request. Ignoring the signal is safe, but passing it through avoids wasted network work when a resource refetches quickly or unmounts before the request resolves.

### Using with Suspense

Resources register each pending request with the nearest `Suspense` boundary. The fallback stays visible until the registered request settles.

```tsx
import { createResource, Suspense } from 'essor'

function UserProfile({ userId }: { userId: string }) {
  const [user] = createResource(async (signal) => {
    const res = await fetch(`/api/users/${userId}`, { signal })
    if (!res.ok) throw new Error('Failed to load user')
    return res.json()
  })

  return (
    <div>
      <h1>{user()?.name}</h1>
      <p>{user()?.email}</p>
    </div>
  )
}

function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  )
}
```

## Resource Object

### Accessor Function

```typescript
const [user] = createResource(fetcher)

const userData = user() // T | undefined
```

### State Signals

```typescript
user.loading.value // boolean
user.error.value   // Error | null
user.state.value   // 'pending' | 'ready' | 'errored'
```

## ResourceActions

### mutate

Manually replace the current resource value without starting a request.

```typescript
const [user, { mutate }] = createResource(fetcher)

mutate({ ...user()!, name: 'New Name' })
```

### refetch

Abort the current in-flight request, start a new one, and resolve when the new request finishes.

```typescript
const [user, { refetch }] = createResource(fetcher)

await refetch()
```

## Error Handling

Fetcher errors are saved on `resource.error` and set `resource.state.value` to `'errored'`.

```typescript
const [data] = createResource(async (signal) => {
  const res = await fetch('/api/data', { signal })
  if (!res.ok) throw new Error('Failed to fetch data')
  return res.json()
})

if (data.error.value) {
  console.error(data.error.value.message)
}
```

## Best Practices

1. Pass the provided `AbortSignal` to `fetch` or any cancellable API.
2. Create resources at the top level of a component, not inside loops.
3. Use `Suspense` for page-level loading states and direct `loading/error/state` reads for local controls.
4. Treat `resource()` as possibly `undefined` until `state.value === 'ready'` or an `initialValue` is provided.

## Related APIs

- [Suspense](../components/Suspense.md) - Handle async loading states
