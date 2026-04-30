# 批量更新

在某些情况下，您可能需要同时更新多个信号，或者执行一系列会触发多个更新的操作。为了优化性能并避免不必要的重新计算，`@estjs/signals` 提供了 `batch` 函数用于批量处理更新。

## 什么是批量更新？

批量更新允许您将多个信号更新操作组合在一起，推迟它们的副作用（如计算属性和effect）直到所有更新完成。这能显著提升性能并确保数据一致性。

## 基本用法

```ts
import { batch, signal } from '@estjs/signals';

const count1 = signal(0);
const count2 = signal(0);

// 创建一个依赖于两个信号的副作用
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

## 工作原理

当使用`batch`时，系统会：

1. 进入批量更新模式
2. 执行提供的回调函数（所有信号更新操作）
3. 将所有触发的副作用收集到队列中
4. 批量处理模式结束后，一次性运行所有收集的副作用


## 何时使用批量更新

批量更新在以下情况特别有用：

1. **多个相关值同时更新**：当您需要更新多个相互关联的状态时
2. **表单处理**：当需要同时设置多个表单字段时
3. **远程数据加载**：当从API接收数据并需要更新多个状态时
4. **动画和过渡**：同时调整多个视觉属性时

## 嵌套批量更新

批量更新可以嵌套使用，内部的`batch`调用会被合并到外部的批量处理中：

```ts
batch(() => {
  count1.value = 10;

  batch(() => {
    count2.value = 20;
    count3.value = 30;
  });

  count4.value = 40;
});
// 所有4个更新都在一个批次中处理
```

## 批量更新与异步代码

需要注意的是，批量更新仅适用于同步代码。异步操作将会脱离批量处理上下文：

```ts
batch(() => {
  count1.value = 10; // 包含在批处理中

  setTimeout(() => {
    count2.value = 20; // 不在批处理中，将立即触发副作用
  }, 0);
});
```

## nextTick

`batch`与`nextTick`的主要区别：

- `batch`：立即执行同步更新，并在同步代码完成后立即处理副作用
- `nextTick`：将回调推迟到下一个微任务(microtask)执行

在某些情况下，您可能需要结合这两个函数使用：

```ts
import { batch, nextTick, signal } from '@estjs/signals';

const user = signal({ name: '', age: 0 });

async function updateUserAndWait() {
  batch(() => {
    user.value = { name: '张三', age: 25 };
  });

  // 等待所有副作用完成
  await nextTick();

  // 继续处理后续逻辑
  console.log('用户数据已更新并且所有副作用已完成');
}
```

## 性能影响

在基准测试中，使用批量更新可以显著提高性能：

```ts
// 更新100个信号
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

::: tip
在处理大量信号更新时，始终考虑使用批量更新来优化性能。
:::
