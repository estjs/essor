# ref

Creates a special type of signal used primarily for DOM element references. Also documents the ref utilities `isRef`, `unref`, `toRef`, and `toRefs`.

## Basic Usage

```ts
import { ref } from '@estjs/signals';

// Create a ref (typically for a DOM element reference)
const divRef = ref();

// Use it in JSX — the element is assigned to divRef.value on mount
<div ref={divRef}></div>;

// Create a ref with an initial value
const count = ref(0);
console.log(count.value); // 0
count.value = 1;
```

## Relationship with Signal

`Ref<T>` extends `Signal<T>`, so a ref supports everything a signal does: reading `.value` tracks dependencies, writing `.value` notifies subscribers, and `peek()`, `set()`, and `update()` are all available.

The key difference: **refs do not create reactive proxies for object values**. A `signal({ a: 1 })` wraps the object in a deep reactive proxy so nested mutations are tracked; a `ref({ a: 1 })` stores the object as-is and only tracks replacement of `.value` itself. This makes refs ideal for holding DOM elements and other objects that must not be proxied.

```ts
import { ref, signal } from '@estjs/signals';

const sig = signal({ count: 0 });
sig.value.count = 1; // tracked (deep reactive proxy)

const r = ref({ count: 0 });
r.value.count = 1;   // NOT tracked (raw object, no proxy)
r.value = { count: 1 }; // tracked (value replacement)
```

Two normalization rules apply when creating or writing to a ref:

- `ref(existingRef)` returns the same ref instead of nesting.
- Assigning a signal or ref to `.value` stores its unwrapped current value, not the wrapper itself.

For checking whether a value is a shallow reactive object, see `isShallow` in [reactive](./reactive.md).

## isRef

Type guard that checks whether a value is a `Ref` instance.

```ts
import { isRef, isSignal, ref, signal } from '@estjs/signals';

const r = ref(0);
const s = signal(0);

console.log(isRef(r)); // true
console.log(isRef(s)); // false — signals are not refs
console.log(isSignal(r)); // note: refs are built on the signal implementation
console.log(isRef({ value: 0 })); // false
```

## unref

Unwraps a signal, computed, ref, or getter function to its raw value:

- Signal / Computed / Ref → returns `.value`
- Getter function → calls it and returns the result
- Plain value → returns as-is

```ts
import { computed, ref, signal, unref } from '@estjs/signals';

const count = signal(5);

unref(count);              // 5
unref(ref(10));            // 10
unref(computed(() => 2));  // 2
unref(() => count.value);  // 5 (getter is invoked)
unref(5);                  // 5 (plain value passes through)
```

`unref` is useful when writing functions that accept either a raw value or a reactive wrapper:

```ts
function useTitle(title: string | Signal<string>) {
  document.title = unref(title);
}
```

## toRef

Creates a writable computed ref that proxies a single property of a reactive object. Changes propagate both ways — reading the ref reads from the object, writing to the ref writes back to the object.

```ts
import { reactive, toRef } from '@estjs/signals';

const state = reactive({ count: 0, name: 'Alice' });

const countRef = toRef(state, 'count');
countRef.value;      // 0
countRef.value = 5;  // writes back: state.count === 5

state.count = 10;
countRef.value;      // 10 — always reflects the source object
```

An optional third argument provides a default value used when the property is `undefined`:

```ts
const state = reactive<{ label?: string }>({});
const label = toRef(state, 'label', 'untitled');
label.value; // 'untitled'
```

The return type is `Computed<T[K]>`, and it also supports `peek()` for reading without tracking. Although the `Computed` interface declares `value` as read-only, the object returned by `toRef` is writable at runtime — assignments are forwarded to the source object.

## toRefs

Converts a reactive object into a plain object where every property is wrapped in a writable computed ref (each one created via `toRef`). This enables destructuring reactive state without losing reactivity:

```ts
import { effect, reactive, toRefs } from '@estjs/signals';

const state = reactive({ x: 1, y: 2 });

// Destructuring `state` directly would break reactivity.
// toRefs keeps each property connected to the source object:
const { x, y } = toRefs(state);

effect(() => {
  console.log(`x = ${x.value}`);
});

x.value = 10;  // state.x === 10, effect re-runs
state.x = 20;  // x.value === 20
```

A common pattern is returning reactive state from a composable function:

```ts
function useMouse() {
  const pos = reactive({ x: 0, y: 0 });
  // ...update pos on mousemove...
  return toRefs(pos); // consumers can destructure safely
}

const { x, y } = useMouse();
```

Note: `toRefs` only wraps the properties that exist on the object at call time (it iterates `Object.keys`). Properties added later are not included.

## Considerations

1. **Use `ref` for DOM elements**: this is the primary purpose of `ref` in Essor — bind it via the JSX `ref` attribute and read `.value` after mount.
2. **Refs are shallow for objects**: mutations inside an object stored in a ref are not tracked; replace `.value` to trigger updates, or use `signal` / `reactive` for deep reactivity.
3. **`toRef` / `toRefs` require a reactive source**: they proxy property access on the given object, so reactivity only works when the source is a `reactive()` object (or another tracked target).
4. **`unref` invokes getter functions**: unlike some frameworks, passing a function to `unref` calls it — do not pass functions you don't want executed.

## Type Definitions

```ts
function ref<T>(value?: T): Ref<T>;

function isRef<T>(value: unknown): value is Ref<T>;

function unref<T>(
  value: T,
): T extends { value: infer V } ? V : T extends (...args: any[]) => infer R ? R : T;

function toRef<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  defaultValue?: T[K],
): Computed<T[K]>;

function toRefs<T extends object>(obj: T): { [K in keyof T]: Computed<T[K]> };

interface Ref<T> extends Signal<T> {
  value: T;
}

interface Computed<T> {
  readonly value: T;
  peek(): T;
}
```
