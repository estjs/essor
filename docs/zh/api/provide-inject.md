# 依赖注入 (provide / inject)

Essor 提供了一套轻量的依赖注入系统，基于组件作用域树实现跨层级数据共享，无需通过 props 逐层传递。

## 概述

- `provide(key, value)` — 在当前作用域中注册一个依赖
- `inject(key, defaultValue?)` — 从当前作用域向上查找依赖

依赖的查找沿着作用域树**向上**进行：先在当前作用域查找，找不到则递归到父作用域，直到根作用域。

## 基本用法

### 注册依赖

在父组件中使用 `provide`：

```tsx
import { provide } from '@estjs/template';
import { signal } from '@estjs/signals';

function ThemeProvider({ children }) {
  let $theme = 'dark';

  provide('theme', () => $theme);
  provide('toggleTheme', () => {
    $theme = $theme === 'dark' ? 'light' : 'dark';
  });

  return <div class={`theme-${$theme}`}>{children}</div>;
}
```

### 注入依赖

在任意后代组件中使用 `inject`：

```tsx
import { inject } from '@estjs/template';

function ThemedButton() {
  const theme = inject('theme'); // 返回 signal getter
  const toggleTheme = inject('toggleTheme');

  return (
    <button
      class={theme() === 'dark' ? 'btn-dark' : 'btn-light'}
      onClick={toggleTheme}
    >
      切换主题
    </button>
  );
}
```

## 默认值

如果注入的 key 在当前及所有祖先作用域中都找不到，`inject` 会返回 `undefined`。可以通过第二个参数提供默认值：

```tsx
const locale = inject('locale', 'zh-CN');
```

## 使用 symbol 避免命名冲突

对于复杂应用，建议使用 Symbol 作为 key：

```tsx
// constants.ts
// App.tsx
import { ThemeKey, UserKey } from './constants';

export const ThemeKey = Symbol('theme');
export const UserKey = Symbol('user');

provide(ThemeKey, { theme: 'dark', toggle: () => {} });
provide(UserKey, { name: 'Essor', id: 1 });

// Child.tsx
const user = inject(UserKey);
```

## 注意事项

1. **必须在作用域内调用**：`provide` 和 `inject` 必须在组件函数或 `runWithScope` 中调用，否则会抛出 `ProvideOutsideScopeError` 或 `InjectOutsideScopeError`。
2. **非响应式传递**：`provide` 传递的值本身不会自动包装为响应式。如果需要传递信号，建议传入 getter 函数或 signal 对象。
3. **作用域隔离**：依赖只在当前作用域及其子作用域中可见，兄弟作用域之间不可见。
4. **覆盖机制**：子作用域可以调用 `provide` 使用相同 key 覆盖父作用域的值，对子作用域的后代生效。

## 类型定义

```ts
function provide<T>(key: string | symbol, value: T): void;
function inject<T>(key: string | symbol, defaultValue?: T): T | undefined;
```

