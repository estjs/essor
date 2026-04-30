# createStore

创建一个基于信号系统的响应式状态管理器，用于集中管理和共享状态。

## 基本用法

```ts
import { createStore } from '@estjs/signals';

// 定义状态存储
const useCounter = createStore({
  // 状态
  state: {
    count: 0,
    history: [] as number[],
  },

  // 计算属性
  getters: {
    doubleCount: state => state.count * 2,
    total: state => state.history.reduce((sum, val) => sum + val, 0),
  },

  // 操作方法
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

// 使用存储
const counter = useCounter();

// 访问状态
console.log(counter.count); // 0
console.log(counter.doubleCount); // 0

// 调用操作
counter.increment();
console.log(counter.count); // 1
console.log(counter.doubleCount); // 2
console.log(counter.history); // [1]
```

## 类型定义

```ts
// 创建存储函数
function createStore<S extends State, G extends Getters<S>, A extends Actions>(
  storeDefinition: StoreDefinition<S, G, A>,
): () => S & GetterValues<G> & A & StoreActions<S> & { state: S };

// 存储定义（两种方式）
type StoreDefinition<S extends State, G extends Getters<S>, A extends Actions> =
  | (new () => S) // 类方式
  | {
      // 对象方式
      state: S;
      getters?: G;
      actions?: A;
    };

// 内置的存储操作
interface StoreActions<S extends State> {
  patch$(payload: Partial<S>): void;
  subscribe$(callback: (state: S) => void): void;
  unsubscribe$(callback: (state: S) => void): void;
  onAction$(callback: (state: S) => void): void;
  reset$(): void;
}
```

## 参数

| 参数 | 类型 | 描述 |
|------|------|------|
| storeDefinition | `StoreDefinition<S, G, A>` | 存储定义，可以是一个类或者一个包含state、getters和actions的对象 |

## 返回值

返回一个函数，调用它会创建一个包含状态、getter和action的存储实例。

## 示例

### 基于对象的存储

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

### 基于类的存储

```ts
import { createStore } from '@estjs/signals';

// 使用类定义存储
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

### 访问原始状态

```ts
import { createStore } from '@estjs/signals';

const useUser = createStore({
  state: {
    firstName: '张',
    lastName: '三',
  },
  getters: {
    fullName: state => `${state.firstName}${state.lastName}`,
  },
});

const user = useUser();

// 直接通过state属性访问原始状态对象
console.log(user.state.firstName); // '张'
console.log(user.state.lastName); // '三'

// 也可以直接访问顶层属性
console.log(user.firstName); // '张'
console.log(user.lastName); // '三'
console.log(user.fullName); // '张三'
```

### 使用内置的patch$方法

```ts
import { createStore } from '@estjs/signals';

const useUser = createStore({
  state: {
    name: '张三',
    age: 30,
    address: {
      city: '北京',
      street: '长安街',
    },
  },
});

const user = useUser();

// 使用patch$方法批量更新多个属性
user.patch$({
  name: '李四',
  age: 25,
  address: {
    ...user.address,
    city: '上海',
  },
});

console.log(user.name); // '李四'
console.log(user.age); // 25
console.log(user.address.city); // '上海'
```

### 订阅状态变化

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

// 订阅状态变化
const unsubscribe = counter.subscribe$(state => {
  console.log(`计数变为: ${state.count}`);
});

counter.increment();
// 输出: 计数变为: 1

counter.patch$({ count: 5 });
// 输出: 计数变为: 5

// 取消订阅
unsubscribe();

counter.increment();
// 没有输出
```

### 订阅操作执行

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

// 订阅操作执行
counter.onAction$(state => {
  console.log(`操作执行后的计数: ${state.count}`);
});

counter.increment();
// 输出: 操作执行后的计数: 1

counter.decrement();
// 输出: 操作执行后的计数: 0
```

### 重置状态

```ts
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: { count: 0 },
});

const counter = useCounter();

// 修改状态
counter.count = 10;
console.log(counter.count); // 10

// 重置为初始状态
counter.reset$();
console.log(counter.count); // 0
```

## 内置方法

所有由`createStore`创建的存储都包含以下内置方法：

### patch$

更新多个状态属性并触发一次更新。

```ts
store.patch$({ key1: value1, key2: value2 });
```

### subscribe$

订阅状态变化。

```ts
const unsubscribe = store.subscribe$(state => {
  console.log('状态变化:', state);
});

// 取消订阅
unsubscribe();
```

### unsubscribe$

取消状态变化的订阅。

```ts
const callback = state => console.log('状态变化:', state);
store.subscribe$(callback);
store.unsubscribe$(callback);
```

### onAction$

订阅操作执行。

```ts
store.onAction$(state => {
  console.log('操作执行:', state);
});
```

### reset$

重置状态到初始值。

```ts
store.reset$();
```

## 与组件框架集成

### 在Vue中使用

```vue
<script setup>
import { createStore } from '@estjs/signals';

const useCounter = createStore({
  state: { count: 0 },
  actions: {
    increment() {
      this.count++;
    }
  }
});

const counter = useCounter();
</script>

<template>
  <div>
    <p>计数: {{ counter.count }}</p>
    <button @click="counter.increment">
      +1
    </button>
  </div>
</template>
```

### 在React中使用

```jsx
import { createStore } from '@estjs/signals';
import { useEffect, useState } from 'react';

// 创建存储
const useGlobalCounter = createStore({
  state: { count: 0 },
  actions: {
    increment() {
      this.count++;
    },
  },
});

// 在组件中使用
function Counter() {
  const counter = useGlobalCounter();
  const [count, setCount] = useState(counter.count);

  useEffect(() => {
    // 订阅变化
    const unsubscribe = counter.subscribe$(state => {
      setCount(state.count);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div>
      <p>计数: {count}</p>
      <button onClick={() => counter.increment()}>+1</button>
    </div>
  );
}
```

## 性能考虑

1. **避免过大的状态对象**：拆分为多个专注的存储
2. **使用getter缓存计算值**：避免在渲染期间重复计算
3. **使用patch$批量更新**：减少状态更新次数

## 注意事项

1. **避免循环依赖**：不同存储之间避免循环引用
2. **使用immutable更新模式**：避免直接修改嵌套对象
```ts
// 错误
user.address.city = '上海';

// 正确
user.patch$({
  address: {
    ...user.address,
    city: '上海',
  },
});
```

3. **生命周期管理**：使用完成后取消订阅，避免内存泄漏
```
