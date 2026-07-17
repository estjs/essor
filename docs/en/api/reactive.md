# reactive

Creates a reactive object whose property changes can be automatically tracked. Unlike `signal`, reactive objects don't need to be accessed using `.value` - properties can be directly operated on.

## Basic Usage

```ts
import { effect, reactive } from '@estjs/signals';

// Create a reactive object
const user = reactive({ name: 'John', age: 30 });

// Directly access and modify properties
console.log(user.name); // 'John'
user.age = 31;

// Use in effects
effect(() => {
  console.log(`${user.name} is ${user.age} years old`);
});
// Output: John is 31 years old

// Modifying properties triggers effects
user.name = 'Jane';
// Output: Jane is 31 years old
```

## Type Definitions

```ts
function reactive<T extends object>(target: T): T;
function shallowReactive<T extends object>(target: T): T;
function isReactive<T extends object>(target: T): boolean;
function toRaw<T>(value: T): T;
```

## Parameters

| Function | Parameter | Type | Description |
|----------|-----------|------|-------------|
| reactive | target | `T extends object` | The target object to convert to reactive |
| shallowReactive | target | `T extends object` | The target object to convert to shallow reactive |
| isReactive | target | `T extends object` | The object to check if it's reactive |
| toRaw | value | `T` | The reactive object to get the raw object from |

## Return Value

- **reactive**: Returns a proxy object where all properties (including nested ones) are reactive
- **shallowReactive**: Returns a proxy object where only top-level properties are reactive
- **isReactive**: Returns `true` if the object is reactive, `false` otherwise
- **toRaw**: Returns the original object; if the input is not a reactive object, returns as is

## Examples

### Basic Usage

```ts
import { effect, reactive } from '@estjs/signals';

const user = reactive({
  name: 'John',
  age: 30,
  address: {
    city: 'New York',
    street: 'Broadway',
  },
});

effect(() => {
  console.log(`${user.name} lives in ${user.address.city}`);
});
// Output: John lives in New York

// Modifying nested properties still triggers effects
user.address.city = 'San Francisco';
// Output: John lives in San Francisco
```

### Reactive Arrays

```ts
import { effect, reactive } from '@estjs/signals';

const numbers = reactive([1, 2, 3]);

effect(() => {
  console.log(`Array contents: ${numbers.join(', ')}`);
});
// Output: Array contents: 1, 2, 3

// Adding new elements triggers effects
numbers.push(4);
// Output: Array contents: 1, 2, 3, 4

// Modifying elements triggers effects
numbers[0] = 10;
// Output: Array contents: 10, 2, 3, 4

// Array methods also trigger effects
numbers.reverse();
// Output: Array contents: 4, 3, 2, 10
```

### Shallow Reactive Objects

```ts
import { effect, shallowReactive } from '@estjs/signals';

const user = shallowReactive({
  name: 'John',
  age: 30,
  profile: {
    city: 'New York',
  },
});

effect(() => {
  console.log(`${user.name}, ${user.profile.city}`);
});
// Output: John, New York

// Modifying top-level properties triggers effects
user.name = 'Jane';
// Output: Jane, New York

// Modifying nested object properties doesn't trigger effects
user.profile.city = 'San Francisco';
// No output
```

### Checking if an Object is Reactive

```ts
import { isReactive, reactive } from '@estjs/signals';

const original = { count: 0 };
const reactiveObj = reactive(original);

console.log(isReactive(original)); // false
console.log(isReactive(reactiveObj)); // true
```

### Getting the Original Object from a Reactive Object

```ts
import { reactive, toRaw } from '@estjs/signals';

const original = { count: 0 };
const reactiveObj = reactive(original);

// Modifying the reactive object triggers effects
reactiveObj.count++;

// Get the original object
const rawObj = toRaw(reactiveObj);
console.log(rawObj === original); // true

// Modifying the original object doesn't trigger effects
rawObj.count++;
```

### Complex Collection Types

The reactive system supports `Map`, `Set`, `WeakMap`, and `WeakSet`:

```ts
import { effect, reactive } from '@estjs/signals';

// Reactive Map
const map = reactive(new Map());
effect(() => {
  console.log(`Map size: ${map.size}`);
});
// Output: Map size: 0

map.set('key', 'value');
// Output: Map size: 1

// Reactive Set
const set = reactive(new Set());
effect(() => {
  console.log(`Set has 'item': ${set.has('item')}`);
});
// Output: Set has 'item': false

set.add('item');
// Output: Set has 'item': true
```

## Reactive Conversion Rules

Different types of objects follow these rules when converted to reactive:

| Data Type | Reactive Behavior |
|-----------|------------------|
| Plain Objects | All properties are reactive, including nested objects |
| Arrays | Reactive support for all array methods and index access |
| Map/Set | Collection methods like `set`, `add`, `delete` trigger reactive updates |
| Primitive Values | Not directly supported, use `signal` instead |
| Already Reactive | Returned as is, not converted again |

## Comparing reactive and signal

### When to Use reactive

- Suitable for complex object structures, especially deeply nested objects
- When you want to use more natural object access syntax without `.value`
- Handling collection types like `Map` and `Set`

### When to Use signal

- Handling primitive values (numbers, strings, booleans)
- When you need explicit data change boundaries
- When you want more fine-grained control over dependency tracking

## Performance Considerations

1. **Avoid large reactive objects**: Oversized objects increase proxy conversion overhead
2. **Use toRaw for non-reactive operations**: For operations that don't need to trigger updates
3. **shallowReactive for performance optimization**: When only top-level reactivity is needed

## Notes

1. **Can't directly add new top-level properties**:
```ts
const user = reactive({});
user.name = 'John'; // May not trigger dependency updates
```

2. **Solution: Use spread operator to assign a new object**:
```ts
user = { ...user, name: 'John' };
```

3. **Destructuring reactive objects loses reactivity**:
```ts
const user = reactive({ name: 'John', age: 30 });
const { name, age } = user; // name and age are no longer reactive
```

4. **Alternative to destructuring reactive objects**:
```ts
const user = reactive({ name: 'John', age: 30 });

// Use computed properties to maintain reactivity
const name = computed(() => user.name);
const age = computed(() => user.age);
```

## Advanced

The following APIs are low-level utilities for advanced use cases, debugging, and testing. Most application code will never need them.

### untrack

Runs a function without collecting any reactive dependencies. Reads performed inside the callback do **not** subscribe the surrounding `effect`/`computed` to those sources:

```ts
import { effect, reactive, untrack } from '@estjs/signals';

const state = reactive({ tracked: 0, ignored: 0 });

effect(() => {
  // Establishes a dependency on `state.tracked`
  const t = state.tracked;

  // Reads inside untrack do NOT establish a dependency
  const i = untrack(() => state.ignored);

  console.log(`tracked=${t}, ignored=${i}`);
});
// Output: tracked=0, ignored=0

state.ignored = 100; // No output — the effect never subscribed to `ignored`
state.tracked = 1;   // Output: tracked=1, ignored=100
```

`untrack` returns the callback's return value and restores the previous tracking context even if the callback throws.

### trigger

Manually notifies all subscribers tracked for a `target`/`key` pair. This is a **debugging and advanced escape hatch** — the reactive proxy calls it automatically on every mutation, so normal code never needs it. It is useful when you mutate a raw object behind the proxy's back (e.g. via `toRaw`) and need to fire the corresponding effects yourself:

```ts
import { effect, reactive, toRaw, trigger } from '@estjs/signals';

const state = reactive<Record<string, number>>({ a: 1 });

effect(() => {
  console.log('keys:', Object.keys(state).join(','));
});
// Output: keys: a

// Adding a key on the raw object bypasses the proxy — no effect runs
toRaw(state).b = 2;

// Manually notify subscribers that a key was added
trigger(toRaw(state), 'ADD', 'b', 2);
// Output: keys: a,b
```

The `type` argument describes the mutation kind (`'SET'`, `'ADD'`, `'DELETE'`, `'CLEAR'`). For `'ADD'`, `'DELETE'`, and `'CLEAR'`, iteration-dependent effects (e.g. those reading `Object.keys`, array length, or `Map.size`) are also notified. `key` may be a single key or an array of keys to notify multiple deps in one deduplicated round.

### toReactive

Returns a reactive proxy for the given value if it is an object; otherwise returns the value unchanged. Handy for normalizing values that may or may not be objects:

```ts
import { isReactive, toReactive } from '@estjs/signals';

const obj = toReactive({ count: 0 });
console.log(isReactive(obj)); // true

const num = toReactive(42);
console.log(num); // 42 — primitives are returned as-is
```

### getTargetDepSize

Counts the active effect subscribers on a specific property of a reactive object. Primarily intended for **tests** that assert effects are properly cleaned up. Accepts either the reactive proxy or the raw target:

```ts
import { effect, getTargetDepSize, reactive } from '@estjs/signals';

const state = reactive({ count: 0 });

console.log(getTargetDepSize(state, 'count')); // 0

const runner = effect(() => {
  state.count; // subscribes to `count`
});

console.log(getTargetDepSize(state, 'count')); // 1

runner.stop();
console.log(getTargetDepSize(state, 'count')); // 0 — subscriber cleaned up
```

### Type Definitions

```ts
function untrack<T>(fn: () => T): T;

function trigger(
  target: object,
  type: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
): void;

function toReactive<T>(value: T): T;

function getTargetDepSize(target: object, key: string | symbol): number;
```
