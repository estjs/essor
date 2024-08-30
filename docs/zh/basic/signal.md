

### `useSignal`

#### 概述

`useSignal` 是一个用于创建响应式信号的函数。信号是一个可以被监控的状态单元，当信号的值发生变化时，依赖该信号的计算属性和副作用会自动更新。

#### 用法

```typescript
import { useSignal } from './signal';

const count = useSignal(0);
console.log(count.value); // 0

count.value = 5;
console.log(count.value); // 5
```

#### 参数

- **`initialValue`**：信号的初始值。

#### 返回值

- **`Signal`**：一个包含响应式 `value` 属性的对象。

---

## `shallowSignal`

#### 概述

`shallowSignal` 是一个用于创建浅层响应式信号的函数。它与 `useSignal` 类似，但不会监听信号的嵌套属性。

#### 用法

```typescript
import { shallowSignal } from './signal';

const count = shallowSignal(0);
console.log(count.value); // 0

count.value = 5;
console.log(count.value); // 5


const value = shallowSignal({ count: { value: 0 } });
console.log(value.value.count.value); // 0

value.value.count.value = 5;
console.log(value.value.count.value); // 5  不会触发effect
```

#### 参数

- **`initialValue`**：信号的初始值。

#### 返回值

- **`Signal`**：一个包含响应式 `value` 属性的对象。

### `useEffect`

#### 概述

`useEffect` 函数允许你在某个信号或计算属性发生变化时执行副作用。它是用于在响应式系统中执行具有副作用操作的关键工具。

#### 用法

```typescript
import { useEffect, useSignal } from './signal';

const count = useSignal(0);

useEffect(() => {
  console.log(`计数变化为: ${count.value}`);
});

count.value = 1; // 控制台输出: 计数变化为: 1
```

#### 参数

- **`effect`**：在响应式数据变化时执行的副作用函数。

#### 返回值

- **`WatchStopHandle`**：一个函数，用于停止该副作用。

---

### `useComputed`

#### 概述

`useComputed` 函数用于创建一个基于其他信号或响应式状态的计算属性。计算属性会自动依赖其使用的信号或响应式状态，并在这些依赖变化时自动更新。

#### 用法

```typescript
import { useComputed, useSignal } from './signal';

const count = useSignal(2);
const doubleCount = useComputed(() => count.value * 2);

console.log(doubleCount.value); // 4

count.value = 3;
console.log(doubleCount.value); // 6
```

#### 参数

- **`getter`**：返回计算值的函数，该函数内部可以使用其他信号或响应式状态。

#### 返回值

- **`Computed`**：一个包含响应式 `value` 属性的计算属性对象。

---

### `signalObject`

#### 概述

`signalObject` 是一个用于将普通对象转换为包含响应式信号对象的工具。转换后的对象的每个属性都是一个信号，允许对属性值的更改进行监控。

#### 用法

```typescript
import { signalObject } from './signal';

const state = signalObject({ count: 0, name: 'Alice' });

console.log(state.count.value); // 0
state.count.value = 5;
console.log(state.count.value); // 5
```

#### 参数

- **`obj`**：要转换的普通对象。

#### 返回值

- **`object`**：一个与输入对象形状相同，但属性为信号的对象。

---

### `isSignal`

#### 概述

`isSignal` 函数用于检查某个对象是否为信号。这在动态处理数据时，尤其是需要确保某些值是响应式的情况下很有用。

#### 用法

```typescript
import { isSignal, useSignal } from './signal';

const count = useSignal(0);

console.log(isSignal(count)); // true
console.log(isSignal(42)); // false
```

#### 参数

- **`value`**：要检查的值。

#### 返回值

- **`boolean`**：如果值是信号，返回 `true`，否则返回 `false`。

---

## `unSignal`

#### 概述

`unSignal` 函数用于将一个信号转换为普通值。如果是普通值，则直接返回

#### 用法

```typescript
import { unSignal } from './signal';

const count = useSignal(0);

console.log(unSignal(count)); // 0
```

#### 参数

- **`signal`**：要转换的信号。

#### 返回值

- **`value`**： 信号的值。

---

## `useReactive`

#### 概述

`useReactive` 函数用于创建一个响应式对象。只期望接收对象，不是基本数据类型。

#### 用法

```typescript
import { useReactive } from './signal';

const state = useReactive({ count: 0 });

console.log(state.count); // 0

state.count = 1;
console.log(state.count); // 1
```

#### 参数

- **`initialValue`**：初始值。
- **`exclude`**：要排除的属性。

#### 返回值

- **`object`**：一个响应式对象。

---

## `isReactive`

#### 概述

`isReactive` 函数用于检查一个对象是否为响应式对象。

#### 用法

```typescript
import { isReactive, useReactive } from './signal';

const state = useReactive({ count: 0 });

console.log(isReactive(state)); // true
console.log(isReactive({})); // false
```

#### 参数

- **`value`**：要检查的值。

#### 返回值

- **`boolean`**：如果是响应式对象，则返回 `true`，否则返回 `false`。

---

## `shallowReactive`

#### 概述

`shallowReactive` 函数用于创建一个浅层响应式对象。

#### 用法

```typescript
import { shallowReactive } from './signal';

const state = shallowReactive({ count: {value:0}});

console.log(state.count.value); // 0
state.count.value = 5;  // 不会触发effect和响应式的更新
console.log(state.count.value); // 5
```

#### 参数

- **`obj`**：要转换的普通对象。

#### 返回值

- **`object`**：一个与输入对象形状相同，但属性为信号的对象。

---
