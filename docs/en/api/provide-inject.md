# Dependency Injection (provide / inject)

Essor provides a lightweight dependency injection system based on the component scope tree for cross-level data sharing without passing props through each layer.

## Overview

- `provide(key, value)` — Register a dependency in the current scope
- `inject(key, defaultValue?)` — Look up a dependency upward from the current scope

Dependency lookup proceeds **upward** along the scope tree: first in the current scope, then recursively to parent scopes until the root scope.

## Basic Usage

### Register a Dependency

Use `provide` in a parent component:

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

### Inject a Dependency

Use `inject` in any descendant component:

```tsx
import { inject } from '@estjs/template';

function ThemedButton() {
  const theme = inject('theme'); // returns a signal getter
  const toggleTheme = inject('toggleTheme');

  return (
    <button
      class={theme() === 'dark' ? 'btn-dark' : 'btn-light'}
      onClick={toggleTheme}
    >
      Toggle Theme
    </button>
  );
}
```

## Default Values

If the injected key is not found in the current or any ancestor scope, `inject` returns `undefined`. You can provide a default value as the second argument:

```tsx
const locale = inject('locale', 'zh-CN');
```

## Using Symbols to Avoid Name Collisions

For complex applications, it is recommended to use Symbols as keys:

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

## Considerations

1. **Must be called within a scope**: `provide` and `inject` must be called inside a component function or `runWithScope`; otherwise, `ProvideOutsideScopeError` or `InjectOutsideScopeError` is thrown.
2. **Non-reactive by default**: Values passed to `provide` are not automatically wrapped as reactive. If you need to pass a signal, pass a getter function or the signal object itself.
3. **Scope isolation**: Dependencies are only visible in the current scope and its child scopes; sibling scopes cannot see each other.
4. **Override mechanism**: Child scopes can call `provide` with the same key to override the parent scope's value, affecting the child scope's descendants.

## Type Definitions

```ts
function provide<T>(key: string | symbol, value: T): void;
function inject<T>(key: string | symbol, defaultValue?: T): T | undefined;
```

## Differences from Vue

| Feature | Essor | Vue 3 |
|---------|-------|-------|
| Reactivity | Must manually pass signal / getter | Auto-unwraps ref / reactive |
| Scope | Based on scope tree | Based on component instance |
| API | `provide(key, value)` | `provide(key, value)` |
| Injection | `inject(key)` | `inject(key, default)` |
