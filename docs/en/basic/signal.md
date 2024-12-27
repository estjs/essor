
### `signal`

#### Overview
`signal` is a function used to create a reactive signal. A signal is a state unit that can be monitored, and when its value changes, any dependent computed properties and side effects will automatically update.

#### Usage

```typescript
import { signal } from './signal';

const count = signal(0);
console.log(count.value); // 0

count.value = 5;
console.log(count.value); // 5
```

#### Parameters
- **`initialValue`**: The initial value of the signal.

#### Returns
- **`Signal`**: An object with a reactive `value` property.

---

### `effect`

#### Overview
The `effect` function allows you to execute side effects when a signal or computed property changes. It is a key tool for performing side-effect operations within a reactive system.

#### Usage

```typescript
import { effect, signal } from './signal';

const count = signal(0);

effect(() => {
  console.log(`Count changed to: ${count.value}`);
});

count.value = 1; // Console output: Count changed to: 1
```

#### Parameters
- **`effect`**: The side-effect function to be executed when reactive data changes.

#### Returns
- **`WatchStopHandle`**: A function to stop the side effect.

---

### `computed`

#### Overview
The `computed` function is used to create a computed property based on other signals or reactive states. The computed property automatically depends on the signals or reactive states it uses and updates automatically when these dependencies change.

#### Usage

```typescript
import { computed, signal } from './signal';

const count = signal(2);
const doubleCount = computed(() => count.value * 2);

console.log(doubleCount.value); // 4

count.value = 3;
console.log(doubleCount.value); // 6
```

#### Parameters
- **`getter`**: A function that returns the computed value, which can use other signals or reactive states within it.

#### Returns
- **`Computed`**: A computed property object with a reactive `value` property.

---

### `signalObject`

#### Overview
`signalObject` is a tool that converts a plain object into an object with reactive signals. Each property of the converted object becomes a signal, allowing for monitoring changes in the property values.

#### Usage

```typescript
import { signalObject } from './signal';

const state = signalObject({ count: 0, name: 'Alice' });

console.log(state.count.value); // 0
state.count.value = 5;
console.log(state.count.value); // 5
```

#### Parameters
- **`obj`**: The plain object to be converted.

#### Returns
- **`object`**: An object with the same shape as the input object, but with properties as signals.

---

### `isSignal`

#### Overview
The `isSignal` function is used to check if a value is a signal. This is useful when dynamically handling data, especially when you need to ensure that certain values are reactive.

#### Usage

```typescript
import { isSignal, signal } from './signal';

const count = signal(0);

console.log(isSignal(count)); // true
console.log(isSignal(42)); // false
```

#### Parameters
- **`value`**: The value to check.

#### Returns
- **`boolean`**: Returns `true` if the value is a signal, otherwise returns `false`.


### `reactive`

#### Basic Usage
The `reactive` function creates a reactive object. The properties of the object will automatically trigger updates when they change.

#### Example
```javascript
import { reactive } from '@aube/shared';

const state = reactive({ count: 0 });

console.log(state.count); // 0

state.count = 1;
console.log(state.count); // 1
```


- **`initialValue`**: The initial value for the reactive object.
- **`exclude`**: A function or array to exclude certain keys from being made reactive.
- **Returns**: A reactive object.

---

### `isReactive`

#### Basic Usage
The `isReactive` function checks if a given object is reactive.

#### Example
```javascript
import { isReactive, reactive } from '@aube/shared';

const state = reactive({ count: 0 });

console.log(isReactive(state)); // true
console.log(isReactive({})); // false
```



- **`obj`**: The object to check.
- **Returns**: `true` if the object is reactive, otherwise `false`.

---

### `unReactive`

#### Basic Usage
The `unReactive` function creates a shallow copy of a reactive object.

#### Example
```javascript
import { unReactive, reactive } from '@aube/shared';

const state = reactive({ count: 0 });

const copy = unReactive(state);
console.log(copy.count); // 0
```



- **`obj`**: The reactive object to copy.
- **Returns**: A shallow copy of the reactive object.

---

### `shallowReactive`

#### Basic Usage
The `shallowReactive` function creates a reactive object, but only the top-level properties are reactive. Nested objects are not reactive.

#### Example
```javascript
import { shallowReactive } from '@aube/shared';

const state = shallowReactive({ nested: { count: 0 } });

console.log(isReactive(state)); // true
console.log(isReactive(state.nested)); // false
```


- **`initialValue`**: The initial value for the reactive object.
- **`exclude`**: A function or array to exclude certain keys from being made reactive.
- **Returns**: A shallow reactive object.

---

### `shallowSignal`

#### Basic Usage
The `shallowSignal` function creates a shallow signal that does not recursively track the value. This is useful for performance optimization when the value is an object or an array that is not expected to change.

#### Example
```javascript
import { shallowSignal } from '@aube/shared';

const state = shallowSignal({ count: 0 });

console.log(isSignal(state)); // true
```

- **`value`**: The initial value for the signal.
- **Returns**: A shallow `Signal` object.
