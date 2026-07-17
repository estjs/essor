# Batch Updates

Batch updates allow multiple signal changes to be grouped together so that only a single round of reactive updates is triggered, reducing unnecessary intermediate computations and DOM operations.

## What Is a Batch Update?

In normal cases, every signal assignment triggers an immediate update to dependent `effect` and `computed` values. When multiple signals change in quick succession (such as in an event handler), this can lead to excessive intermediate computations.

The `batch` function defers all reactive side effects until the callback finishes, then runs them once. This significantly improves performance and guarantees consistency across related state.

## Basic Usage

```tsx
import { batch, effect, signal } from '@estjs/signals';

const count1 = signal(0);
const count2 = signal(0);

effect(() => {
  console.log(`sum: ${count1.value + count2.value}`);
});
// logs: sum: 0

// Without batch, the effect runs twice
count1.value = 1; // logs: sum: 1
count2.value = 2; // logs: sum: 3

// With batch, the effect runs only once
batch(() => {
  count1.value = 3;
  count2.value = 4;
});
// logs: sum: 7
```

The same pattern works seamlessly with the `$` signal sugar inside components:

```tsx
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
    // effect runs only once after batch completes
  }

  return (
    <div>
      <p>{$firstName} {$lastName}</p>
      <button onClick={updateName}>Update name</button>
    </div>
  );
}
```

## When to Use Batching

Batching is especially useful when:

1. **Updating multiple related values** — keep dependent state in sync
2. **Form handling** — set many fields at once
3. **Remote data loading** — apply API responses across several signals
4. **Animations & transitions** — adjust multiple visual properties together

## Nested Batches

Batches can be nested. Inner `batch` calls are merged into the outer batch:

```ts
batch(() => {
  count1.value = 10;

  batch(() => {
    count2.value = 20;
    count3.value = 30;
  });

  count4.value = 40;
});
// All four updates are processed in a single flush
```

## Batching and Async Code

`batch` only covers **synchronous** code. Async work escapes the batch context:

```ts
batch(() => {
  count1.value = 10; // included in the batch

  setTimeout(() => {
    count2.value = 20; // outside the batch — fires effects immediately
  }, 0);
});
```

## Relationship with `nextTick`

`batch` and `nextTick` solve different problems:

- `batch` — flushes synchronously after the callback returns
- `nextTick` — defers a callback to the next microtask, after the current flush

They compose well:

```ts
import { batch, nextTick, signal } from '@estjs/signals';

const user = signal({ name: '', age: 0 });

async function updateUserAndWait() {
  batch(() => {
    user.value = { name: 'Alice', age: 25 };
  });

  // Wait for all effects to finish
  await nextTick();

  console.log('User updated and all effects have run');
}
```

## Performance Impact

Benchmarks show batching can dramatically reduce update cost:

```ts
// Updating 100 signals
// Without batch: ~24ms
for (let i = 0; i < 100; i++) {
  signals[i].value = i;
}

// With batch: ~3ms
batch(() => {
  for (let i = 0; i < 100; i++) {
    signals[i].value = i;
  }
});
```

## Type Definitions

```ts
function batch<T>(fn: () => T): T;
function nextTick(callback?: () => void): Promise<void>;
```

## Considerations

1. **Reads inside a batch** return the latest assigned value, but dependent effects have not run yet.
2. **Errors thrown inside `batch`** abort the batch and discard pending updates.
3. **Automatic batching** is already applied inside event handlers — manual `batch` is only needed elsewhere.
4. **Don't over-batch** — wrapping every update may delay UI feedback and hurt responsiveness.

::: tip
Whenever you mutate many signals at once, reach for `batch` first to avoid wasted work.
:::

## Advanced

The following low-level APIs expose the batching machinery that `batch` is built on. Prefer `batch` — it handles pairing automatically. Reach for these only when the batch boundary cannot be expressed as a single synchronous callback.

### startBatch / endBatch

Open and close a manual batch boundary. `batch(fn)` is literally `startBatch()` + `fn()` + `endBatch()` in a `try/finally`. When you call them yourself, they **must be paired in a `try/finally`** — an unmatched `startBatch` would suppress flushes forever:

```ts
import { startBatch, endBatch, effect, signal } from '@estjs/signals';

const x = signal(0);
const y = signal(0);

effect(() => {
  console.log(`sum: ${x.value + y.value}`);
});
// logs: sum: 0

startBatch();
try {
  x.value = 1;
  y.value = 2;
  // No effect has run yet — updates are queued.
} finally {
  endBatch();
}
// logs: sum: 3   (single flush when the outermost batch ends)
```

Nesting is supported: only the outermost `endBatch` flushes. Calling `endBatch()` without a matching `startBatch()` is a guarded no-op (with a dev-mode warning) — the depth never goes negative.

### isBatching

Returns `true` while at least one batch is open. Useful for utilities that behave differently inside a batch:

```ts
import { batch, isBatching } from '@estjs/signals';

console.log(isBatching()); // false

batch(() => {
  console.log(isBatching()); // true
});

console.log(isBatching()); // false
```

### getBatchDepth

Returns the current batch nesting depth. `0` means no batch is active:

```ts
import { batch, getBatchDepth } from '@estjs/signals';

console.log(getBatchDepth()); // 0

batch(() => {
  console.log(getBatchDepth()); // 1

  batch(() => {
    console.log(getBatchDepth()); // 2
  });

  console.log(getBatchDepth()); // 1
});

console.log(getBatchDepth()); // 0
```

### Type Definitions

```ts
function startBatch(): void;
function endBatch(): void;
function isBatching(): boolean;
function getBatchDepth(): number;
```
