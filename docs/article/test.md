Here's a generated MDX documentation for the provided code:

```mdx
import {
  type ExcludeType,
  hasChanged,
  isArray,
  isExclude,
  isHTMLElement,
  isObject,
  isPrimitive,
  startsWith,
} from '@essor/shared';
import { isMap, isSet, isWeakMap, isWeakSet } from '@essor/shared';

## Reactive Programming Utilities

This module provides a set of utilities for creating and managing reactive programming in JavaScript.

### Type Definitions

- `EffectFn`: Type alias for a function with no parameters that returns void. Used for effect functions.

### Global Variables

- `activeEffect`: A global variable that holds the currently active effect function.
- `activeComputed`: A global variable that holds the currently active computed function.

### Dependency Tracking with WeakMaps

- `ComputedMap`: A `Map` type that maps keys (strings or symbols) to sets of `Computed` instances.
- `SignalMap`: A `Map` type that maps keys (strings or symbols) to sets of `EffectFn` instances.

```typescript
const computedMap = new WeakMap<object, ComputedMap>();
const signalMap = new WeakMap<object, SignalMap>();
const effectDeps = new Set<EffectFn>();
const reactiveMap = new WeakMap<object, object>();
const arrayMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
```

### Functions

#### `track(target: object, key: string | symbol)`

Tracks dependencies for reactive properties.

- **Parameters:**
  - `target`: The target object being tracked.
  - `key`: The key on the target object.

#### `trigger(target: object, key: string | symbol)`

Notifies all effects and computed functions that are dependent on a specific target key.

- **Parameters:**
  - `target`: The target object.
  - `key`: The key on the target object.

### Classes

#### `Signal<T>`

Represents a reactive value. Signals can be used to track and respond to changes in state.

- **Constructor:**
  - `value`: The initial value of the signal.
  - `shallow`: A boolean flag indicating whether the signal should be shallow (default: `false`).

- **Methods:**
  - `get value`: Retrieves the current value of the signal.
  - `set value(newValue: T)`: Sets a new value to the signal and triggers updates if the value has changed.
  - `peek()`: Returns the current value of the signal without tracking it.
  - `__triggerObject()`: Triggers reactivity for non-primitive and non-HTMLElement values.

#### `Computed<T>`

Represents a computed reactive value. Computed values automatically update when their dependencies change.

- **Constructor:**
  - `fn`: The function used to compute the value.

- **Methods:**
  - `peek()`: Retrieves the current computed value without tracking it.
  - `run()`: Runs the computed function and updates the value if it has changed.
  - `get value`: Retrieves the current computed value and tracks its usage.

### Utility Functions

#### `useSignal<T>(value?: T): Signal<T>`

Creates a `Signal` object.

- **Parameters:**
  - `value`: The initial value for the signal.
- **Returns:** A `Signal` object.

#### `shallowSignal<T>(value?: T): Signal<T>`

Creates a shallow signal that does not recursively track the value.

- **Parameters:**
  - `value`: The initial value for the signal.
- **Returns:** A shallow `Signal` object.

#### `isSignal<T>(value: any): value is Signal<T>`

Checks if a value is a `Signal`.

- **Parameters:**
  - `value`: The value to check.
- **Returns:** `True` if the value is a `Signal`, otherwise `false`.

#### `useComputed<T>(fn: () => T): Computed<T>`

Creates a `Computed` object.

- **Parameters:**
  - `fn`: The function used to compute the value.
- **Returns:** A `Computed` object.

#### `isComputed<T>(value: any): value is Computed<T>`

Checks if a value is a `Computed` object.

- **Parameters:**
  - `value`: The value to check.
- **Returns:** `True` if the value is a `Computed` object, otherwise `false`.

#### `useEffect(fn: EffectFn): () => void`

Registers an effect function that runs whenever its dependencies change.

- **Parameters:**
  - `fn`: The effect function to register.
- **Returns:** A function to unregister the effect.

#### `signalObject<T extends object>(initialValues: T, exclude?: ExcludeType): SignalObject<T>`

Creates a `SignalObject` from the given initial values, excluding specified keys.

- **Parameters:**
  - `initialValues`: The initial values for the `SignalObject`.
  - `exclude`: A function or array that determines which keys to exclude from the `SignalObject`.
- **Returns:** The created `SignalObject`.

#### `unSignal<T>(signal: SignalObject<T> | T | Signal<T>, exclude?: ExcludeType): T`

Returns the current value of a signal, signal object, or plain object, excluding specified keys.

- **Parameters:**
  - `signal`: The signal, signal object, or plain object to unwrap.
  - `exclude`: A function or array that determines which keys to exclude from the unwrapped object.
- **Returns:** The unwrapped value of the signal, signal object, or plain object.

#### `isReactive(obj: any): boolean`

Checks if an object is reactive.

- **Parameters:**
  - `obj`: The object to check.
- **Returns:** `True` if the object is reactive, otherwise `false`.

#### `unReactive(obj: any): any`

Creates a shallow copy of a reactive object.

- **Parameters:**
  - `obj`: The reactive object to copy.
- **Returns:** A shallow copy of the reactive object.

### Array and Collection Proxies

Functions to initialize proxies for arrays and collections to track their mutations.

#### `initArrayProxy(initialValue: any[])`

Initializes a proxy for an array.

- **Parameters:**
  - `initialValue`: The initial array value.

#### `initCollectionProxy(initialValue: Set<any> | Map<any, any> | WeakSet<any> | WeakMap<any, any>)`

Initializes a proxy for a collection.

- **Parameters:**
  - `initialValue`: The initial collection value.

### Reactive Objects

Functions to create reactive objects.

#### `useReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T`

Creates a reactive object.

- **Parameters:**
  - `initialValue`: The initial value for the reactive object.
  - `exclude`: A function or array that determines which keys to exclude from the reactive object.
- **Returns:** A reactive object.

#### `shallowReactive<T extends object>(initialValue: T, exclude?: ExcludeType): T`

Creates a shallow reactive object.

- **Parameters:**
  - `initialValue`: The initial value for the reactive object.
  - `exclude`: A function or array that determines which keys to exclude from the reactive object.
- **Returns:** A shallow reactive object.

#### `reactive<T extends object>(initialValue: T, exclude?: ExcludeType, shallow?: boolean): T`

Internal function to create a reactive object.

- **Parameters:**
  - `initialValue`: The initial value for the reactive object.
  - `exclude`: A function or array that determines which keys to exclude from the reactive object.
  - `shallow`: If true, only the top-level properties of the object are reactive. Nested objects are not reactive.
- **Returns:** A reactive object.
```

This MDX document provides an overview of the functions and classes used for reactive programming, including their parameters, return values, and descriptions of their purposes.
