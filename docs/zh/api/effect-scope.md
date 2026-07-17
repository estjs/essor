# effectScope

创建一个 effect scope，用于收集在其内部创建的响应式副作用（`effect`、`computed`、`watch`），以便统一暂停、恢复或销毁它们。

## 基本用法

```ts
import { effect, effectScope, signal } from '@estjs/signals';

const count = signal(0);
const scope = effectScope();

scope.run(() => {
  effect(() => {
    console.log(`count is ${count.value}`);
  });
  // 更多 effect、computed、watcher...
});

count.value = 1; // 输出: "count is 1"

// 一次性销毁 scope 内创建的所有 effect
scope.stop();

count.value = 2; // 没有输出 —— 所有 effect 已停止
```

## EffectScope 类

`effectScope()` 返回一个 `EffectScope` 实例，包含以下公开 API：

- **run(fn)** — 以该 scope 作为当前活动 scope 执行 `fn`。`fn` 执行期间创建的所有 effect 都会被该 scope 记录。返回 `fn` 的返回值。已销毁的 scope 会拒绝执行（开发模式下警告并返回 `undefined`）；暂停中的 scope 仍可以执行——暂停只冻结 effect 的重新执行，并不会让 scope 不可用。
- **stop()** — 永久销毁该 scope：停止所有已记录的 effect，递归停止所有子 scope，执行所有 `onScopeDispose` 注册的清理函数，并从父 scope 中脱离。幂等——重复调用无副作用。
- **pause()** — 临时冻结该 scope：所有已记录的 effect 和所有子 scope 都会被暂停。被暂停的 effect 在依赖变化时不会重新执行。
- **resume()** — 重新激活已暂停的 scope，恢复所有已记录的 effect 和子 scope。
- **active** — 只要 scope 未被销毁就为 `true`（暂停中的 scope 仍是 active 的）。
- **isPaused** — scope 处于暂停状态时为 `true`。
- **isDisposed** — scope 被停止后为 `true`。

## 嵌套 Scope

在某个 scope 执行期间（通过 `run`）创建的新 scope 会自动成为该 scope 的子 scope，除非以 detached 方式创建。停止父 scope 会递归停止所有子 scope；父 scope 的暂停/恢复也会级联到子 scope。

```ts
import { effectScope } from '@estjs/signals';

const parent = effectScope();

parent.run(() => {
  const child = effectScope(); // 自动嵌套在 `parent` 之下
  child.run(() => {
    // 这里的 effect 属于 `child`
  });
});

parent.stop(); // 同时停止 `child` 及其所有 effect
```

## Detached Scope

向 `effectScope` 传入 `true` 可创建 detached scope。Detached scope 不会注册到当前活动 scope 上，因此外层 scope 停止时它不会被销毁——其生命周期必须手动管理。

```ts
import { effectScope } from '@estjs/signals';

const outer = effectScope();

let detached;
outer.run(() => {
  detached = effectScope(true); // detached —— 不是 `outer` 的子 scope
  detached.run(() => {
    // 长生命周期的 effect
  });
});

outer.stop();
// `detached` 仍处于活动状态；用完后需自行停止：
detached.stop();
```

## 暂停中的 Scope

暂停会冻结 effect 的重新执行，但不会销毁任何东西：

```ts
import { effect, effectScope, signal } from '@estjs/signals';

const count = signal(0);
const scope = effectScope();

scope.run(() => {
  effect(() => console.log(count.value));
}); // 输出: 0

scope.pause();
count.value = 1; // 没有输出 —— effect 被冻结

scope.resume(); // 输出: 1 —— 暂停期间依赖发生了变化，
                // 因此 effect 在恢复时补跑一次

count.value = 2; // 输出: 2 —— 重新响应变化
```

值得了解的行为（来自实现）：

- **暂停期间的依赖变化不会丢失。** effect 仍会将自身标记为 dirty；在 `resume()` 时会重新执行一次以追上变化。如果暂停期间实际没有变化，则不会重新执行。

- **暂停期间 `run()` 仍然可用。** 暂停只冻结依赖变化的通知；你仍然可以在 scope 内执行代码。
- **在 scope 暂停期间创建的 effect 会继承暂停状态**——但其*初始*执行仍会发生，因为 `effect()` / `watch()` 在创建时会立即执行其函数体。只有后续依赖变化触发的重新执行会被冻结，直到 `resume()`。

## getCurrentScope

返回当前活动的 `EffectScope`，若没有则返回 `undefined`。

```ts
import { effectScope, getCurrentScope } from '@estjs/signals';

console.log(getCurrentScope()); // undefined

const scope = effectScope();
scope.run(() => {
  console.log(getCurrentScope() === scope); // true
});
```

## onScopeDispose

在当前活动 scope 上注册一个清理回调。scope 被停止时回调会执行。

```ts
import { effectScope, onScopeDispose } from '@estjs/signals';

const scope = effectScope();

scope.run(() => {
  const timer = setInterval(() => console.log('tick'), 1000);
  onScopeDispose(() => clearInterval(timer));
});

scope.stop(); // clearInterval 被执行
```

如果调用时没有活动 scope，开发模式下会发出警告。传入 `true` 作为第二个参数（`failSilently`）可抑制该警告——适用于既可能在 scope 内、也可能在 scope 外运行的库代码：

```ts
onScopeDispose(cleanup, true); // 没有活动 scope 时不发出警告
```

在已销毁的 scope 上注册清理函数会被丢弃（开发模式下会警告），因为它永远不会执行。

## setCurrentScope

手动替换当前活动 scope，并返回之前的 scope。这是一个底层原语——优先使用 `scope.run(fn)`，它会自动恢复之前的 scope。使用 `setCurrentScope` 时必须自行恢复之前的 scope：

```ts
import { effectScope, setCurrentScope } from '@estjs/signals';

const scope = effectScope();
const prev = setCurrentScope(scope);
try {
  // 这里创建的 effect 会被 `scope` 记录
} finally {
  setCurrentScope(prev); // 务必恢复
}
```

## 与组件生命周期的关系

在 Essor 中，每个组件都运行在自己的 effect scope 内：组件的渲染函数以及 setup 期间创建的所有响应式副作用都会被该 scope 记录。组件销毁时，其 scope 会被停止，从而自动销毁其所有的 effect、computed 和 watcher——这也是为什么在组件内部很少需要手动调用 `stop()`。

因此，在组件 setup 期间注册的 `onScopeDispose` 会在组件销毁时触发，这为组合式函数提供了一种与具体生命周期解耦的自清理方式。

手动创建的 scope 主要用于组件之外（如应用级服务），或者当你需要一组生命周期短于所在组件的 effect 时。

## 注意事项

1. **已销毁的 scope 不能复用**：对已销毁 scope 调用 `run()` 会发出警告并返回 `undefined`；在其上注册的清理函数会被丢弃。
2. **`pause` / `resume` 是层级化的**：它们会级联到子 scope 及每一个已记录的 effect。
3. **忘记的 detached scope 会造成泄漏**：没有任何机制会自动停止 detached scope——务必保留引用并调用 `stop()`。
4. **销毁过程中的错误会被隔离**：如果停止过程中某个子 scope、effect 或清理函数抛出错误，开发模式下会记录该错误，其余的销毁步骤仍会继续执行。

## 类型定义

```ts
function effectScope(detached?: boolean): EffectScope;

function getCurrentScope(): EffectScope | undefined;

function setCurrentScope(scope?: EffectScope): EffectScope | undefined;

function onScopeDispose(fn: () => void, failSilently?: boolean): void;

class EffectScope {
  constructor(detached?: boolean, parent?: EffectScope);

  readonly active: boolean;
  readonly isPaused: boolean;
  readonly isDisposed: boolean;

  run<T>(fn: () => T): T | undefined;
  stop(): void;
  pause(): void;
  resume(): void;
}
```
