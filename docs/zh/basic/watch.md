### `useWatch`

#### 概述
`useWatch` 函数允许你监听响应式源的变化，如信号 (`Signal`)、计算属性 (`Computed`)、响应式对象或这些源的数组。当被监听的源发生变化时，会触发提供的回调函数。该函数高度可配置，支持立即执行和深度监听嵌套结构的变化。

#### 用法

##### 监听单个源
```typescript
import { signal } from './signal';
import { useWatch } from './watch';

const count = signal(0);

useWatch(count, (newVal, oldVal) => {
  console.log(`计数从 ${oldVal} 变为 ${newVal}`);
});
```

##### 监听多个源
```typescript
import { signal } from './signal';
import { useWatch } from './watch';

const count = signal(0);
const name = signal('Alice');

useWatch([count, name], ([newCount, newName], [oldCount, oldName]) => {
  console.log(`计数从 ${oldCount} 变为 ${newCount}`);
  console.log(`名字从 ${oldName} 变为 ${newName}`);
});
```

##### 监听响应式对象
```typescript
import { reactive } from './signal';
import { useWatch } from './watch';

const state = reactive({
  count: 0,
  name: 'Alice',
});

useWatch(state, (newState, oldState) => {
  console.log(`状态从`, oldState, `变为`, newState);
}, { deep: true });
```



#### 参数
- **`source`**：要监听的源。可以是信号 (`Signal`)、计算属性 (`Computed`)、函数、响应式对象或这些源的数组。
- **`cb`**：当源发生变化时触发的回调函数。它接收新值和旧值作为参数。
- **`options`** *(可选)*：配置监听行为的选项对象：
  - **`immediate`**：如果为 `true`，则回调函数会立即使用当前值调用。
  - **`deep`**：如果为 `true`，则启用深度监听，检测嵌套属性的变化。
  - **`flush`**：指定回调函数在组件生命周期中的触发时机（`'sync'`、`'pre'` 或 `'post'`）。

#### 返回值
- **`WatchStopHandle`**：一个停止监听的函数，当调用它时，停止对源的监听。

