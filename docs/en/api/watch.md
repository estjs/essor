# watch

Watches one or more reactive data sources for changes and executes a callback when they change. Unlike `effect`, `watch` provides finer-grained control, including access to the previous and current values.

## Basic Usage

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

// Watch for changes to count
const stop = watch(count, (newValue, oldValue) => {
  console.log(`count changed from ${oldValue} to ${newValue}`);
});

count.value = 5;
// Output: count changed from 0 to 5

// Stop watching
stop();

// No longer triggers the callback
count.value = 10;
```

## Type Definitions

```ts
// Watch a single data source
function watch<T>(
  source: WatchSource<T>,
  callback: (value: T, oldValue: T) => any,
  options?: WatchOptions,
): () => void;

// Watch multiple data sources
function watch<T extends Readonly<WatchSource<unknown>[] | object>>(
  sources: T,
  callback: (values: MapSources<T>, oldValues: MapSources<T>) => any,
  options?: WatchOptions,
): () => void;

// Watch options
interface WatchOptions {
  // Whether to immediately execute the callback once
  immediate?: boolean;
  // Whether to deeply watch
  deep?: boolean | number;
}

// Watchable data source type
type WatchSource<T> = Signal<T> | Computed<T> | (() => T);
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| source | `WatchSource<T>` \| `WatchSource<T>[]` \| `object` | The data source(s) to watch |
| callback | `(newValue, oldValue) => any` | The callback to execute when the data source changes |
| options | `WatchOptions` | Optional configuration options |

### options

| Option | Type | Default Value | Description |
|--------|------|---------------|-------------|
| immediate | `boolean` | `false` | Whether to execute the callback immediately when the watcher is created |
| deep | `boolean \| number` | `false` | Whether to deeply watch for changes inside objects. Can also specify the depth level |

## Return Value

Returns a stop function that, when called, stops the watcher from working.

## Examples

### Watching a Single Signal

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

watch(count, (newCount, oldCount) => {
  console.log(`Count changed from ${oldCount} to ${newCount}`);
});

count.value++;
// Output: Count changed from 0 to 1
```

### Watching a Computed Property

```ts
import { computed, signal, watch } from '@estjs/signals';

const count = signal(0);
const doubled = computed(() => count.value * 2);

watch(doubled, (newValue, oldValue) => {
  console.log(`Doubled value changed from ${oldValue} to ${newValue}`);
});

count.value = 2;
// Output: Doubled value changed from 0 to 4
```

### Watching Multiple Data Sources

```ts
import { signal, watch } from '@estjs/signals';

const firstName = signal('John');
const lastName = signal('Doe');

watch([firstName, lastName], ([newFirst, newLast], [oldFirst, oldLast]) => {
  console.log(`First name changed from "${oldFirst}" to "${newFirst}"`);
  console.log(`Last name changed from "${oldLast}" to "${newLast}"`);
});

firstName.value = 'Jane';
// Output: First name changed from "John" to "Jane"
// Output: Last name changed from "Doe" to "Doe"
```

### Watching Reactive Objects

```ts
import { reactive, watch } from '@estjs/signals';

const user = reactive({ name: 'John', age: 30 });

watch(user, (newUser, oldUser) => {
  // ⚠️ For object / reactive sources, newUser and oldUser are the SAME
  // reference — see the "oldValue caveat" note below.
  console.log('User changed:', newUser.age); // 31
  console.log(oldUser === newUser); // true
});

user.age = 31;
```

> #### ⚠️ `oldValue` caveat for object / reactive sources
>
> For performance, `watch` does **not** deep-clone the watched value between
> runs. When the source is a **reactive object, array, Map/Set, or a getter that
> returns one**, the `newValue` and `oldValue` passed to your callback are the
> **same reference** (`newValue === oldValue`), and reading `oldValue.foo`
> returns the already-mutated value — there is no previous snapshot. (Vue
> behaves the same way for deep/reactive sources.)
>
> To get a real previous value, watch a **derived primitive** instead:
>
> ```ts
> // ❌ old === new (both point at the mutated object)
> watch(user, (n, o) => {});
>
> // ✅ watch a derived primitive — oldAge is the prior value
> watch(() => user.age, (newAge, oldAge) => {
>   console.log(`age: ${oldAge} → ${newAge}`); // age: 30 → 31
> });
> ```
>
> For primitive sources (signals/computed/getters returning primitives),
> `oldValue` behaves exactly as expected.

### Using Getter Functions

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

// Use a getter function to watch derived values
watch(
  () => count.value * 2,
  (newValue, oldValue) => {
    console.log(`Doubled value changed from ${oldValue} to ${newValue}`);
  },
);

count.value = 2;
// Output: Doubled value changed from 0 to 4
```

### Deep Watching

```ts
import { signal, watch } from '@estjs/signals';

const user = signal({
  name: 'John',
  profile: {
    age: 30,
    address: { city: 'New York' },
  },
});

// Without deep option, only triggers when the entire user object is replaced
watch(user, () => {
  console.log('User object was replaced');
});

// With deep option, can watch for changes in nested properties
watch(
  user,
  () => {
    console.log(`User city changed to: ${user.value.profile.address.city}`);
  },
  { deep: true },
);

// Won't trigger the first watch, but will trigger the second watch
user.value.profile.address.city = 'San Francisco';
// Output: User city changed to: San Francisco

// Limit deep watching to specific depth
watch(
  user,
  () => {
    console.log('User profile changed');
  },
  { deep: 2 }, // Only watch up to the profile level
);
```

### Immediate Callback Execution

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

watch(
  count,
  (newValue, oldValue) => {
    console.log(`Count current value: ${newValue}, old value: ${oldValue}`);
  },
  { immediate: true },
);
// Output: Count current value: 0, old value: undefined
```

## Differences from effect

The main differences between `watch` and `effect`:

1. **Callback parameters**: `watch` provides new and old values, while `effect` doesn't
2. **Execution timing**: `watch` is lazy by default, only executing when dependencies change; `effect` executes once when created
3. **Control granularity**: `watch` allows more fine-grained control, such as deep watching and immediate execution options
4. **Data source specification**: `watch` requires explicitly specifying data sources to watch, while `effect` automatically collects all reactive data used internally

```ts
// Using effect
effect(() => {
  console.log(`Current count: ${count.value}`);
});

// Equivalent watch syntax
watch(count, newValue => {
  console.log(`Current count: ${newValue}`);
});
```

## Performance Considerations

1. **Avoid expensive operations in callbacks**: If you need to perform complex computations, consider using debouncing or throttling
2. **Be aware of deep watching performance impact**: Deep watching recursively traverses objects and may impact performance for large objects
3. **Clean up promptly**: When watching is no longer needed, call the returned stop function to free resources

## Notes

1. **Avoid modifying watched data in callbacks**: This can lead to infinite loops
2. **Callbacks execute synchronously**: Callback functions execute synchronously when data changes
3. **Use deep watching for complex objects**: For nested object property changes, deep watching needs to be enabled
