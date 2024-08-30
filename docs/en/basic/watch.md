### `useWatch`

#### Overview
The `useWatch` function allows you to observe changes in reactive sources such as signals, computed properties, reactive objects, or arrays of these sources. When the observed source changes, the provided callback is triggered. This function is highly configurable, with options for immediate execution and deep watching of nested structures.

#### Usage

##### Watching a Single Source
```typescript
import { useSignal } from './signal';
import { useWatch } from './watch';

const count = useSignal(0);

useWatch(count, (newVal, oldVal) => {
  console.log(`Count changed from ${oldVal} to ${newVal}`);
});
```

##### Watching Multiple Sources
```typescript
import { useSignal } from './signal';
import { useWatch } from './watch';

const count = useSignal(0);
const name = useSignal('Alice');

useWatch([count, name], ([newCount, newName], [oldCount, oldName]) => {
  console.log(`Count changed from ${oldCount} to ${newCount}`);
  console.log(`Name changed from ${oldName} to ${newName}`);
});
```

##### Watching a Reactive Object
```typescript
import { useReactive } from './signal';
import { useWatch } from './watch';

const state = useReactive({
  count: 0,
  name: 'Alice',
});

useWatch(state, (newState, oldState) => {
  console.log(`State changed from`, oldState, `to`, newState);
}, { deep: true });
```


#### Parameters
- **`source`**: The source to watch. This can be a signal, computed property, function, reactive object, or an array of these sources.
- **`cb`**: The callback function that gets triggered when the source changes. It receives the new value and the old value as arguments.
- **`options`** *(optional)*: An object to configure the watcher:
  - **`immediate`**: If `true`, the callback is called immediately with the current value.
  - **`deep`**: If `true`, enables deep watching for nested properties.
  - **`flush`**: Specifies when the watcher callback should be triggered during the component lifecycle (`'sync'`, `'pre'`, or `'post'`).

#### Return Value
- **`WatchStopHandle`**: A function that stops watching when called.

---
