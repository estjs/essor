# 生命周期钩子

Essor 提供了与组件作用域绑定的生命周期钩子，用于在组件挂载、更新和销毁时执行逻辑。

## 概述

生命周期钩子在 `@estjs/template` 包中提供，必须在组件函数或作用域内部调用：

- `onMount` — 组件挂载后执行
- `onUpdate` — 组件更新后执行
- `onDestroy` — 组件销毁前执行

组件生命周期之外的通用清理，见下文[作用域清理](#作用域清理)。

## onMount

在组件挂载完成后执行。如果调用时组件已经挂载，则立即执行。

```tsx
import { onMount } from '@estjs/template';
import { signal } from '@estjs/signals';

function Timer() {
  let $elapsed = 0;

  onMount(() => {
    const interval = setInterval(() => {
      $elapsed++;
    }, 1000);

    // 返回清理函数（可选）
    return () => clearInterval(interval);
  });

  return <p>已运行 {$elapsed} 秒</p>;
}
```

### 异步支持

`onMount` 支持返回 Promise，框架会等待异步挂载逻辑完成：

```tsx
onMount(async () => {
  const data = await fetchData();
  $data = data;
});
```

## onUpdate

在组件每次响应式更新后执行。

```tsx
import { onUpdate } from '@estjs/template';
import { signal } from '@estjs/signals';

function Logger() {
  let $count = 0;

  onUpdate(() => {
    console.log('count 更新为:', $count);
  });

  return <button onClick={() => $count++}>{$count}</button>;
}
```

注意：`onUpdate` 在初始挂载时**不会**触发，仅在后续响应式更新时触发。

## onDestroy

在组件销毁前执行，用于释放资源、取消订阅等。

```tsx
import { onDestroy } from '@estjs/template';
import { signal } from '@estjs/signals';

function Subscriber() {
  const channel = new BroadcastChannel('app');

  onDestroy(() => {
    channel.close();
  });

  return <div>广播频道已连接</div>;
}
```

## 作用域清理

Essor 中没有 `onCleanup` 钩子。组件销毁生命周期之外的清理，使用以下两种模式之一：

### effect 返回清理函数

`effect` 回调可以返回一个清理函数，它会在每次重新执行前以及最终销毁时各执行一次：

```tsx
import { effect } from '@estjs/signals';

function ResourceLoader() {
  let $url = '/api/data';

  effect(() => {
    const controller = new AbortController();
    fetch($url, { signal: controller.signal });

    // 每次重新执行前及销毁时调用
    return () => controller.abort();
  });

  return <div>加载中...</div>;
}
```

### onScopeDispose

`onScopeDispose`（来自 `@estjs/signals`）在当前 effect 作用域上注册回调，作用域销毁时触发。它可用于任何作用域，包括通过 `effectScope()` 创建的非组件作用域：

```tsx
import { effectScope, onScopeDispose } from '@estjs/signals';

const scope = effectScope();
scope.run(() => {
  const channel = new BroadcastChannel('app');
  onScopeDispose(() => channel.close());
});

// 之后:
scope.stop(); // 此时 channel.close() 被调用
```

## 执行顺序

当组件销毁时，清理逻辑按以下顺序执行：

1. 子作用域的清理函数和 `onDestroy` 钩子（深度优先）
2. 当前作用域的 `onDestroy` 钩子
3. 当前作用域的 `cleanup` 函数
4. 断开父级引用，标记为已销毁

## 注意事项

1. **必须在作用域内调用**：在组件函数内部或 `runWithScope` 中调用，否则会在开发模式下报错。
2. **多次调用**：同一个生命周期可以注册多个钩子，按注册顺序依次执行。
3. **避免内存泄漏**：在 `onMount` 中创建的定时器、事件监听等资源，务必在返回的清理函数或 `onDestroy` 中释放。
4. **错误处理**：异步钩子中的未捕获异常会在开发模式下输出错误日志，但不会阻塞其他钩子的执行。

## 类型定义

```ts
function onMount(hook: () => void | Promise<void>): void;
function onUpdate(hook: () => void | Promise<void>): void;
function onDestroy(hook: () => void | Promise<void>): void;
```
