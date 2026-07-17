# reactive

创建一个响应式对象，使对象的属性变化可被自动追踪。与`signal`不同，响应式对象不需要使用`.value`访问，可以直接操作属性。

## 基本用法

```ts
import { effect, reactive } from '@estjs/signals';

// 创建一个响应式对象
const user = reactive({ name: '张三', age: 30 });

// 直接访问和修改属性
console.log(user.name); // '张三'
user.age = 31;

// 在副作用中使用
effect(() => {
  console.log(`${user.name} 今年 ${user.age} 岁`);
});
// 输出: 张三 今年 31 岁

// 修改属性会触发副作用
user.name = '李四';
// 输出: 李四 今年 31 岁
```

## 类型定义

```ts
function reactive<T extends object>(target: T): T;
function shallowReactive<T extends object>(target: T): T;
function isReactive<T extends object>(target: T): boolean;
function toRaw<T>(value: T): T;
```

## 参数

| 函数 | 参数 | 类型 | 描述 |
|------|------|------|------|
| reactive | target | `T extends object` | 要转换为响应式的目标对象 |
| shallowReactive | target | `T extends object` | 要转换为浅层响应式的目标对象 |
| isReactive | target | `T extends object` | 要检查是否为响应式的对象 |
| toRaw | value | `T` | 要获取原始对象的响应式对象 |

## 返回值

- **reactive**: 返回一个代理对象，该对象的所有属性（包括嵌套属性）都是响应式的
- **shallowReactive**: 返回一个代理对象，只有顶层属性是响应式的
- **isReactive**: 如果对象是响应式的，返回`true`，否则返回`false`
- **toRaw**: 返回原始对象，如果输入不是响应式对象，则返回原样

## 示例

### 基本使用

```ts
import { effect, reactive } from '@estjs/signals';

const user = reactive({
  name: '张三',
  age: 30,
  address: {
    city: '北京',
    street: '长安街',
  },
});

effect(() => {
  console.log(`${user.name} 住在 ${user.address.city}`);
});
// 输出: 张三 住在 北京

// 修改嵌套属性仍然会触发副作用
user.address.city = '上海';
// 输出: 张三 住在 上海
```

### 响应式数组

```ts
import { effect, reactive } from '@estjs/signals';

const numbers = reactive([1, 2, 3]);

effect(() => {
  console.log(`数组内容: ${numbers.join(', ')}`);
});
// 输出: 数组内容: 1, 2, 3

// 添加新元素会触发副作用
numbers.push(4);
// 输出: 数组内容: 1, 2, 3, 4

// 修改元素会触发副作用
numbers[0] = 10;
// 输出: 数组内容: 10, 2, 3, 4

// 数组方法也会触发副作用
numbers.reverse();
// 输出: 数组内容: 4, 3, 2, 10
```

### 浅层响应式对象

```ts
import { effect, shallowReactive } from '@estjs/signals';

const user = shallowReactive({
  name: '张三',
  age: 30,
  profile: {
    city: '北京',
  },
});

effect(() => {
  console.log(`${user.name}, ${user.profile.city}`);
});
// 输出: 张三, 北京

// 修改顶层属性会触发副作用
user.name = '李四';
// 输出: 李四, 北京

// 修改嵌套对象的属性不会触发副作用
user.profile.city = '上海';
// 无输出
```

### 检查一个对象是否是响应式的

```ts
import { isReactive, reactive } from '@estjs/signals';

const original = { count: 0 };
const reactiveObj = reactive(original);

console.log(isReactive(original)); // false
console.log(isReactive(reactiveObj)); // true
```

### 获取响应式对象的原始对象

```ts
import { reactive, toRaw } from '@estjs/signals';

const original = { count: 0 };
const reactiveObj = reactive(original);

// 修改响应式对象会触发副作用
reactiveObj.count++;

// 获取原始对象
const rawObj = toRaw(reactiveObj);
console.log(rawObj === original); // true

// 修改原始对象不会触发副作用
rawObj.count++;
```

### 复杂集合类型

响应式系统支持`Map`、`Set`、`WeakMap`和`WeakSet`：

```ts
import { effect, reactive } from '@estjs/signals';

// 响应式Map
const map = reactive(new Map());
effect(() => {
  console.log(`Map大小: ${map.size}`);
});
// 输出: Map大小: 0

map.set('key', 'value');
// 输出: Map大小: 1

// 响应式Set
const set = reactive(new Set());
effect(() => {
  console.log(`Set包含'item': ${set.has('item')}`);
});
// 输出: Set包含'item': false

set.add('item');
// 输出: Set包含'item': true
```

## 响应式转换规则

不同类型的对象在转换为响应式时遵循以下规则：

| 数据类型 | 响应式行为 |
|---------|-----------|
| 普通对象 | 所有属性都是响应式的，包括嵌套对象 |
| 数组 | 响应式支持数组的所有方法和下标访问 |
| Map/Set | 集合方法如`set`、`add`、`delete`等都会触发响应式更新 |
| 原始类型 | 不支持直接转换，应该使用`signal` |
| 已是响应式 | 直接返回，不会重复转换 |

## 与signal的异同

### 何时使用reactive

- 适合复杂的对象结构，尤其是深层嵌套的对象
- 当你希望使用更自然的对象访问语法，不需要`.value`
- 处理集合类型如`Map`和`Set`

### 何时使用signal

- 处理原始值（数字、字符串、布尔）
- 当你需要明确数据变更的界限
- 当你想更精细地控制依赖追踪

## 性能考虑

1. **避免大型响应式对象**：过大的对象会增加代理转换的开销
2. **使用toRaw进行非响应式操作**：对于不需要触发更新的操作
3. **shallowReactive用于性能优化**：当只需要顶层响应式时

## 注意事项

1. **无法直接添加新的顶层属性**：
```ts
const user = reactive({});
user.name = '张三'; // 可能不会触发依赖更新
```

2. **解决方案：使用展开运算符赋值新对象**：
```ts
user = { ...user, name: '张三' };
```

3. **响应式对象的解构会丢失响应性**：
```ts
const user = reactive({ name: '张三', age: 30 });
const { name, age } = user; // name和age不再是响应式的
```

4. **解构响应式对象的替代方案**：
```ts
const user = reactive({ name: '张三', age: 30 });

// 使用计算属性保持响应性
const name = computed(() => user.name);
const age = computed(() => user.age);
```

## 进阶

以下 API 是面向高级场景、调试与测试的底层工具，大多数应用代码永远不需要它们。

### untrack

在不收集任何响应式依赖的情况下运行函数。回调内部的读取**不会**让外层的 `effect`/`computed` 订阅这些数据源：

```ts
import { effect, reactive, untrack } from '@estjs/signals';

const state = reactive({ tracked: 0, ignored: 0 });

effect(() => {
  // 建立对 `state.tracked` 的依赖
  const t = state.tracked;

  // untrack 内的读取不会建立依赖
  const i = untrack(() => state.ignored);

  console.log(`tracked=${t}, ignored=${i}`);
});
// 输出: tracked=0, ignored=0

state.ignored = 100; // 无输出——effect 从未订阅 `ignored`
state.tracked = 1;   // 输出: tracked=1, ignored=100
```

`untrack` 会返回回调的返回值，并且即使回调抛出异常也会恢复先前的追踪上下文。

### trigger

手动通知某个 `target`/`key` 的所有订阅者。这是一个**调试与高级逃生舱** API——响应式 proxy 会在每次变更时自动调用它，正常代码不需要使用。它的典型用途是：绕过 proxy 直接修改了原始对象（例如通过 `toRaw`）之后，需要手动触发对应的副作用：

```ts
import { effect, reactive, toRaw, trigger } from '@estjs/signals';

const state = reactive<Record<string, number>>({ a: 1 });

effect(() => {
  console.log('keys:', Object.keys(state).join(','));
});
// 输出: keys: a

// 在原始对象上新增 key 绕过了 proxy——不会触发副作用
toRaw(state).b = 2;

// 手动通知订阅者：新增了一个 key
trigger(toRaw(state), 'ADD', 'b', 2);
// 输出: keys: a,b
```

`type` 参数描述变更类型（`'SET'`、`'ADD'`、`'DELETE'`、`'CLEAR'`）。对于 `'ADD'`、`'DELETE'`、`'CLEAR'`，依赖迭代的副作用（例如读取 `Object.keys`、数组 length、`Map.size` 的副作用）也会被通知。`key` 可以是单个键，也可以是键数组，用于在一轮去重派发中通知多个依赖。

### toReactive

如果传入值是对象，则返回其响应式 proxy；否则原样返回。适合规范化"可能是对象、也可能不是"的值：

```ts
import { isReactive, toReactive } from '@estjs/signals';

const obj = toReactive({ count: 0 });
console.log(isReactive(obj)); // true

const num = toReactive(42);
console.log(num); // 42 —— 原始值原样返回
```

### getTargetDepSize

统计响应式对象某个属性上处于活跃状态的副作用订阅者数量。主要面向**测试**，用于断言副作用被正确清理。参数可以传响应式 proxy，也可以传原始对象：

```ts
import { effect, getTargetDepSize, reactive } from '@estjs/signals';

const state = reactive({ count: 0 });

console.log(getTargetDepSize(state, 'count')); // 0

const runner = effect(() => {
  state.count; // 订阅 `count`
});

console.log(getTargetDepSize(state, 'count')); // 1

runner.stop();
console.log(getTargetDepSize(state, 'count')); // 0 —— 订阅者已清理
```

### 类型定义

```ts
function untrack<T>(fn: () => T): T;

function trigger(
  target: object,
  type: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
): void;

function toReactive<T>(value: T): T;

function getTargetDepSize(target: object, key: string | symbol): number;
```
