# Runtime API

本文档介绍 `@estjs/template` 包提供的核心运行时 API，包括应用挂载、模板创建、列表渲染和异步资源管理。

## createApp

将组件挂载到指定的 DOM 节点。

```ts
function createApp(component: Component, container: string | Element): () => void;
```

- `component` — 组件函数
- `container` — CSS 选择器或 DOM 元素
- 返回值 — 销毁函数；调用它可以销毁应用

```tsx
import { createApp } from 'essor';
import App from './App';

const dispose = createApp(App, '#app');

// 卸载
// dispose();
```

## hydrate

在客户端对服务端渲染的静态 HTML 进行 hydration。

```ts
function hydrate(component: Component, container: string | Element, options?: HydrateOptions): () => void;
```

- 复用服务端生成的 DOM 节点，只附加事件监听器和响应式系统
- 显著减少客户端初始化时间

```tsx
import { hydrate } from 'essor';
import App from './App';

hydrate(App, '#app');
```

## template

创建可复用的 DOM 模板工厂。编译器会将 JSX 转换为 `template` 调用。

```ts
function template(html: string, isSvg?: boolean): () => Node;
```

- `html` — HTML 字符串片段
- `isSvg` — 内容是否为 SVG
- 返回一个每次调用都会克隆模板的工厂函数

通常你不需要手动调用它；编译器会自动处理：

```tsx
// 编译前 (JSX)
function Card() {
  return <div class="card"><h2>Title</h2></div>;
}

// 编译后（近似）
const _tmpl = template('<div class="card"><h2></h2></div>');
function Card() {
  const el = _tmpl();
  // ... 填充动态内容
  return el;
}
```

## For

高效的列表渲染组件，使用基于 key 的 diff 算法，最小化 DOM 操作。

```tsx
import { For } from '@estjs/template';
```

### Props

- `each` — 响应式数组或由 signal 返回的数组
- `key` — 唯一标识函数 `(item, index) => uniqueId`
- `fallback` — 数组为空时显示的回退内容
- `children` — 渲染函数 `(item, index) => JSX`

`key` 必须是纯且稳定的。JSX `.map()` 被 lowered 成 `For` 时，Essor 可能会把
`key` 提取成独立于渲染回调的函数。在带 key 的 `.map()` block callback 中，
返回 JSX 前的语句也可能为了提取 key 再执行一次。不要在这段 prelude 中修改状态、
递增计数器、调用非幂等函数，或提前返回另一段 JSX。

### 示例

```tsx
function TodoList() {
  const $todos = [
    { id: 1, text: 'Learn Essor' },
    { id: 2, text: 'Write docs' },
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

### 使用 fallback

```tsx
<For each={$items} key={(item) => item.id} fallback={<p>No data</p>}>
  {(item) => <div>{item.name}</div>}
</For>
```

### 性能特点

- 使用最长递增子序列（LIS）算法优化元素移动
- 为每个列表项创建独立的作用域，确保状态隔离
- 支持原地更新、添加、删除和重排序

## Fragment

渲染多个子节点而不需要包装 DOM 节点。

```tsx
import { Fragment } from '@estjs/template';

function List() {
  return (
    <Fragment>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </Fragment>
  );
}
```

你也可以使用 `<>...</>` JSX 简写：

```tsx
function List() {
  return (
    <>
      <li>Item 1</li>
      <li>Item 2</li>
    </>
  );
}
```

## Portal

将子节点渲染到指定的 DOM 节点中，常用于模态框、下拉菜单和工具提示。

```tsx
import { Portal } from '@estjs/template';

function Modal({ children }) {
  return (
    <Portal mount={document.body}>
      <div class="modal-overlay">{children}</div>
    </Portal>
  );
}
```

### Props

- `mount` — 目标 DOM 节点
- `children` — 要渲染的内容
- `useShadow` — 是否使用 Shadow DOM

## Suspense

管理异步加载状态，在异步资源加载期间显示 fallback UI。

```tsx
import { Suspense } from '@estjs/template';

function AsyncPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AsyncData />
    </Suspense>
  );
}
```

当被 `Suspense` 包裹的组件或资源发起异步请求时，fallback 会自动显示。所有异步操作完成后，实际内容会被渲染。

## createResource

创建异步数据资源，与 `Suspense` 配合实现优雅的异步状态管理。

```ts
function createResource<T>(
  source: () => any,
  fetcher: (sourceValue: any) => Promise<T>
): Resource<T>;
```

### 返回值

- `value` — 包含解析后数据的 signal
- `loading` — 表示是否正在加载的 signal
- `error` — 包含请求错误的 signal（如果有）
- `state` — 当前状态的 signal（`'pending' | 'ready' | 'error'`）
- `mutate` — 手动更新数据的函数
- `refetch` — 重新发起请求的函数

### 示例

```tsx
import { createResource } from '@estjs/template';

function UserProfile({ userId }) {
  const user = createResource(() => userId, async (id) => {
    const res = await fetch(`/api/users/${id}`);
    return res.json();
  });

  return (
    <div>
      {user.loading() ? (
        <p>Loading...</p>
      ) : user.error() ? (
        <p>Error: {user.error().message}</p>
      ) : (
        <div>
          <h1>{user.value().name}</h1>
          <p>{user.value().email}</p>
        </div>
      )}
    </div>
  );
}
```

### 手动刷新

```tsx
<button onClick={() => user.refetch()}>Refresh</button>
```

### 手动修改

```tsx
user.mutate({ name: 'New Name', email: 'new@example.com' });
```

## 类型定义

```ts
interface Resource<T> {
  value: () => T;
  loading: () => boolean;
  error: () => any;
  state: () => 'pending' | 'ready' | 'error';
  mutate: (value: T) => void;
  refetch: () => void;
}
```
