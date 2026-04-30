# Batch Updates

Batch updates allow multiple signal changes to be grouped together so that only a single round of reactive updates is triggered, reducing unnecessary intermediate computations and DOM operations.

## Overview

In normal cases, every signal assignment triggers an immediate update to dependent `effect` and `computed` values. When multiple signals change in quick succession (such as in an event handler), this can lead to excessive intermediate computations.

The `batch` function delays all reactive updates until the function body finishes executing, then triggers updates once in batch.

## Usage

```ts
import { batch } from '@estjs/signals';
```

### Basic Example

```tsx
import { batch, effect, signal  } from '@estjs/signals';

function UserForm() {
  let $firstName = 'John';
  let $lastName = 'Doe';

  effect(() => {
    console.log('Full name:', $firstName, $lastName);
  });

  function updateName() {
    batch(() => {
      $firstName = 'Jane';
      $lastName = 'Smith';
    });
    // effect only executes once after batch completes
  }

  return (
    <div>
      <p>{$firstName} {$lastName}</p>
      <button onClick={updateName}>Update Name</button>
    </div>
  );
}
```

Without `batch`, the `effect` would execute twice (once after each signal change). With `batch`, it only executes once after both changes are complete.

### Nested batch

`batch` can be nested. The outermost batch determines when updates are actually triggered:

```tsx
batch(() => {
  $count = 1;
  batch(() => {
    $name = 'A';
  });
  $active = true;
});
// All updates are triggered after the outermost batch completes
```

## nextTick

`nextTick` defers callback execution to the next microtask, similar to `Vue.nextTick`.

```ts
import { nextTick } from '@estjs/signals';

function saveData() {
  $status = 'saving';

  nextTick(() => {
    // Executed after current reactive updates finish
    console.log('DOM updated');
  });
}
```

Use cases for `nextTick`:
- Read DOM state after reactive updates finish
- Execute code after the current batch of updates completes
- Avoid blocking the main thread

## Type Definitions

```ts
function batch<T>(fn: () => T): T;
function nextTick(callback: () => void): Promise<void>;
```

## Considerations

1. **State consistency within batch**: During batch execution, reading signals returns the latest assigned value, but dependent effects have not yet executed.
2. **Error handling**: If an exception is thrown inside `batch`, the batch is immediately terminated and all pending updates are discarded.
3. **Automatic batching**: Essor automatically batches signal changes within event handlers; manual `batch` is only needed in other scenarios.
4. **Avoid overuse**: Not all updates need batching. Excessive batching may delay UI updates and reduce responsiveness.
