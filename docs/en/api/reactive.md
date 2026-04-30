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
