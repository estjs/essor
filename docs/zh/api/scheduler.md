# Scheduler（调度器）

调度器（scheduler）把响应式副作用汇聚到基于微任务（microtask）的 flush 周期中执行。Essor 不会同步运行每个副作用，而是先将任务入队，每个微任务只 drain 一次队列，从而对重复任务去重，并保证稳定的执行顺序。

大多数应用代码只需要 `nextTick`。队列函数（`queueJob`、`queuePreFlushCb`、`queuePostFlushJob`）是更底层的构建块——框架内部正是用这些原语来调度副作用、组件更新与 Suspense 的 resolve。

## nextTick

将函数安排到下一个微任务中执行，即当前 flush 周期完成之后。返回一个 Promise，因此也可以不传回调直接 `await`。

```ts
import { nextTick, signal, effect } from '@estjs/signals';

const count = signal(0);

effect(() => {
  console.log('count is', count.value);
});
// 输出: count is 0

count.value = 1;
// 副作用尚未运行——它已入队，等待下一个微任务。

await nextTick();
// 输出: count is 1
console.log('所有副作用已完成');
```

传入回调的用法：

```ts
nextTick(() => {
  // 在待处理的 flush 周期之后运行。
  console.log('DOM 与副作用均已更新');
});
```

## queueJob

将一个 job 加入**主队列（main queue）**，并在下一个微任务安排一次 flush。队列使用 `Set`，因此在 flush 前多次入队同一个函数只会执行一次：

```ts
import { queueJob, nextTick } from '@estjs/signals';

const job = () => console.log('run');

queueJob(job);
queueJob(job); // 去重——同一个函数引用

await nextTick();
// 输出: run   （只执行一次）
```

这是默认的调度通道：以 `flush: 'post'`（默认值）创建的副作用就是作为 main queue job 运行的。

## queuePreFlushCb

将回调加入**pre-flush 队列**。pre-flush 回调总是在**下一个 main job 之前**运行。它们用于必须在副作用重新渲染之前观察状态的工作——例如以 `flush: 'pre'` 创建的副作用。

一个关键行为：如果 main job 在执行中排入了 pre-flush 回调，该回调会在*下一个* main job 之前运行，而不是等到周期末尾：

```ts
import { queueJob, queuePreFlushCb, nextTick } from '@estjs/signals';

const order: string[] = [];

queueJob(() => {
  order.push('main1');
  queuePreFlushCb(() => order.push('pre'));
});
queueJob(() => order.push('main2'));

await nextTick();

console.log(order); // ['main1', 'pre', 'main2']
```

## queuePostFlushJob

将回调加入**post-flush 队列**，仅在 pre 与 main 队列完全排空后执行。适用于"所有副作用都已完成"之后的工作——DOM 测量，或类似 Suspense `onResolved` 的钩子：

```ts
import { queueJob, queuePostFlushJob, nextTick } from '@estjs/signals';

const order: string[] = [];

queueJob(() => {
  order.push('A');
  queuePostFlushJob(() => order.push('post'));
  queueJob(() => order.push('B'));
});

await nextTick();

console.log(order); // ['A', 'B', 'post']
// 'post' 会等待 'B'，即使 'B' 是在它之后入队的。
```

如果 post-flush 回调排入了新的 pre/main job，调度器会开始**新的一整轮**，而新排入的 post 回调要等这一轮排空后才会执行：

```ts
queueJob(() => order.push('main1'));
queuePostFlushJob(() => {
  order.push('post1');
  queuePreFlushCb(() => order.push('pre2'));
  queueJob(() => order.push('main2'));
  queuePostFlushJob(() => order.push('post2'));
});

await nextTick();
// order: ['main1', 'post1', 'pre2', 'main2', 'post2']
```

## 刷新时序（Flush Order）

每个 flush 周期都严格维持 `pre → main → post` 的不变量：

1. **pre** —— 所有待处理的 pre-flush 回调都在下一个 main job 之前运行。如果 main job 排入了新的 pre-flush 回调，它们会在下一个 main job 之前运行。
2. **main** —— 排空主 job 队列。drain 过程中新排入的 job 会推迟到同一周期的下一次迭代。
3. **post** —— 只有当 pre 与 main 队列完全清空后，post-flush 回调才会运行。如果它们排入了新工作，则开始新一轮 `pre → main → post`。

```
┌───────────── flush 周期（一个微任务）─────────────────┐
│                                                       │
│  一轮:  pre ──▶ main ──▶ pre ──▶ main ──▶ … ──▶ post  │
│           ▲                                      │    │
│           └── post 排入了新 job？开始新一轮 ─────┘    │
└───────────────────────────────────────────────────────┘
```

其他保证：

- **可重入安全** —— flush 执行期间（`isFlushing` 为 true），嵌套的 flush 请求（例如在正在运行的 job 内部触发 `endBatch()`）会立即返回、不做任何事。外层 flush 循环会接手所有新排入的 job，因此嵌套 flush 永远不会让 post-flush 回调抢在剩余 main job 之前运行。
- **去重** —— 三个队列都是 `Set`；flush 前重复入队同一函数只执行一次。
- **失控循环保护** —— 如果单个 flush 周期内队列被 drain 超过 100 次（通常是某个副作用写入了它自己读取的信号），剩余 job 会被丢弃并给出警告，而不是让页面卡死。中止后 post-flush 回调仍会运行。
- **错误隔离** —— 某个 job 或回调抛出异常不会阻止其余已入队 job 的执行。

## 与 `batch` 的关系

`batch` 会把 flush 推迟到最外层批次结束，然后同步 flush。调度器队列正是其底层机制：信号写入会排入副作用 job，`batch` 只是控制 drain *何时*发生。`nextTick` 总是在所有待处理 flush 之后 resolve，因此无论副作用如何被调度，`await nextTick()` 都是等待全部副作用完成的可靠方式。

## 类型定义

```ts
/** 可被调度执行的任务（job） */
type Job = () => void;

/** 在主任务队列之前执行的回调 */
type PreFlushCallback = () => void;

/** 在主任务队列完全排空之后执行的回调 */
type PostFlushCallback = () => void;

/**
 * 副作用的刷新时机策略：
 * - 'pre':  在主队列之前执行（适用于组件更新）
 * - 'post': 在主队列上执行（默认行为）
 * - 'sync': 立即同步执行（谨慎使用）
 */
type FlushTiming = 'pre' | 'post' | 'sync';

function nextTick(fn?: () => void): Promise<void>;
function queueJob(job: Job): void;
function queuePreFlushCb(cb: PreFlushCallback): void;
function queuePostFlushJob(cb: PostFlushCallback): void;
```

::: tip
在应用代码中，优先使用 `await nextTick()` 等待更新，并通过 `effect(fn, { flush })` 选择时机。只有在构建需要精确插入 flush 周期特定阶段的框架级工具时，才直接使用这些原始队列函数。
:::
