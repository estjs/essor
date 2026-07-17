# ref

创建一种特殊类型的 signal，主要用于 DOM 元素引用。本文同时文档化 ref 相关工具函数 `isRef`、`unref`、`toRef` 与 `toRefs`。

## 基本用法

```ts
import { ref } from '@estjs/signals';

// 创建一个 ref（通常用于 DOM 元素引用）
const divRef = ref();

// 在 JSX 中使用——挂载时元素会被赋值到 divRef.value
<div ref={divRef}></div>;

// 创建带初始值的 ref
const count = ref(0);
console.log(count.value); // 0
count.value = 1;
```

## 与 Signal 的关系

`Ref<T>` 继承自 `Signal<T>`，因此 ref 支持 signal 的全部能力：读取 `.value` 会追踪依赖，写入 `.value` 会通知订阅者，`peek()`、`set()`、`update()` 均可使用。

关键区别在于：**ref 不会为对象值创建响应式代理**。`signal({ a: 1 })` 会把对象包装为深层响应式代理，从而追踪嵌套修改；而 `ref({ a: 1 })` 按原样存储对象，只追踪对 `.value` 本身的整体替换。这使得 ref 非常适合持有 DOM 元素等不应被代理的对象。

```ts
import { ref, signal } from '@estjs/signals';

const sig = signal({ count: 0 });
sig.value.count = 1; // 会被追踪（深层响应式代理）

const r = ref({ count: 0 });
r.value.count = 1;   // 不会被追踪（原始对象，无代理）
r.value = { count: 1 }; // 会被追踪（整体替换 value）
```

创建或写入 ref 时有两条归一化规则：

- `ref(existingRef)` 直接返回同一个 ref，不会嵌套包装。
- 把 signal 或 ref 赋给 `.value` 时，存储的是其解包后的当前值，而不是包装器本身。

如需检查一个值是否为浅层响应式对象，请参见 [reactive](./reactive.md) 中的 `isShallow`。

## isRef

类型守卫，检查一个值是否为 `Ref` 实例。

```ts
import { isRef, isSignal, ref, signal } from '@estjs/signals';

const r = ref(0);
const s = signal(0);

console.log(isRef(r)); // true
console.log(isRef(s)); // false —— signal 不是 ref
console.log(isSignal(r)); // 注意：ref 基于 signal 实现构建
console.log(isRef({ value: 0 })); // false
```

## unref

将 signal、computed、ref 或 getter 函数解包为原始值：

- Signal / Computed / Ref → 返回 `.value`
- Getter 函数 → 调用它并返回结果
- 普通值 → 原样返回

```ts
import { computed, ref, signal, unref } from '@estjs/signals';

const count = signal(5);

unref(count);              // 5
unref(ref(10));            // 10
unref(computed(() => 2));  // 2
unref(() => count.value);  // 5（getter 会被调用）
unref(5);                  // 5（普通值原样返回）
```

当编写既接受原始值又接受响应式包装器的函数时，`unref` 非常有用：

```ts
function useTitle(title: string | Signal<string>) {
  document.title = unref(title);
}
```

## toRef

创建一个可写的 computed ref，代理响应式对象的单个属性。变更双向传播——读取该 ref 会从对象读取，写入该 ref 会写回对象。

```ts
import { reactive, toRef } from '@estjs/signals';

const state = reactive({ count: 0, name: 'Alice' });

const countRef = toRef(state, 'count');
countRef.value;      // 0
countRef.value = 5;  // 写回源对象：state.count === 5

state.count = 10;
countRef.value;      // 10 —— 始终反映源对象
```

可选的第三个参数提供默认值，在属性为 `undefined` 时使用：

```ts
const state = reactive<{ label?: string }>({});
const label = toRef(state, 'label', 'untitled');
label.value; // 'untitled'
```

返回类型为 `Computed<T[K]>`，同样支持 `peek()` 进行无追踪读取。虽然 `Computed` 接口把 `value` 声明为只读，但 `toRef` 返回的对象在运行时是可写的——赋值会被转发到源对象。

## toRefs

将响应式对象转换为普通对象，其中每个属性都被包装为可写的 computed ref（每个都通过 `toRef` 创建）。这使得解构响应式状态时不会丢失响应性：

```ts
import { effect, reactive, toRefs } from '@estjs/signals';

const state = reactive({ x: 1, y: 2 });

// 直接解构 `state` 会破坏响应性。
// toRefs 让每个属性与源对象保持连接：
const { x, y } = toRefs(state);

effect(() => {
  console.log(`x = ${x.value}`);
});

x.value = 10;  // state.x === 10，effect 重新执行
state.x = 20;  // x.value === 20
```

常见模式是从组合式函数（composable）中返回响应式状态：

```ts
function useMouse() {
  const pos = reactive({ x: 0, y: 0 });
  // ...在 mousemove 时更新 pos...
  return toRefs(pos); // 使用方可以安全地解构
}

const { x, y } = useMouse();
```

注意：`toRefs` 只包装调用时对象上已存在的属性（内部遍历 `Object.keys`），之后新增的属性不会被包含。

## 注意事项

1. **DOM 元素请使用 `ref`**：这是 Essor 中 `ref` 的主要用途——通过 JSX 的 `ref` 属性绑定，在挂载后读取 `.value`。
2. **ref 对对象是浅层的**：存储在 ref 中的对象内部的修改不会被追踪；需要通过整体替换 `.value` 触发更新，或改用 `signal` / `reactive` 获得深层响应性。
3. **`toRef` / `toRefs` 需要响应式的源对象**：它们代理给定对象上的属性访问，因此只有当源对象是 `reactive()` 对象（或其他可被追踪的目标）时，响应性才会生效。
4. **`unref` 会调用 getter 函数**：与某些框架不同，把函数传给 `unref` 会调用它——不要传入不希望被执行的函数。

## 类型定义

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
