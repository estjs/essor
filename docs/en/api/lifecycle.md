# Lifecycle Hooks

Essor provides scope-bound lifecycle hooks for executing logic when components mount, update, and destroy.

## Overview

Lifecycle hooks are provided in the `@estjs/template` package and must be called inside a component function or scope:

- `onMount` — Executed after the component mounts
- `onUpdate` — Executed after the component updates
- `onDestroy` — Executed before the component destroys

For generic, non-component cleanup, see [Scope Cleanup](#scope-cleanup) below.

## onMount

Executed after the component has mounted. If called when the component is already mounted, it executes immediately.

```tsx
import { onMount } from '@estjs/template';
import { signal } from '@estjs/signals';

function Timer() {
  let $elapsed = 0;

  onMount(() => {
    const interval = setInterval(() => {
      $elapsed++;
    }, 1000);

    // Optional cleanup function return
    return () => clearInterval(interval);
  });

  return <p>Elapsed: {$elapsed} seconds</p>;
}
```

### Async Support

`onMount` supports returning a Promise. The framework waits for async mount logic to complete:

```tsx
onMount(async () => {
  const data = await fetchData();
  $data = data;
});
```

## onUpdate

Executed after each reactive update of the component.

```tsx
import { onUpdate } from '@estjs/template';
import { signal } from '@estjs/signals';

function Logger() {
  let $count = 0;

  onUpdate(() => {
    console.log('count updated to:', $count);
  });

  return <button onClick={() => $count++}>{$count}</button>;
}
```

Note: `onUpdate` does **not** trigger on the initial mount, only on subsequent reactive updates.

## onDestroy

Executed before the component is destroyed, used for releasing resources, unsubscribing, etc.

```tsx
import { onDestroy } from '@estjs/template';
import { signal } from '@estjs/signals';

function Subscriber() {
  const channel = new BroadcastChannel('app');

  onDestroy(() => {
    channel.close();
  });

  return <div>Broadcast channel connected</div>;
}
```

## Scope Cleanup

There is no `onCleanup` hook in Essor. For cleanup outside the component destroy lifecycle, use one of these two patterns:

### Effect-returned cleanup

An `effect` callback can return a cleanup function. It runs exactly once before each re-execution and once on final disposal:

```tsx
import { effect } from '@estjs/signals';

function ResourceLoader() {
  let $url = '/api/data';

  effect(() => {
    const controller = new AbortController();
    fetch($url, { signal: controller.signal });

    // Runs before each re-execution and on disposal
    return () => controller.abort();
  });

  return <div>Loading...</div>;
}
```

### onScopeDispose

`onScopeDispose` (from `@estjs/signals`) registers a callback on the current effect scope, invoked when the scope is disposed. It works in any scope, including non-component scopes created via `effectScope()`:

```tsx
import { effectScope, onScopeDispose } from '@estjs/signals';

const scope = effectScope();
scope.run(() => {
  const channel = new BroadcastChannel('app');
  onScopeDispose(() => channel.close());
});

// Later:
scope.stop(); // channel.close() runs here
```

## Execution Order

When a component is destroyed, cleanup logic executes in the following order:

1. Child scope cleanup functions and `onDestroy` hooks (depth-first)
2. Current scope `onDestroy` hooks
3. Current scope `cleanup` functions
4. Break parent reference, mark as destroyed

## Considerations

1. **Must be called within a scope**: Call inside a component function or `runWithScope`, otherwise an error is logged in development mode.
2. **Multiple calls**: The same lifecycle can register multiple hooks, executed in registration order.
3. **Avoid memory leaks**: Timers, event listeners, and other resources created in `onMount` must be released in the returned cleanup function or `onDestroy`.
4. **Error handling**: Uncaught exceptions in async hooks are logged in development mode but do not block other hooks.

## Type Definitions

```ts
function onMount(hook: () => void | Promise<void>): void;
function onUpdate(hook: () => void | Promise<void>): void;
function onDestroy(hook: () => void | Promise<void>): void;
```
