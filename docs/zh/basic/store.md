### `createStore`

#### 概述
`createStore` 函数用于创建一个可复用的状态管理仓库。仓库包括响应式状态 (`state`)、计算属性 (`getters`)、以及可以改变状态的动作 (`actions`)。你可以使用 `createStore` 生成一个新仓库并通过返回的函数获取该仓库实例。

#### 用法

##### 创建简单的状态仓库
```typescript
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
      this.state.count++;
    },
  },
});

const store = useCounterStore();

console.log(store.state.count); // 0
store.increment();
console.log(store.state.count); // 1
console.log(store.doubleCount); // 2
```


#### 参数
- **`options`**：一个对象，定义了仓库的初始状态、计算属性和动作。
  - **`state`**：仓库的初始状态。
  - **`getters`** *(可选)*：用于计算基于状态的属性。
  - **`actions`** *(可选)*：用于改变状态的函数。

#### 返回值
- **`function`**：一个函数，用于获取仓库实例。



#### 动作
- **`patch$`**：更新状态的多个属性。
- **`subscribe$`**：订阅状态变化。
- **`unsubscribe$`**：取消订阅状态变化。
- **`onAction$`**：订阅所有动作的执行。
- **`reset$`**：重置状态到初始值。

