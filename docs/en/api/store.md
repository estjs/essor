# createStore

Creates a reactive state management store based on the signal system for centralized state management and sharing.

## Basic Usage

```ts
import { createStore } from '@estjs/signals';

// Define the store
const useCounter = createStore({
  // State
  state: {
    count: 0,
    history: [] as number[],
  },

  // Computed properties
  getters: {
    doubleCount: state => state.count * 2,
    total: state => state.history.reduce((sum, val) => sum + val, 0),
  },

  // Action methods
  actions: {
    increment() {
      this.count++;
      this.history.push(this.count);
    },

    decrement() {
      this.count--;
      this.history.push(this.count);
    },

    async fetchData() {
      const response = await fetch('https://api.example.com/counter');
      const data = await response.json();
      this.count = data.count;
    },
  },
});

// Use the store
const counter = useCounter();

// Access state
console.log(counter.count); // 0
console.log(counter.doubleCount); // 0

// Call actions
counter.increment();
console.log(counter.count); // 1
console.log(counter.doubleCount); // 2
console.log(counter.history); // [1]
```

## Type Definitions

```ts
// Create store function
function createStore<S extends State, G extends Getters<S>, A extends Actions>(
  storeDefinition: StoreDefinition<S, G, A>,
): () => S & GetterValues<G> & A & StoreActions<S> & { state: S };

// Store definition (two ways)
type StoreDefinition<S extends State, G extends Getters<S>, A extends Actions> =
  | (new () => S) // Class-based approach
  | {
      // Object-based approach
      state: S;
      getters?: G;
      actions?: A;
    };

// Built-in store actions
interface StoreActions<S extends State> {
  patch$(payload: Partial<S>): void;
  subscribe$(callback: (state: S) => void): void;
  unsubscribe$(callback: (state: S) => void): void;
  onAction$(callback: (state: S) => void): void;
  reset$(): void;
}
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| storeDefinition | `StoreDefinition<S, G, A>` | Store definition, can be a class or an object containing state, getters, and actions |

## Return Value

Returns a function that, when called, creates a store instance containing state, getters, and actions.

## Examples

### Object-based Store

```ts
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: {
    count: 0,
  },
  getters: {
    doubleCount: state => state.count * 2,
    tripleCount: state => state.count * 3,
  },
  actions: {
    increment() {
      this.count++;
    },
    addAmount(amount: number) {
      this.count += amount;
    },
  },
});

const counter = useCounter();
console.log(counter.count); // 0
console.log(counter.doubleCount); // 0

counter.increment();
console.log(counter.count); // 1
console.log(counter.doubleCount); // 2

counter.addAmount(5);
console.log(counter.count); // 6
console.log(counter.doubleCount); // 12
```

### Class-based Store

```ts
import { createStore } from '@estjs/signals';

// Using a class to define the store
class Counter {
  count = 0;
  history: number[] = [];

  get doubleCount() {
    return this.count * 2;
  }

  increment() {
    this.count++;
    this.history.push(this.count);
  }

  decrement() {
    this.count--;
    this.history.push(this.count);
  }
}

const useCounter = createStore(Counter);
const counter = useCounter();

counter.increment();
console.log(counter.count); // 1
console.log(counter.doubleCount); // 2
console.log(counter.history); // [1]
```

### Accessing Raw State

```ts
import { createStore } from '@estjs/signals';

const useUser = createStore({
  state: {
    firstName: 'John',
    lastName: 'Doe',
  },
  getters: {
    fullName: state => `${state.firstName} ${state.lastName}`,
  },
});

const user = useUser();

// Access the original state object directly via the state property
console.log(user.state.firstName); // 'John'
console.log(user.state.lastName); // 'Doe'

// You can also access top-level properties directly
console.log(user.firstName); // 'John'
console.log(user.lastName); // 'Doe'
console.log(user.fullName); // 'John Doe'
```

### Using the Built-in patch$ Method

```ts
import { createStore } from '@estjs/signals';

const useUser = createStore({
  state: {
    name: 'John',
    age: 30,
    address: {
      city: 'New York',
      street: 'Broadway',
    },
  },
});

const user = useUser();

// Use the patch$ method to update multiple properties at once
user.patch$({
  name: 'Jane',
  age: 25,
  address: {
    ...user.address,
    city: 'San Francisco',
  },
});

console.log(user.name); // 'Jane'
console.log(user.age); // 25
console.log(user.address.city); // 'San Francisco'
```

### Subscribing to State Changes

```ts
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: { count: 0 },
  actions: {
    increment() {
      this.count++;
    },
  },
});

const counter = useCounter();

// Subscribe to state changes
const unsubscribe = counter.subscribe$(state => {
  console.log(`Count changed to: ${state.count}`);
});

counter.increment();
// Output: Count changed to: 1

counter.patch$({ count: 5 });
// Output: Count changed to: 5

// Unsubscribe
unsubscribe();

counter.increment();
// No output
```

### Subscribe to Action Execution

```ts
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: { count: 0 },
  actions: {
    increment() {
      this.count++;
    },
    decrement() {
      this.count--;
    },
  },
});

const counter = useCounter();

// Subscribe to action execution
counter.onAction$(state => {
  console.log(`Action executed, count is now: ${state.count}`);
});

counter.increment();
// Output: Action executed, count is now: 1

counter.decrement();
// Output: Action executed, count is now: 0
```

### Resetting State

```ts
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: { count: 0 },
});

const counter = useCounter();

// Modify state
counter.count = 10;
console.log(counter.count); // 10

// Reset to initial state
counter.reset$();
console.log(counter.count); // 0
```

## Built-in Methods

All stores created with `createStore` include the following built-in methods:

### patch$

Updates multiple state properties and triggers a single update.

```ts
store.patch$({ key1: value1, key2: value2 });
```

### subscribe$

Subscribe to state changes.

```ts
const unsubscribe = store.subscribe$(state => {
  console.log('State changed:', state);
});

// Unsubscribe
unsubscribe();
```

### unsubscribe$

Unsubscribe from state changes.

```ts
const callback = state => console.log('State changed:', state);
store.subscribe$(callback);
store.unsubscribe$(callback);
```

### onAction$

Subscribe to action execution.

```ts
store.onAction$(state => {
  console.log('Action executed:', state);
});
```

### reset$

Reset state to initial values.

```ts
store.reset$();
```

## Performance Considerations

1. **Avoid overly large state objects**: Split into multiple focused stores
2. **Use getters to cache computed values**: Avoid recalculating during renders
3. **Use patch$ for batch updates**: Reduce the number of state updates

## Notes

1. **Avoid circular dependencies**: Prevent circular references between different stores
2. **Use immutable update pattern**: Avoid directly modifying nested objects
```ts
// Incorrect
user.address.city = 'San Francisco';

// Correct
user.patch$({
  address: {
    ...user.address,
    city: 'San Francisco',
  },
});
```

3. **Lifecycle management**: Unsubscribe when finished to avoid memory leaks
```
