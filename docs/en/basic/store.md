### `createStore`

#### Basic Usage
The `createStore` function is used to create a reactive store that includes state, getters, and actions. This store allows for reactive state management, with support for computed properties and actions that can modify the state.

#### Example
```javascript
import { createStore } from './store';

const useCounterStore = createStore({
  state: {
    count: 0,
  },
  getters: {
    doubleCount(state) {
      return state.count * 2;
    },
  },
  actions: {
    increment() {
      this.count++;
    },
  },
});

const counterStore = useCounterStore();

console.log(counterStore.state.count); // 0
counterStore.increment();
console.log(counterStore.state.count); // 1
console.log(counterStore.doubleCount.value); // 2
```

#### API
```typescript
function createStore<S, G, A>(
  options: {
    state: S;
    getters?: G;
    actions?: A;
  } & ThisType<S & Getters<G> & A>,
): () => S & Getters<G> & A & StoreActions & { state: S };
```

- **`options`**: The configuration object for the store.
  - **`state`**: The initial state of the store.
  - **`getters`** *(optional)*: Functions to derive computed properties from the state.
  - **`actions`** *(optional)*: Functions to modify the state.
- **Returns**: A function that, when called, returns the store object.

#### Store Object
The returned store object includes:
- **`state`**: The reactive state object.
- **Computed properties**: Derived from the getters.
- **Actions**: Functions to modify the state.
- **StoreActions**: Additional store-specific methods for managing state.

---

### `StoreActions`

#### Overview
`StoreActions` is a set of methods that are included in the store to facilitate state management, such as patching the state, subscribing to state changes, and resetting the state.

#### Methods
- **`patch$(payload: PatchPayload)`**: Updates the store's state with the provided payload.
- **`subscribe$(callback: Callback)`**: Subscribes a callback function that will be called whenever the state changes.
- **`unsubscribe$(callback: Callback)`**: Unsubscribes a previously subscribed callback.
- **`onAction$(callback: Callback)`**: Subscribes a callback function that will be called whenever an action is executed.
- **`reset$()`**: Resets the store's state to its initial value.

#### Example
```javascript
const store = useCounterStore();

// Subscribe to state changes
store.subscribe$(state => {
  console.log('State changed:', state);
});

// Patch the state
store.patch$({ count: 10 });

// Reset the state
store.reset$();
```

---
