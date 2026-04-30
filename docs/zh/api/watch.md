# watch

监听一个或多个响应式数据源的变化，并在变化时执行回调函数。与`effect`不同，`watch`提供了更细粒度的控制，包括获取变化前后的值。

## 基本用法

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

// 监听count的变化
const stop = watch(count, (newValue, oldValue) => {
  console.log(`count从 ${oldValue} 变为 ${newValue}`);
});

count.value = 5;
// 输出: count从 0 变为 5

// 停止监听
stop();

// 不再触发回调
count.value = 10;
```

## 类型定义

```ts
// 监听单个数据源
function watch<T>(
  source: WatchSource<T>,
  callback: (value: T, oldValue: T) => any,
  options?: WatchOptions,
): () => void;

// 监听多个数据源
function watch<T extends Readonly<WatchSource<unknown>[] | object>>(
  sources: T,
  callback: (values: MapSources<T>, oldValues: MapSources<T>) => any,
  options?: WatchOptions,
): () => void;

// 监听选项
interface WatchOptions {
  // 是否立即执行一次回调
  immediate?: boolean;
  // 是否深度监听
  deep?: boolean | number;
}

// 可监听的数据源类型
type WatchSource<T> = Signal<T> | Computed<T> | (() => T);
```

## 参数

| 参数 | 类型 | 描述 |
|------|------|------|
| source | `WatchSource<T>` \| `WatchSource<T>[]` \| `object` | 要监听的数据源 |
| callback | `(newValue, oldValue) => any` | 数据源变化时执行的回调函数 |
| options | `WatchOptions` | 可选的配置选项 |

### options

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| immediate | `boolean` | `false` | 是否在创建观察者时立即执行一次回调 |
| deep | `boolean \| number` | `false` | 是否深度监听对象内部变化。也可指定监听深度 |

## 返回值

返回一个停止监听的函数，调用它会停止观察者的工作。

## 示例

### 监听单个信号

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

watch(count, (newCount, oldCount) => {
  console.log(`计数从 ${oldCount} 变为 ${newCount}`);
});

count.value++;
// 输出: 计数从 0 变为 1
```

### 监听计算属性

```ts
import { computed, signal, watch } from '@estjs/signals';

const count = signal(0);
const doubled = computed(() => count.value * 2);

watch(doubled, (newValue, oldValue) => {
  console.log(`双倍值从 ${oldValue} 变为 ${newValue}`);
});

count.value = 2;
// 输出: 双倍值从 0 变为 4
```

### 监听多个数据源

```ts
import { signal, watch } from '@estjs/signals';

const firstName = signal('张');
const lastName = signal('三');

watch([firstName, lastName], ([newFirst, newLast], [oldFirst, oldLast]) => {
  console.log(`姓从 "${oldFirst}" 变为 "${newFirst}"`);
  console.log(`名从 "${oldLast}" 变为 "${newLast}"`);
});

firstName.value = '李';
// 输出: 姓从 "张" 变为 "李"
// 输出: 名从 "三" 变为 "三"
```

### 监听响应式对象

```ts
import { reactive, watch } from '@estjs/signals';

const user = reactive({ name: '张三', age: 30 });

watch(user, (newUser, oldUser) => {
  console.log('用户变化:', newUser, oldUser);
});

user.age = 31;
// 输出: 用户变化: { name: '张三', age: 31 } { name: '张三', age: 30 }
```

### 使用getter函数

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

// 使用getter函数可以监听推导值
watch(
  () => count.value * 2,
  (newValue, oldValue) => {
    console.log(`双倍值从 ${oldValue} 变为 ${newValue}`);
  },
);

count.value = 2;
// 输出: 双倍值从 0 变为 4
```

### 深度监听

```ts
import { signal, watch } from '@estjs/signals';

const user = signal({
  name: '张三',
  profile: {
    age: 30,
    address: { city: '北京' },
  },
});

// 不使用deep选项，只有当整个user对象被替换时才会触发
watch(user, () => {
  console.log('用户对象被替换');
});

// 使用deep选项，可以监听嵌套属性的变化
watch(
  user,
  () => {
    console.log(`用户城市变为: ${user.value.profile.address.city}`);
  },
  { deep: true },
);

// 不会触发第一个watch，但会触发第二个watch
user.value.profile.address.city = '上海';
// 输出: 用户城市变为: 上海

// 限制深度监听到特定层级
watch(
  user,
  () => {
    console.log('用户个人资料变化');
  },
  { deep: 2 }, // 只监听到profile这一层
);
```

### 立即执行回调

```ts
import { signal, watch } from '@estjs/signals';

const count = signal(0);

watch(
  count,
  (newValue, oldValue) => {
    console.log(`计数当前值: ${newValue}, 旧值: ${oldValue}`);
  },
  { immediate: true },
);
// 输出: 计数当前值: 0, 旧值: undefined
```

## 与effect的区别

`watch`和`effect`的主要区别：

1. **回调参数**：`watch`提供新值和旧值，而`effect`不提供
2. **执行时机**：`watch`默认是懒执行的，只有当依赖变化时才执行；而`effect`在创建时就会执行一次
3. **控制粒度**：`watch`允许更精细的控制，如深度监听和立即执行选项
4. **数据源规范**：`watch`需要明确指定监听的数据源，而`effect`会自动收集内部使用的所有响应式数据

```ts
// 使用effect
effect(() => {
  console.log(`当前计数: ${count.value}`);
});

// 等效的watch写法
watch(count, newValue => {
  console.log(`当前计数: ${newValue}`);
});
```

## 工作原理

`watch`内部使用`effect`实现依赖追踪，但增加了以下功能：

1. 保存旧值以便在回调中提供
2. 仅在依赖变化时执行回调，而不是在创建时
3. 提供更多选项如深度监听和立即执行

## 性能考虑

1. **避免在回调中进行昂贵操作**：如果需要进行复杂计算，考虑使用防抖或节流
2. **注意深度监听的性能影响**：深度监听会递归遍历对象，对于大型对象可能影响性能
3. **及时清理**：当不再需要监听时，调用返回的停止函数以释放资源

## 注意事项

1. **避免在回调中修改被监听的数据**：这可能导致无限循环
2. **回调执行是同步的**：回调函数会在数据变化时立即同步执行
3. **监听复杂对象时使用深度监听**：对于嵌套对象的属性变化，需要开启深度监听才能检测
