# Getting Started

Essor is a fine-grained reactive frontend framework using JSX syntax with compile-time optimizations for runtime performance.

## Installation

### Using npm

```bash
npm install essor
```

### Using pnpm

```bash
pnpm add essor
```

### Using yarn

```bash
yarn add essor
```

## Configure Build Tool

Essor uses the `unplugin-essor` plugin for compile-time transformations. It supports Vite, Webpack, Rollup, esbuild, and more.

### Vite Config

```ts
import { defineConfig } from 'vite';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  plugins: [essor()],
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "essor"
  }
}
```

## Your First Component

Create a counter component:

```tsx
import { signal } from 'essor';

function Counter() {
  let $count = 0;

  return (
    <div>
      <p>Count: {$count}</p>
      <button onClick={() => $count++}>+1</button>
    </div>
  );
}

export default Counter;
```

Note: Variables prefixed with `$` are automatically converted to reactive signals by the compiler.

## Mount the Application

```tsx
import { createApp } from 'essor';
import App from './App';

createApp(App, '#app');
```

## Two-Way Binding

```tsx
function Form() {
  const $name = '';

  return (
    <div>
      <input bind:value={$name} placeholder="Enter name" />
      <p>Hello, {$name}</p>
    </div>
  );
}
```

## List Rendering

```tsx
import { For } from 'essor';

function TodoList() {
  const $todos = [
    { id: 1, text: 'Learn Essor' },
    { id: 2, text: 'Build an app' },
  ];

  return (
    <ul>
      <For each={$todos} key={(todo) => todo.id}>
        {(todo) => <li>{todo.text}</li>}
      </For>
    </ul>
  );
}
```

## Next Steps

- [signal API](../api/signal.md) - Learn about reactive signals
- [effect API](../api/effect.md) - Side effects and dependency tracking
- [bind two-way binding](./bind.md) - Form binding details
