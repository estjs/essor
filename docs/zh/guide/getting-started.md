# 快速开始

Essor 是一个基于细粒度响应式信号的前端框架，采用 JSX 语法，编译时优化运行时性能。

## 安装

### 使用 npm

```bash
npm install essor
```

### 使用 pnpm

```bash
pnpm add essor
```

### 使用 yarn

```bash
yarn add essor
```

## 配置构建工具

Essor 使用 `unplugin-essor` 插件进行编译时转换，支持 Vite、Webpack、Rollup、esbuild 等。

### Vite 配置

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

## 第一个组件

创建一个计数器组件：

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

注意：以 `$` 开头的变量会被编译器自动转换为响应式信号。

## 挂载应用

```tsx
import { createApp } from 'essor';
import App from './App';

createApp(App, '#app');
```

## 使用双向绑定

```tsx
function Form() {
  const $name = '';

  return (
    <div>
      <input bind:value={$name} placeholder="输入姓名" />
      <p>你好，{$name}</p>
    </div>
  );
}
```

## 列表渲染

```tsx
import { For } from 'essor';

function TodoList() {
  const $todos = [
    { id: 1, text: '学习 Essor' },
    { id: 2, text: '构建应用' },
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

## 下一步

- [signal API](../api/signal.md) - 了解响应式信号
- [effect API](../api/effect.md) - 副作用与依赖追踪
- [bind 双向绑定](./bind.md) - 表单绑定详解
