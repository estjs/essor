# 批量更新

批量更新允许将多次信号变更合并为一轮响应式更新，从而减少不必要的中间计算和 DOM 操作。

## 什么是批量更新？

通常情况下，每次给信号赋值都会立即触发依赖它的 `effect` 与 `computed`。当事件处理函数等场景中连续修改多个信号时，会产生大量中间计算。

`batch` 会推迟所有响应式副作用，直到回调执行完毕后再统一触发。这能显著提升性能，并保证相关状态的一致性。

## 基本用法

```tsx
import { batch, effect, signal } from '@estjs/signals';

const count1 = signal(0);
const count2 = signal(0);

effect(() => {
  console.log(`总和: ${count1.value + count2.value}`);
});
// 输出: 总和: 0

// 不使用批量更新，副作用会执行两次
count1.value = 1; // 输出: 总和: 1
count2.value = 2; // 输出: 总和: 3

// 使用批量更新，副作用只会执行一次
batch(() => {
  count1.value = 3;
  count2.value = 4;
});
// 输出: 总和: 7
```

在组件中配合 `$` 信号语法使用同样自然：

```tsx
function UserForm() {
  let $firstName = 'John';
  let $lastName = 'Doe';

  effect(() => {
    console.log('全名:', $firstName, $lastName);
  });

  function updateName() {
    batch(() => {
      $firstName = 'Jane';
      $lastName = 'Smith';
    });
    // batch 结束后 effect 只会运行一次
  }

  return (
    <div>
      <p>{$firstName} {$lastName}</p>
      <button onClick={updateName}>更新姓名</button>
    </div>
  );
}
```

## 工作原理

调用 `batch` 时，运行时会：

1. 进入批量模式
2. 执行传入的回调（其中所有的信号赋值）
3. 把被触发的副作用收集到队列中
4. 退出批量模式，一次性 flush 队列

## 何时使用批量更新

批量更新在以下场景特别有用：

1. **同时更新多个相关值** —— 保持依赖状态一致
2. **表单处理** —— 一次性设置多个字段
3. **远程数据加载** —— 把接口响应铺到多个信号上
4. **动画与过渡** —— 同时调整多个视觉属性

## 嵌套批量更新

`batch` 可以嵌套，内部调用会合并到外层批次中：

```ts
batch(() => {
  count1.value = 10;

  batch(() => {
    count2.value = 20;
    count3.value = 30;
  });

  count4.value = 40;
});
// 4 次更新在同一次 flush 中完成
```

## 批量更新与异步代码

`batch` 仅覆盖**同步**代码。异步任务会脱离批量上下文：

```ts
batch(() => {
  count1.value = 10; // 包含在批处理中

  setTimeout(() => {
    count2.value = 20; // 不在批处理中，立即触发副作用
  }, 0);
});
```

## 与 `nextTick` 的关系

`batch` 与 `nextTick` 解决不同的问题：

- `batch`：回调返回后立即同步 flush
- `nextTick`：把回调推迟到下一个微任务，在当前 flush 之后执行

它们可以组合使用：

```ts
import { batch, nextTick, signal } from '@estjs/signals';

const user = signal({ name: '', age: 0 });

async function updateUserAndWait() {
  batch(() => {
    user.value = { name: '张三', age: 25 };
  });

  // 等待所有副作用完成
  await nextTick();

  console.log('用户数据已更新且所有副作用已执行');
}
```

## 性能影响

基准测试表明批量更新能显著降低更新开销：

```ts
// 更新 100 个信号
// 不使用批量更新: ~24ms
for (let i = 0; i < 100; i++) {
  signals[i].value = i;
}

// 使用批量更新: ~3ms
batch(() => {
  for (let i = 0; i < 100; i++) {
    signals[i].value = i;
  }
});
```

## 类型定义

```ts
function batch<T>(fn: () => T): T;
function nextTick(callback?: () => void): Promise<void>;
```

## 注意事项

1. **批量内部的读取**会返回最新赋值，但依赖它的副作用尚未运行。
2. **批量内抛出异常**会中止批处理并丢弃尚未触发的更新。
3. **自动批处理**：事件处理函数内已自动启用批量更新，仅在其它场景需要手动调用 `batch`。
4. **避免过度使用**：把每次更新都包进 `batch` 反而会延迟 UI 反馈，降低响应度。

::: tip
当你需要一次性修改大量信号时，优先考虑 `batch` 以避免无谓的重复计算。
:::
